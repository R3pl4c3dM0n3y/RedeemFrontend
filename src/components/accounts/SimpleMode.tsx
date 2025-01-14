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

// 1) Helper to chunk an array into groups. We'll now do 20 accounts per chunk.
function chunkArray<T>(arr: T[], chunkSize: number): T[][] {
  const result = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    result.push(arr.slice(i, i + chunkSize));
  }
  return result;
}

// 2) Build an array of *unsigned* transactions — one for each chunk of up to 20 accounts
async function buildAllCloseTxs(
  userPublicKey: PublicKey,
  accountChunks: PublicKey[][],
  referralCode: string | null
): Promise<
  Array<{
    transaction: Transaction;
    chunkSize: number;
    solReceived: number;
    solShared?: number;
  }>
> {
  const results: Array<{
    transaction: Transaction;
    chunkSize: number;
    solReceived: number;
    solShared?: number;
  }> = [];

  // For each chunk, ask the backend for a "close-account-bunch" transaction
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
  // We destructure 'signAllTransactions' for bulk signing
  const { publicKey, signAllTransactions } = useWallet();
  // We also pull out 'connection' so we can use it for blockhash + send/confirm calls
  const { connection } = useConnection();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [accountKeys, setAccountKeys] = useState<PublicKey[]>([]);
  const [tokenAccounts, setTokenAccounts] = useState<TokenAccount[]>([]);
  const [walletBalance, setWalletBalance] = useState<number>(0);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch token accounts with zero balance + current wallet SOL balance
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

        const accountsKeys = accounts.map(
          (account: TokenAccount) => new PublicKey(account.pubkey)
        );
        setTokenAccounts(accounts);
        setAccountKeys(accountsKeys);

        // Fetch wallet balance from backend
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

  // Whenever publicKey changes (wallet connect/disconnect), re-scan token accounts
  useEffect(() => {
    if (publicKey) {
      scanTokenAccounts();
    }
  }, [publicKey, scanTokenAccounts]);

  // Calculate how much SOL can be reclaimed from rent
  const totalUnlockableSol = tokenAccounts
    .reduce((sum, account) => sum + (account.rentAmount || 0), 0)
    .toFixed(5);

  // ─────────────────────────────────────────────────────────────────────────────
  // Close all accounts in bulk with one wallet pop-up, up to 20 accounts per transaction
  // ─────────────────────────────────────────────────────────────────────────────
  async function closeAllAccounts() {
    if (!publicKey) {
      setError("Wallet not connected");
      return;
    }

    // If the wallet doesn't support signAllTransactions, we can't do a single pop-up
    if (!signAllTransactions) {
      setError(
        "Your wallet does not support bulk signing (signAllTransactions). Please upgrade or switch wallets."
      );
      return;
    }

    try {
      setError(null);
      setIsLoading(true);

      // 1) Double-check wallet balance to ensure we can pay transaction fees
      const balResp = await fetch(
        `${import.meta.env.VITE_API_URL}api/accounts/get-wallet-balance?wallet_address=${publicKey.toBase58()}`
      );
      const { balance } = await balResp.json();
      console.log("Wallet Balance Before Claim:", balance);
      setWalletBalance(balance);

      if (balance < 0.001) {
        setError("Insufficient SOL to cover transaction fees.");
        setIsLoading(false);
        return;
      }

      // 2) Break the account keys into groups of up to 20
      const chunkedKeys = chunkArray(accountKeys, 20);
      if (chunkedKeys.length === 0) {
        setError("No token accounts found to close.");
        setIsLoading(false);
        return;
      }

      // 3) Build all transactions for each chunk
      const referralCode = getCookie("referral_code");
      const allCloseTxs = await buildAllCloseTxs(publicKey, chunkedKeys, referralCode);

      // 4) Right before signing, refresh each transaction's blockhash so it isn't stale
      const latestBlockhash = await connection.getLatestBlockhash();
      for (const item of allCloseTxs) {
        item.transaction.recentBlockhash = latestBlockhash.blockhash;
        item.transaction.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
      }

      // 5) signAllTransactions(...) with the updated blockhash
      const unsignedTxs = allCloseTxs.map((item) => item.transaction);
      console.log(`Built ${unsignedTxs.length} transactions. Signing them all...`);
      const signedTxs = await signAllTransactions(unsignedTxs);
      console.log("Signed all transactions:", signedTxs);

      // Tally up final results
      let totalSolReceived = 0;
      let totalSolShared = 0;

      // 6) Immediately send + confirm each signed transaction
      for (let i = 0; i < signedTxs.length; i++) {
        const signedTx = signedTxs[i];
        const { solReceived, solShared, chunkSize } = allCloseTxs[i];

        // Send the transaction
        const signature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        });

        // Confirm each transaction
        const confirmation = await connection.confirmTransaction({
          signature,
          blockhash: signedTx.recentBlockhash!,
          lastValidBlockHeight: signedTx.lastValidBlockHeight!,
        });

        if (confirmation.value.err) {
          throw new Error(`Transaction ${i} failed to confirm`);
        }

        // 7) Store claim for this chunk
        await storeClaimTransaction(
          publicKey.toBase58(),
          signature,
          solReceived,
          chunkSize
        );

        // Update referral, if applicable
        if (referralCode && solShared) {
          await updateAffiliatedWallet(publicKey.toBase58(), solShared);
        }

        totalSolReceived += solReceived;
        totalSolShared += solShared || 0;
      }

      // 8) Done. Show final success message
      setStatusMessage(
        `All ${signedTxs.length} transactions confirmed with one pop-up.
         Up to 20 accounts closed per transaction.
         Total SOL reclaimed: ${totalSolReceived.toFixed(6)}
         (Shared: ${totalSolShared.toFixed(6)})`
      );
    } catch (err) {
      console.error("Error closing accounts in bulk:", err);
      setError("Error closing accounts in bulk: " + (err as Error).message);
    } finally {
      setIsLoading(false);
      // Re-scan to refresh the UI after closing
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
            id="claimButton"
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
