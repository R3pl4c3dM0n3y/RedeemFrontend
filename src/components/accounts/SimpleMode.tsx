// File: src/components/accounts/SimpleMode.tsx
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

/** For typed response from closeAccountBunchTransaction */
interface CloseBunchResponse {
  transaction: Transaction;
  solReceived: number;
  solShared?: number;
  processedAccounts?: string[];
}

/** Helper: chunk an array into sub-arrays (up to `chunkSize`) */
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
   * Fetch zero-balance token accounts + current SOL balance
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

        const accounts = await getAccountsWithoutBalanceFromAddress(
          publicKey,
          forceReload
        );
        console.log("Token accounts fetched:", accounts);

        const accountPks = accounts.map((acct: TokenAccount) =>
          new PublicKey(acct.pubkey)
        );
        setTokenAccounts(accounts);
        setAccountKeys(accountPks);

        // fetch wallet SOL balance
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

  /**
   * Sum up all rent lamports from zero-balance token accounts
   */
  const totalUnlockableSol = tokenAccounts
    .reduce((sum, acct) => sum + (acct.rentAmount || 0), 0)
    .toFixed(5);

  /**
   * Close All: chunk up to 70 accounts, get transactions from backend,
   * signAllTransactions, fallback check if blockhash expired, etc.
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

      // 1) Double-check user’s SOL balance for fees
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
      if (accountKeys.length === 0) {
        setError("No token accounts found to close.");
        setIsLoading(false);
        return;
      }

      // 2) chunk the accounts up to 70 each
      const chunkedKeys = chunkArray(accountKeys, 70);
      console.log(`Chunked into ${chunkedKeys.length} sets (up to 70 each).`);

      // 3) Build all transactions from backend
      const referralCode = getCookie("referral_code");
      const allCloseTxs: {
        transaction: Transaction;
        solReceived: number;
        solShared?: number;
        chunkSize: number;
      }[] = [];

      for (const chunk of chunkedKeys) {
        const resp = (await closeAccountBunchTransaction(
          publicKey,
          chunk,
          referralCode
        )) as CloseBunchResponse;

        allCloseTxs.push({
          transaction: resp.transaction,
          solReceived: resp.solReceived,
          solShared: resp.solShared,
          chunkSize: chunk.length,
        });
      }

      // 4) signAll
      const unsignedTxs = allCloseTxs.map((c) => c.transaction);
      console.log(`Signing ${unsignedTxs.length} transactions at once...`);
      const signedTxs = await signAllTransactions(unsignedTxs);

      let totalSolReceived = 0;
      let totalSolShared = 0;

      // 5) send + confirm each
      for (let i = 0; i < signedTxs.length; i++) {
        const signedTx = signedTxs[i];
        const { solReceived, solShared, chunkSize } = allCloseTxs[i];

        // A) Send
        const signature = await connection.sendRawTransaction(
          signedTx.serialize(),
          {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          }
        );

        try {
          // B) Confirm
          const blockhash = signedTx.recentBlockhash!;
          const lastValidBlockHeight = signedTx.lastValidBlockHeight!;
          try {
            const confirmation = await connection.confirmTransaction({
              signature,
              blockhash,
              lastValidBlockHeight,
            });
            if (confirmation.value.err) {
              throw new Error(`Transaction ${i} failed: ${confirmation.value.err}`);
            }
          } catch (confirmErr) {
            // Fallback check: blockhash expired
            if (
              confirmErr instanceof Error &&
              confirmErr.message.includes("TransactionExpiredBlockheightExceededError")
            ) {
              console.warn(`Tx ${i} => blockhash expired. Checking chain for success...`);
              const txInfo = await connection.getTransaction(signature, {
                commitment: "confirmed",
              });
              if (txInfo && !txInfo.meta?.err) {
                // Actually succeeded on chain
                console.log(`Tx ${i} => found success on chain despite expiry.`);
              } else {
                // Not found => truly fail
                throw new Error(`Tx ${i} => blockhash expired, not found => fail.`);
              }
            } else {
              throw confirmErr;
            }
          }
          // If we get here => we have success
          await storeClaimTransaction(publicKey.toBase58(), signature, solReceived, chunkSize);
          if (referralCode && solShared) {
            await updateAffiliatedWallet(publicKey.toBase58(), solShared);
            totalSolShared += solShared;
          }
          totalSolReceived += solReceived;
        } catch (err) {
          console.error(`Transaction ${i} had an error:`, err);
          // Optionally re-run this chunk with a new blockhash or show “Try again”
          throw err;
        }
      }

      // 6) final success
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
      scanTokenAccounts(true);
    }
  }

  return (
    <section>
      <div className="accounts-info-wrapper smooth-appear">
        <p>
          Wallet Balance: <span className="gradient-text">{walletBalance.toFixed(5)} SOL</span>
        </p>
        <p>
          Accounts to close: <span className="gradient-text">{tokenAccounts.length}</span>
        </p>
        <p>
          Total SOL to unlock: <span className="gradient-text">{totalUnlockableSol} SOL</span>
        </p>
      </div>

      {tokenAccounts.length > 0 && (
        <div className="claim-all-wrapper">
          <button className="cta-button" onClick={closeAllAccounts} disabled={isLoading}>
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
