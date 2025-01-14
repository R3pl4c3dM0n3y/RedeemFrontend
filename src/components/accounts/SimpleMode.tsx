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

/** For the backend response. */
interface CloseBunchResponse {
  transaction: Transaction;
  solReceived: number;
  solShared?: number;
  processedAccounts?: string[];
}

/** Helper: chunk an array into sub-arrays of up to chunkSize. */
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

  /** Load zero-balance token accounts + wallet SOL balance. */
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

        const accountPks = accounts.map(
          (acct: TokenAccount) => new PublicKey(acct.pubkey)
        );
        setTokenAccounts(accounts);
        setAccountKeys(accountPks);

        const balResp = await fetch(
          `${
            import.meta.env.VITE_API_URL
          }api/accounts/get-wallet-balance?wallet_address=${publicKey.toBase58()}`
        );
        const data = await balResp.json();
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

  const totalUnlockableSol = tokenAccounts
    .reduce((sum, acct) => sum + (acct.rentAmount || 0), 0)
    .toFixed(5);

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

      // 1) Check user’s SOL balance
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

      // 2) chunk the accounts
      const chunkedKeys = chunkArray(accountKeys, 70);
      console.log(`Chunked into ${chunkedKeys.length} sets for up to 70 each.`);

      // 3) Build the transactions from backend
      const referralCode = getCookie("referral_code");
      const closeTxs: {
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
        closeTxs.push({
          transaction: response.transaction,
          solReceived: response.solReceived,
          solShared: response.solShared,
          chunkSize: chunk.length,
        });
      }

      // 4) signAllTransactions
      const unsignedTxs = closeTxs.map((c) => c.transaction);
      console.log(`Signing ${unsignedTxs.length} transactions at once...`);
      const signedTxs = await signAllTransactions(unsignedTxs);

      let totalSolReceived = 0;
      let totalSolShared = 0;

      // 5) send + confirm each signed transaction
      for (let i = 0; i < signedTxs.length; i++) {
        const signedTx = signedTxs[i];
        const { solReceived, solShared, chunkSize } = closeTxs[i];

        // A) Send
        const signature = await connection.sendRawTransaction(
          signedTx.serialize(),
          {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          }
        );

        // B) Confirm
        try {
          const confirmation = await connection.confirmTransaction({
            signature,
            blockhash: signedTx.recentBlockhash!,
            lastValidBlockHeight: signedTx.lastValidBlockHeight!,
          });
          if (confirmation.value.err) {
            throw new Error(`Transaction ${i} failed: ${confirmation.value.err}`);
          }
        } catch (err) {
          if (
            err instanceof Error &&
            err.message.includes("TransactionExpiredBlockheightExceededError")
          ) {
            console.warn(
              `Tx ${i} blockhash expired. Checking chain for success...`
            );
            const txInfo = await connection.getTransaction(signature, {
              commitment: "confirmed",
            });
            if (txInfo && !txInfo.meta?.err) {
              console.log(
                `Tx ${i} => found success on chain despite blockhash expiry.`
              );
            } else {
              throw new Error(
                `Tx ${i} => blockhash expired, not found on chain => fail.`
              );
            }
          } else {
            throw err;
          }
        }

        // If we reach here => success
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

      // 6) Final success
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
      // Re-scan
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
