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
 * Data structure for each chunked transaction returned by buildAllCloseTxs.
 */
interface CloseTxData {
  transaction: Transaction;
  chunkSize: number;
  solReceived: number;
  solShared?: number;
}

/**
 * (Optional) type for the backend response of closeAccountBunchTransaction
 */
interface CloseBunchResponse {
  transaction: Transaction;
  solReceived: number;
  solShared?: number;
  processedAccounts?: string[];
}

/** 
 * Helper to chunk an array into sub-arrays of up to `chunkSize`
 * (Here, we do ~70 accounts per transaction).
 */
function chunkArray<T>(arr: T[], chunkSize: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    result.push(arr.slice(i, i + chunkSize));
  }
  return result;
}

/**
 * Build multiple "bunch" transactions from your backend 
 * (one transaction per chunk, up to 70 accounts each).
 */
async function buildAllCloseTxs(
  userPublicKey: PublicKey,
  chunkedAccountKeys: PublicKey[][],
  referralCode: string | null
): Promise<CloseTxData[]> {
  const results: CloseTxData[] = [];
  for (const chunk of chunkedAccountKeys) {
    // Ask your backend for a transaction that closes this chunk
    const response = (await closeAccountBunchTransaction(
      userPublicKey,
      chunk,
      referralCode
    )) as CloseBunchResponse;

    const { transaction, solReceived, solShared } = response;
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
  const { publicKey, signAllTransactions } = useWallet();
  const { connection } = useConnection();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [accountKeys, setAccountKeys] = useState<PublicKey[]>([]);
  const [tokenAccounts, setTokenAccounts] = useState<TokenAccount[]>([]);
  const [walletBalance, setWalletBalance] = useState<number>(0);

  /**
   * Fetch accounts with zero balance + the current SOL wallet balance.
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
        // 1) Grab accounts with zero balance
        const accounts = await getAccountsWithoutBalanceFromAddress(
          publicKey,
          forceReload
        );
        console.log("Token accounts fetched:", accounts);

        // 2) Convert them to PublicKey objects
        const accountsKeys = accounts.map((acct) => new PublicKey(acct.pubkey));
        setTokenAccounts(accounts);
        setAccountKeys(accountsKeys);

        // 3) Fetch wallet SOL balance
        const resp = await fetch(
          `${import.meta.env.VITE_API_URL}api/accounts/get-wallet-balance?wallet_address=${publicKey.toBase58()}`
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

  useEffect(() => {
    if (publicKey) {
      scanTokenAccounts();
    }
  }, [publicKey, scanTokenAccounts]);

  // Sum up all rentAmount from the tokenAccounts for user display
  const totalUnlockableSol = tokenAccounts
    .reduce((sum, acct) => sum + (acct.rentAmount || 0), 0)
    .toFixed(5);

  /**
   * Close all zero-balance accounts in one or multiple transactions.
   * We chunk them up to 70 accounts per transaction for reliability.
   */
  async function closeAllAccounts() {
    if (!publicKey) {
      setError("Wallet not connected");
      return;
    }
    if (!signAllTransactions) {
      setError("Your wallet does not support bulk signing (signAllTransactions).");
      return;
    }

    try {
      setError(null);
      setIsLoading(true);

      // 1) Double-check wallet balance
      const balanceResp = await fetch(
        `${import.meta.env.VITE_API_URL}api/accounts/get-wallet-balance?wallet_address=${publicKey.toBase58()}`
      );
      const { balance } = await balanceResp.json();
      console.log("Wallet Balance Before Claim:", balance);
      setWalletBalance(balance);

      // If they do not have enough SOL to pay fees, exit
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

      // 2) Chunk accounts up to 70 each
      const chunkedKeys = chunkArray(accountKeys, 70);
      console.log(`Chunked into ${chunkedKeys.length} sets (up to 70 each).`);

      // 3) Build all "bunch" transactions
      const referralCode = getCookie("referral_code");
      const allCloseTxs = await buildAllCloseTxs(publicKey, chunkedKeys, referralCode);

      // 4) Bulk-sign all the transactions in one user pop-up
      const unsignedTxs = allCloseTxs.map((txInfo) => txInfo.transaction);
      const signedTxs = await signAllTransactions(unsignedTxs);

      let totalSolReceived = 0;
      let totalSolShared = 0;

      // 5) Send + confirm each transaction in a loop
      for (let i = 0; i < signedTxs.length; i++) {
        const signedTx = signedTxs[i];
        const { solReceived, solShared, chunkSize } = allCloseTxs[i];

        let signature = "";
        try {
          // A) Send the transaction
          signature = await connection.sendRawTransaction(signedTx.serialize(), {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          });

          // B) Confirm
          const confirmation = await connection.confirmTransaction({
            signature,
            blockhash: signedTx.recentBlockhash!,
            lastValidBlockHeight: signedTx.lastValidBlockHeight!,
          });

          if (confirmation.value.err) {
            throw new Error(
              `Transaction ${i} failed: ${confirmation.value.err}`
            );
          }
        } catch (err) {
          // ─────────────────────────────────────────────────────────
          // Check if blockhash expired but the chain might still have it
          // ─────────────────────────────────────────────────────────
          if (
            err instanceof Error &&
            err.message.includes("TransactionExpiredBlockheightExceededError")
          ) {
            console.warn("Blockhash expired. Checking chain for success...");
            const txInfo = await connection.getTransaction(signature, {
              commitment: "confirmed",
            });

            if (txInfo && !txInfo.meta?.err) {
              console.log(
                `Transaction ${i} actually succeeded despite blockhash expiry.`
              );
            } else {
              throw new Error(
                `Transaction ${i} blockhash expired and not found on chain.`
              );
            }
          } else {
            throw err; // rethrow any other error
          }
        }

        // If we reach here, the transaction is successful
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

      // 6) Final success message
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
      // re-scan to refresh the UI
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
