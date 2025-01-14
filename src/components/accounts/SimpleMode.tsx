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

/** 
 * (Optional) For typed response from closeAccountBunchTransaction
 */
interface CloseBunchResponse {
  transaction: Transaction;
  solReceived: number;
  solShared?: number;
  processedAccounts?: string[];
}

/**
 * For chunking up to ~70 accounts at a time
 */
function chunkArray<T>(arr: T[], chunkSize: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    result.push(arr.slice(i, i + chunkSize));
  }
  return result;
}

function SimpleMode() {
  const { publicKey, signAllTransactions } = useWallet();
  const { connection } = useConnection();

  const [tokenAccounts, setTokenAccounts] = useState<TokenAccount[]>([]);
  const [accountKeys, setAccountKeys] = useState<PublicKey[]>([]);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  /** 
   * Load all zero-balance token accounts + current SOL balance
   */
  const scanTokenAccounts = useCallback(
    async (forceReload: boolean = false) => {
      if (!publicKey) {
        setError("Wallet not connected");
        return;
      }
      try {
        setError(null);
        console.log("Fetching token accounts...");

        // 1) Grab zero-balance token accounts
        const accounts = await getAccountsWithoutBalanceFromAddress(
          publicKey,
          forceReload
        );
        console.log("Token accounts fetched:", accounts);

        // 2) Convert them to PublicKey objects
        const accountKeys = accounts.map(
          (acct: TokenAccount) => new PublicKey(acct.pubkey)
        );
        setTokenAccounts(accounts);
        setAccountKeys(accountKeys);

        // 3) Grab SOL wallet balance
        const resp = await fetch(
          `${
            import.meta.env.VITE_API_URL
          }api/accounts/get-wallet-balance?wallet_address=${publicKey.toBase58()}`
        );
        const data = await resp.json();
        console.log("Fetched Wallet Balance:", data.balance);
        setWalletBalance(data.balance);
      } catch (err) {
        console.error("Error fetching token accounts:", err);
        setError("Failed to fetch token accounts.");
      }
    },
    [publicKey]
  );

  /** 
   * On mount or whenever publicKey changes
   */
  useEffect(() => {
    if (publicKey) {
      scanTokenAccounts();
    }
  }, [publicKey, scanTokenAccounts]);

  /**
   * Compute total rent SOL from these zero-balance accounts
   */
  const totalUnlockableSol = tokenAccounts
    .reduce((sum, acct) => sum + (acct.rentAmount || 0), 0)
    .toFixed(5);

  /**
   * 1) Chunk the accounts (70 each).
   * 2) Ask backend for multiple transactions.
   * 3) signAllTransactions -> user sees one pop-up.
   * 4) send + confirm each transaction, with fallback check for blockhash expiry.
   */
  async function closeAllAccounts() {
    if (!publicKey) {
      setError("Wallet not connected");
      return;
    }
    if (!signAllTransactions) {
      setError("Your wallet does not support signAllTransactions.");
      return;
    }

    try {
      setError(null);
      setIsLoading(true);

      // Double-check user’s SOL balance for fees
      const balResp = await fetch(
        `${
          import.meta.env.VITE_API_URL
        }api/accounts/get-wallet-balance?wallet_address=${publicKey.toBase58()}`
      );
      const { balance } = await balResp.json();
      console.log("Wallet Balance Before Claim:", balance);
      setWalletBalance(balance);
      if (balance < 0.001) {
        setError("Insufficient SOL to cover transaction fees.");
        setIsLoading(false);
        return;
      }

      if (accountKeys.length === 0) {
        setError("No token accounts found to close.");
        setIsLoading(false);
        return;
      }

      // Chunk the accounts
      const chunkedKeys = chunkArray(accountKeys, 70);
      console.log(`Chunked into ${chunkedKeys.length} sets for up to 70 each.`);

      // Build all “bunch” transactions from the backend
      const referralCode = getCookie("referral_code");
      const allCloseTxs: {
        transaction: Transaction;
        solReceived: number;
        solShared?: number;
        chunkSize: number;
      }[] = [];

      for (const chunk of chunkedKeys) {
        const response = (await closeAccountBunchTransaction(
          publicKey,
          chunk,
          referralCode
        )) as CloseBunchResponse;

        allCloseTxs.push({
          transaction: response.transaction,
          solReceived: response.solReceived,
          solShared: response.solShared,
          chunkSize: chunk.length,
        });
      }

      // Extract the raw transaction objects in an array
      const unsignedTxs = allCloseTxs.map((item) => item.transaction);

      // Bulk sign
      console.log(`Signing ${unsignedTxs.length} transactions at once...`);
      const signedTxs = await signAllTransactions(unsignedTxs);

      let totalSolReceived = 0;
      let totalSolShared = 0;

      // Now send + confirm each transaction
      for (let i = 0; i < signedTxs.length; i++) {
        const signedTx = signedTxs[i];
        const { solReceived, solShared, chunkSize } = allCloseTxs[i];

        // Use const here to avoid the eslint "prefer-const" warning
        const signature = await connection.sendRawTransaction(
          signedTx.serialize(),
          {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          }
        );

        try {
          // 2) Confirm
          const confirmation = await connection.confirmTransaction({
            signature,
            blockhash: signedTx.recentBlockhash!,
            lastValidBlockHeight: signedTx.lastValidBlockHeight!,
          });
          if (confirmation.value.err) {
            throw new Error(`Transaction ${i} failed: ${confirmation.value.err}`);
          }
        } catch (err) {
          // ─────────────────────────────────────────────────────────────────
          // Fallback: Possibly “TransactionExpiredBlockheightExceededError”
          // ─────────────────────────────────────────────────────────────────
          if (
            err instanceof Error &&
            err.message.includes("TransactionExpiredBlockheightExceededError")
          ) {
            console.warn(`Tx ${i}: blockhash expired. Checking chain for success...`);
            const txInfo = await connection.getTransaction(signature, {
              commitment: "confirmed",
            });
            if (txInfo && !txInfo.meta?.err) {
              console.log(`Tx ${i}: found success on chain despite blockhash expiry.`);
            } else {
              // Not found => truly fail
              throw new Error(`Tx ${i} not found on chain => blockhash expired.`);
            }
          } else {
            throw err; // rethrow other errors
          }
        }

        // If we get here, transaction is considered successful
        await storeClaimTransaction(
          publicKey.toBase58(),
          signature,
          solReceived,
          chunkSize
        );

        if (referralCode && solShared) {
          await updateAffiliatedWallet(publicKey.toBase58(), solShared);
          totalSolShared += solShared;
        }
        totalSolReceived += solReceived;
      }

      // Final success message
      setStatusMessage(
        `All transactions confirmed in one pop-up!
         Closed ${accountKeys.length} accounts
         SOL reclaimed: ${totalSolReceived.toFixed(6)}
         (Shared: ${totalSolShared.toFixed(6)})`
      );
    } catch (err) {
      console.error("Error closing accounts in bulk:", err);
      setError("Error closing accounts in bulk: " + (err as Error).message);
    } finally {
      setIsLoading(false);
      // re-scan
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
          Total SOL to unlock:{" "}
          <span className="gradient-text">{totalUnlockableSol} SOL</span>
        </p>
      </div>

      {tokenAccounts.length > 0 && (
        <div className="claim-all-wrapper">
          <button
            className="cta-button"
            onClick={closeAllAccounts}
            disabled={isLoading}
          >
            {!isLoading ? "Claim All SOL" : <div className="loading-circle"></div>}
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
