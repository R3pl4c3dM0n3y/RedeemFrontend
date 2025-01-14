import {
  createBurnInstruction,
  createCloseAccountInstruction,
  getAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  // ComputeBudgetProgram,  <-- REMOVE import or comment out if not needed
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { getCookie } from "../utils/cookies";
import { getAffiliatedWallet } from "../api/affiliation";
import dotenv from "dotenv";

// Constants
const DESTINATION_WALLET = process.env.DESTINATION_WALLET
  ? new PublicKey(process.env.DESTINATION_WALLET)
  : (() => {
      throw new Error(
        "Environment variable DESTINATION_WALLET is not set or invalid"
      );
    })();

const USER_SHARE = 0.65;

// Debugging the API_URL
const API_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}api/accounts`
  : "/api/accounts";

console.log("API_URL:", API_URL);

/**
 * Base Transaction Creator
 * (No longer adds any ComputeBudget instructions here, 
 * to avoid duplicating the backend’s instructions.)
 */
function createBaseTransaction(): Transaction {
  // Simply create a blank transaction.
  // The backend will add setComputeUnitLimit etc.
  return new Transaction();
}

/**
 * Close Account Transaction
 * (If you still need these “frontend side” transaction flows,
 * keep them, but *remove* any references to setComputeUnitLimit.)
 */
export async function closeAccountTransaction(
  connection: Connection,
  userPubKey: PublicKey,
  accountPubKey: PublicKey
): Promise<{ transaction: Transaction; solReceived: number }> {
  if (!userPubKey || !accountPubKey) throw new Error("Params not provided");

  const transaction = createBaseTransaction();
  const { rentAmount, closeInstruction } = await closeAccountInstruction(
    connection,
    userPubKey,
    accountPubKey
  );
  transaction.add(closeInstruction);

  const { userShare, updatedTransaction } =
    await calculateSharesAndAddInstructions(
      transaction,
      connection,
      userPubKey,
      rentAmount
    );

  return { transaction: updatedTransaction, solReceived: userShare / 1e9 };
}

/**
 * Close Account with Balance Transaction
 */
export async function closeAccountWithBalanceTransaction(
  connection: Connection,
  userPubKey: PublicKey,
  accountPubKey: PublicKey
): Promise<{ transaction: Transaction; solReceived: number }> {
  if (!userPubKey || !accountPubKey) throw new Error("Params not provided");

  const transaction = createBaseTransaction();
  const accountInfo = await connection.getAccountInfo(accountPubKey);
  if (!accountInfo) throw new Error("Failed to fetch account info");

  const tokenAccountInfo = await getAccount(connection, accountPubKey);
  const mintAddress = tokenAccountInfo.mint;
  const rentAmount = accountInfo.lamports;
  const tokenBalance = tokenAccountInfo.amount;

  if (tokenBalance === BigInt(0)) throw new Error("Account with 0 balance");

  const associatedTokenAddress = await getAssociatedTokenAddress(
    mintAddress,
    userPubKey
  );
  console.log("Associated Token Address:", associatedTokenAddress.toBase58());

  // Remove or comment out any extra compute instructions here
  // transaction.add(
  //   ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }),
  //   ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }),
  // );

  transaction.add(
    createBurnInstruction(
      accountPubKey,
      mintAddress,
      userPubKey,
      tokenBalance,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  transaction.add(
    createCloseAccountInstruction(
      accountPubKey,
      userPubKey,
      userPubKey,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  const { userShare, updatedTransaction } =
    await calculateSharesAndAddInstructions(
      transaction,
      connection,
      userPubKey,
      rentAmount
    );

  return { transaction: updatedTransaction, solReceived: userShare / 1e9 };
}

/**
 * Close Multiple Accounts Transaction
 */
export async function closeAccountBunchTransaction(
  connection: Connection,
  userPubKey: PublicKey,
  accountPubKeys: PublicKey[]
): Promise<{ transaction: Transaction; solReceived: number }> {
  if (!userPubKey || !accountPubKeys || accountPubKeys.length === 0)
    throw new Error("Params not provided");

  const transaction = createBaseTransaction();
  let totalRentAmount = 0;

  for (const accountPubKey of accountPubKeys) {
    const { rentAmount, closeInstruction } = await closeAccountInstruction(
      connection,
      userPubKey,
      accountPubKey
    );
    totalRentAmount += rentAmount;
    transaction.add(closeInstruction);
  }

  const { userShare, updatedTransaction } =
    await calculateSharesAndAddInstructions(
      transaction,
      connection,
      userPubKey,
      totalRentAmount
    );

  return { transaction: updatedTransaction, solReceived: userShare / 1e9 };
}

/**
 * Helper: Close Account Instruction
 */
async function closeAccountInstruction(
  connection: Connection,
  userPubKey: PublicKey,
  accountPubKey: PublicKey
) {
  const accountInfo = await connection.getAccountInfo(accountPubKey);
  if (!accountInfo) throw new Error("Failed to fetch account info");

  const rentAmount = accountInfo.lamports;
  const closeInstruction = createCloseAccountInstruction(
    accountPubKey,
    userPubKey,
    userPubKey,
    [],
    TOKEN_PROGRAM_ID
  );

  return { rentAmount, closeInstruction };
}

/**
 * Helper: Calculate Shares and Add Instructions
 */
async function calculateSharesAndAddInstructions(
  transaction: Transaction,
  connection: Connection,
  userPubKey: PublicKey,
  rentAmount: number
): Promise<{ userShare: number; updatedTransaction: Transaction }> {
  const userShare = Math.floor(rentAmount * USER_SHARE);
  let destinationShare = rentAmount - userShare;

  const affiliatedWallet = await obtainAffiliatedWallet();
  if (affiliatedWallet) {
    const referralShare = Math.round(
      destinationShare * (affiliatedWallet.share / 100)
    );
    const referralPubKey = new PublicKey(affiliatedWallet.wallet_address);
    const recipientAccountInfo = await connection.getAccountInfo(
      referralPubKey
    );

    if (recipientAccountInfo) {
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: userPubKey,
          toPubkey: referralPubKey,
          lamports: referralShare,
        })
      );
      destinationShare -= referralShare;
    }
  }

  transaction.add(
    SystemProgram.transfer({
      fromPubkey: userPubKey,
      toPubkey: DESTINATION_WALLET,
      lamports: destinationShare,
    })
  );

  console.log("Destination Share Sent:", destinationShare);
  return { userShare, updatedTransaction: transaction };
}

/**
 * Helper: Obtain Affiliated Wallet
 */
async function obtainAffiliatedWallet() {
  const code = getCookie("referral_code");
  if (code) {
    const affiliatedWallet = await getAffiliatedWallet(code);
    return affiliatedWallet;
  }
  return null;
}

dotenv.config();
