import { useCallback, useState, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";
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

// ─────────────────────────────────────────────────────────────────────────────
// 1) NEW: Helper function to chunk an array into groups of a specified size.
//    We'll use this to break the accounts into batches of three.
// ─────────────────────────────────────────────────────────────────────────────
function chunkArray<T>(arr: T[], chunkSize: number): T[][] {
  const result = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    result.push(arr.slice(i, i + chunkSize));
  }
  return result;
}

function SimpleMode() {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [accountKeys, setAccountKeys] = useState<PublicKey[]>([]);
  const [tokenAccounts, setTokenAccounts] = useState<TokenAccount[]>([]);
  const [walletBalance, setWalletBalance] = useState<number>(0);

  // Fetch accounts and wallet balance
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

        const accounts_keys = accounts.map(
          (account: TokenAccount) => new PublicKey(account.pubkey)
        );
        setTokenAccounts(accounts);
        setAccountKeys(accounts_keys);

        // Fetch wallet balance from backend
        const response = await fetch(
          `${
            import.meta.env.VITE_API_URL
          }api/accounts/get-wallet-balance?wallet_address=${publicKey.toBase58()}`
        );
        const data = await response.json();
        console.log("Fetched Wallet Balance:", data.balance);

        setWalletBalance(data.balance); // Update wallet balance state
      } catch (err) {
        console.error("Error fetching token accounts:", err);
        setError("Failed to fetch token accounts.");
      }
    },
    [publicKey]
  );

  // Calculate total unlockable SOL dynamically
  const totalUnlockableSol = tokenAccounts
    .reduce((sum, account) => sum + (account.rentAmount || 0), 0)
    .toFixed(5);
  console.log("Token accounts in frontend:", tokenAccounts);

  useEffect(() => {
    if (publicKey) {
      scanTokenAccounts();
    }
  }, [publicKey, scanTokenAccounts]);

  // ─────────────────────────────────────────────────────────────────────────────
  // 2) MODIFIED: closeAllAccounts now splits the accounts into groups of three.
  //    It loops through each group, requests a transaction, signs, sends,
  //    confirms, and logs the result. This ensures we avoid transaction size
  //    limits if the user has many accounts.
  // ─────────────────────────────────────────────────────────────────────────────
  async function closeAllAccounts() {
    if (!publicKey) {
      setError("Wallet not connected");
      return;
    }
    if (!signTransaction) {
      throw new Error("Error signing transaction");
    }

    try {
      setError(null);
      setIsLoading(true);

      // Fetch wallet balance before initiating the claim
      const response = await fetch(
        `${
          import.meta.env.VITE_API_URL
        }api/accounts/get-wallet-balance?wallet_address=${publicKey.toBase58()}`
      );
      const { balance } = await response.json();
      console.log("Wallet Balance Before Claim:", balance);
      setWalletBalance(balance);

      if (balance < 0.001) {
        setError("Insufficient SOL to cover transaction fees.");
        setIsLoading(false);
        return;
      }

      // Get referral code (if any)
      const code = getCookie("referral_code");

      // Break all the accountKeys into batches of three
      const chunkedAccountKeys = chunkArray(accountKeys, 3);

      // Track cumulative SOL received and shared for the final summary
      let totalSolReceived = 0;
      let totalSolShared = 0;

      // Process each chunk in sequence
      for (let i = 0; i < chunkedAccountKeys.length; i++) {
        const chunk = chunkedAccountKeys[i];
        console.log(
          `Closing chunk ${i + 1} of ${chunkedAccountKeys.length}:`,
          chunk
        );

        // Request transaction from the backend for just this chunk of 3 (or fewer)
        const { transaction, solReceived, solShared } =
          await closeAccountBunchTransaction(publicKey, chunk, code);

        // Sign the transaction
        const signedTransaction = await signTransaction(transaction);

        // Ensure we have a recent blockhash
        let blockhash = transaction.recentBlockhash;
        let lastValidBlockHeight = transaction.lastValidBlockHeight;

        if (!blockhash || !lastValidBlockHeight) {
          const latestBlockhash = await connection.getLatestBlockhash();
          transaction.recentBlockhash = latestBlockhash.blockhash;
          transaction.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
          blockhash = transaction.recentBlockhash;
          lastValidBlockHeight = transaction.lastValidBlockHeight;
        }

        // Send the transaction
        const signature = await connection.sendRawTransaction(
          signedTransaction.serialize(),
          {
            // Setting skipPreflight to false is better for debugging
            skipPreflight: false,
            preflightCommitment: "confirmed",
          }
        );

        // Confirm the transaction
        const confirmation = await connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight,
        });

        if (confirmation.value.err) {
          throw new Error("Transaction failed to confirm");
        }

        // Store claim transaction in the DB
        await storeClaimTransaction(
          publicKey.toBase58(),
          signature,
          solReceived,
          chunk.length
        );

        // Update the affiliated wallet if needed
        if (code && solShared) {
          await updateAffiliatedWallet(publicKey.toBase58(), solShared);
        }

        // Keep track of the total SOL across all chunks
        if (solReceived) totalSolReceived += solReceived;
        if (solShared) totalSolShared += solShared;
      }

      // Show a final success message after all chunks are processed
      setStatusMessage(
        `All accounts closed in ${chunkedAccountKeys.length} transactions.
        Total SOL reclaimed: ${totalSolReceived.toFixed(6)}
        (Shared: ${totalSolShared.toFixed(6)})`
      );
    } catch (err) {
      console.error("Error closing accounts in chunks:", err);
      setError("Error closing accounts in chunks.");
    } finally {
      setIsLoading(false);
      // Refresh accounts and balance
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
