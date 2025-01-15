// SimpleMode.tsx
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

/** For typed response from the backend */
interface CloseBunchResponse {
  transaction: Transaction;
  solReceived: number;
  solShared?: number;
  processedAccounts?: string[];
}

/** Helper to chunk arrays up to 70 each. */
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

  /** Load zero-balance token accounts + user SOL balance. */
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

        // Convert to PublicKey
        const pkArray = accounts.map((a) => new PublicKey(a.pubkey));
        setTokenAccounts(accounts);
        setAccountKeys(pkArray);

        // fetch wallet SOL
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

  // Summation of rent
  const totalUnlockableSol = tokenAccounts
    .reduce((sum, a) => sum + (a.rentAmount || 0), 0)
    .toFixed(5);

  /** 
   * Closes all zero-balance accounts in chunked transactions 
   * up to 70 each, signAllTransactions in one pop-up.
   */
  async function closeAllAccounts() {
    if (!publicKey) {
      setError("Wallet not connected");
      return;
    }
    if (!signAllTransactions) {
      setError("Wallet does not support signAllTransactions");
      return;
    }

    try {
      setError(null);
      setIsLoading(true);

      // check user balance
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

      // Chunk up to 70 each
      const chunkedKeys = chunkArray(accountKeys, 70);
      console.log(`Chunked into ${chunkedKeys.length} sets (up to 70 each).`);

      const referralCode = getCookie("referral_code");

      // Build each chunk from the backend
      const allTxs: {
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
        allTxs.push({
          transaction: response.transaction,
          solReceived: response.solReceived,
          solShared: response.solShared,
          chunkSize: chunk.length,
        });
      }

      // signAll
      const unsignedTxs = allTxs.map((item) => item.transaction);
      console.log(`Signing ${unsignedTxs.length} transactions at once...`);
      const signedTxs = await signAllTransactions(unsignedTxs);

      let totalSolReceived = 0;
      let totalSolShared = 0;

      // send + confirm each
      for (let i = 0; i < signedTxs.length; i++) {
        const signedTx = signedTxs[i];
        const { solReceived, solShared, chunkSize } = allTxs[i];

        // A) Send
        const signature = await connection.sendRawTransaction(
          signedTx.serialize(),
          {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          }
        );

        // B) Confirm + fallback
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
            console.warn(`Tx ${i} blockhash expired, checking chain...`);
            const txInfo = await connection.getTransaction(signature, {
              commitment: "confirmed",
            });
            if (txInfo && !txInfo.meta?.err) {
              // success
              console.log(`Tx ${i} actually succeeded on chain despite expiry.`);
            } else {
              throw new Error(`Tx ${i} => blockhash expired, not found on chain => fail.`);
            }
          } else {
            throw err;
          }
        }

        // If success
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

      // final success
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
