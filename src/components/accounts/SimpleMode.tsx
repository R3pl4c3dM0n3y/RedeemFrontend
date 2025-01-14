import { useCallback, useState, useEffect } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import "./AccountsScanner.css";
import { TokenAccount } from "../../interfaces/TokenAccount";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  closeAccountBunchTransaction,
  getAccountsWithoutBalanceFromAddress,
} from "../../api/accounts";
import { Message, MessageState } from "../Message";
import { storeClaimTransaction } from "../../api/claimTransactions";
import { getCookie } from "../../utils/cookies";
import { updateAffiliatedWallet } from "../../api/affiliation";

// 1) Helper to chunk an array of items into groups of 'chunkSize'
function chunkArray<T>(arr: T[], chunkSize: number): T[][] {
  const result = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    result.push(arr.slice(i, i + chunkSize));
  }
  return result;
}

// 2) Build an array of *unsigned* transactions for each chunk,
//    so we can sign them all at once with signAllTransactions.
async function buildAllCloseTxs(
  userPublicKey: PublicKey,
  accountChunks: PublicKey[][],
  referralCode: string | null
): Promise<Array<{
  transaction: Transaction;
  chunkSize: number;
  solReceived: number;
  solShared?: number;
}>> {
  const results: Array<{
    transaction: Transaction;
    chunkSize: number;
    solReceived: number;
    solShared?: number;
  }> = [];

  // For each chunk of up to 3 accounts, request a transaction from the backend
  for (const chunk of accountChunks) {
    const { transaction, solReceived, solShared } =
      await closeAccountBunchTransaction(userPublicKey, chunk, referralCode);

    results.push({
      transaction,
      chunkSize: chunk.length,
      solReceived,
      solShared,
    });
  }
  return results;
}

function SimpleMode() {
  // 3) We destructure 'signAllTransactions' here
  //    If your wallet supports it (Phantom, Solflare, etc.), it'll be available.
  const { publicKey, signAllTransactions } = useWallet();
  const { connection } = useConnection();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [accountKeys, setAccountKeys] = useState<PublicKey[]>([]);
  const [tokenAccounts, setTokenAccounts] = useState<TokenAccount[]>([]);
  const [walletBalance, setWalletBalance] = useState<number>(0);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch accounts with zero balance, plus the current SOL balance
  // ─────────────────────────────────────────────────────────────────────────────
  const scanTokenAccounts = useCallback(
    async (forceReload: boolean = false) => {
      if (!publicKey) {
        setError("Wallet not connected");
        return;
      }
      try {
        setError(null);
        console.log("Fetching token accounts...");

        const accounts = await getAccountsWithoutBalanceFromAddress(
          publicKey,
          forceReload
        );
        console.log("Token accounts fetched:", accounts);

        const accountPubkeys = accounts.map(
          (account: TokenAccount) => new PublicKey(account.pubkey)
        );
        setTokenAccounts(accounts);
        setAccountKeys(accountPubkeys);

        // Fetch wallet balance from the backend
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}api/accounts/get-wallet-balance?wallet_address=${publicKey.toBase58()}`
        );
        const data = await response.json();
        console.log("Fetched Wallet Balance:", data.balance);

        setWalletBalance(data.balance);
      } catch (err) {
        console.error("Error fetching token accounts:", err);
        setError("Failed to fetch token accounts.");
      }
    },
    [publicKey]
  );

  useEffect(() => {
    if (publicKey) {
      scanTokenAccounts();
    }
  }, [publicKey, scanTokenAccounts]);

  // Dynamically sum the total "rent" that can be reclaimed
  const totalUnlockableSol = tokenAccounts
    .reduce((sum, account) => sum + (account.rentAmount || 0), 0)
    .toFixed(5);

  // ─────────────────────────────────────────────────────────────────────────────
  // Close all accounts with one wallet pop-up, even though they're chunked
  // ─────────────────────────────────────────────────────────────────────────────
  async function closeAllAccounts() {
    if (!publicKey) {
      setError("Wallet not connected");
      return;
    }

    // signAllTransactions is needed for a single pop-up
    if (!signAllTransactions) {
      setError(
        "Your wallet does not support 'signAllTransactions'. Please switch or update your wallet."
      );
      return;
    }

    try {
      setError(null);
      setIsLoading(true);

      // 1) Check the user's balance to ensure there's enough SOL for fees
      const resp = await fetch(
        `${import.meta.env.VITE_API_URL}api/accounts/get-wallet-balance?wallet_address=${publicKey.toBase58()}`
      );
      const { balance } = await resp.json();
      console.log("Wallet Balance Before Claim:", balance);
      setWalletBalance(balance);

      if (balance < 0.001) {
        setError("Insufficient SOL to cover transaction fees.");
        setIsLoading(false);
        return;
      }

      // 2) Chunk the accounts to avoid transaction-size limits
      const chunkedAccountKeys = chunkArray(accountKeys, 3);
      if (chunkedAccountKeys.length === 0) {
        setError("No token accounts found to close.");
        setIsLoading(false);
        return;
      }

      // 3) Build all transactions for each chunk (but don't sign them yet)
      const referralCode = getCookie("referral_code");
      const allCloseTxs = await buildAllCloseTxs(
        publicKey,
        chunkedAccountKeys,
        referralCode
      );

      // 4) Extract just the Transaction objects
      const unsignedTxs = allCloseTxs.map((item) => item.transaction);

      console.log(`Built ${unsignedTxs.length} transactions. Signing them all...`);

      // 5) Sign all transactions at once (one user approval)
      const signedTxs = await signAllTransactions(unsignedTxs);
      console.log("Signed all transactions:", signedTxs);

      // We'll track total SOL across all chunks
      let totalSolReceived = 0;
      let totalSolShared = 0;

      // 6) Now send + confirm each signed transaction in sequence
      for (let i = 0; i < signedTxs.length; i++) {
        const signedTx = signedTxs[i];
        const { solReceived, solShared, chunkSize } = allCloseTxs[i];

        // Ensure blockhash is set
        if (!signedTx.recentBlockhash) {
          const latestBlockhash = await connection.getLatestBlockhash();
          signedTx.recentBlockhash = latestBlockhash.blockhash;
          signedTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
        }

        // Send the transaction
        const signature = await connection.sendRawTransaction(
          signedTx.serialize(),
          {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          }
        );

        // Confirm
        const confirmation = await connection.confirmTransaction({
          signature,
          blockhash: signedTx.recentBlockhash!,
          lastValidBlockHeight: signedTx.lastValidBlockHeight!,
        });

        if (confirmation.value.err) {
          throw new Error(`Transaction ${i} failed to confirm`);
        }

        // 7) Store claim data for this chunk
        await storeClaimTransaction(
          publicKey.toBase58(),
          signature,
          solReceived,
          chunkSize
        );

        // If there's a referral, update it
        if (referralCode && solShared) {
          await updateAffiliatedWallet(publicKey.toBase58(), solShared);
        }

        // Keep track of totals
        totalSolReceived += solReceived;
        if (solShared) totalSolShared += solShared;
      }

      // 8) Done. Show final success message
      setStatusMessage(
        `All ${signedTxs.length} transactions confirmed with ONE pop-up! 
         Total SOL reclaimed: ${totalSolReceived.toFixed(6)}
         (Shared: ${totalSolShared.toFixed(6)})`
      );
    } catch (err) {
      console.error("Error closing accounts in bulk:", err);
      setError("Error closing accounts in bulk: " + (err as Error).message);
    } finally {
      setIsLoading(false);
      // Re-scan to update UI
      scanTokenAccounts(true);
    }
  }

  return (
    <section>
      <div className="accounts-info-wrapper smooth-appear">
        <p>
          Wallet Balance:{" "}
          <span className="gradient-text">{walletBalance.toFixed(5)} SOL</span>
        </p>
        <p>
          Accounts to close:{" "}
          <span className="gradient-text">{tokenAccounts.length}</span>
        </p>
        <p>
          Total sol to unlock:{" "}
          <span className="gradient-text">{totalUnlockableSol} SOL</span>
        </p>
      </div>

      {tokenAccounts.length > 0 && (
        <div className="claim-all-wrapper">
          <button
            id="claimButton"
            className="cta-button"
            onClick={closeAllAccounts}
            disabled={isLoading}
          >
            {!isLoading ? "Claim All Sol" : <div className="loading-circle"></div>}
          </button>
        </div>
      )}

      {statusMessage && !error && (
        <Message state={MessageState.SUCCESS}>
          <p>{statusMessage}</p>
        </Message>
      )}

      {error && (
        <Message state={MessageState.ERROR}>
          <p>{error}</p>
        </Message>
      )}
    </section>
  );
}

export default SimpleMode;
