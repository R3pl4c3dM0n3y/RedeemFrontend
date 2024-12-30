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

      setWalletBalance(balance); // Update wallet balance state

      if (balance < 0.001) {
        setError("Insufficient SOL to cover transaction fees.");
        setIsLoading(false);
        return;
      }

      const code = getCookie("referral_code");
      const { transaction, solReceived, solShared } =
        await closeAccountBunchTransaction(publicKey, accountKeys, code);

      const signedTransaction = await signTransaction(transaction);

      let blockhash = transaction.recentBlockhash;
      let lastValidBlockHeight = transaction.lastValidBlockHeight;

      if (!blockhash || !lastValidBlockHeight) {
        const latestBlockhash = await connection.getLatestBlockhash();
        transaction.recentBlockhash = latestBlockhash.blockhash;
        transaction.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
        blockhash = transaction.recentBlockhash;
        lastValidBlockHeight = transaction.lastValidBlockHeight;
      }

      // Serialize the signed transaction
      const serializedTransaction = signedTransaction.serialize();
      const signature = await connection.sendRawTransaction(
        serializedTransaction,
        {
          skipPreflight: true,
          preflightCommitment: "confirmed",
        }
      );

      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });

      if (confirmation.value.err) {
        throw new Error("Transaction failed to confirm");
      }

      storeClaimTransaction(
        publicKey.toBase58(),
        signature,
        solReceived,
        accountKeys.length
      );

      if (code && solShared)
        await updateAffiliatedWallet(publicKey.toBase58(), solShared);

      setStatusMessage(`Accounts closed successfully. Signature: ${signature}`);
    } catch (err) {
      console.error("Error closing accounts:", err);
      setError("Error closing accounts.");
    } finally {
      setIsLoading(false);
      scanTokenAccounts(true); // Refresh accounts and balance
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
            {!isLoading ? (
              "Claim All Sol"
            ) : (
              <div className="loading-circle"></div>
            )}
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
