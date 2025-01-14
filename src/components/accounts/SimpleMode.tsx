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

/** Helper to chunk an array into ~70 accounts each */
function chunkArray<T>(arr: T[], chunkSize: number): T[][] {
  const result = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    result.push(arr.slice(i, i + chunkSize));
  }
  return result;
}

/** 
 * (Optional) type for the backend response of closeAccountBunchTransaction
 * if your backend returns solShared, etc.
 */
interface CloseBunchResponse {
  transaction: Transaction;
  solReceived: number;
  solShared?: number;
  processedAccounts?: string[];
}

/** 
 * Build multiple "bunch" transactions from the backend, 
 * each with up to 70 accounts, returning typed results.
 */
async function buildAllCloseTxs(
  userPublicKey: PublicKey,
  accountChunks: PublicKey[][],
  referralCode: string | null
): Promise<CloseTxData[]> {
  const results: CloseTxData[] = [];

  for (const chunk of accountChunks) {
    // For each chunk of up to 70 accounts, ask your backend for a transaction
    // If your backend returns additional fields, update the interface accordingly.
    const response = await closeAccountBunchTransaction(
      userPublicKey,
      chunk,
      referralCode
    ) as CloseBunchResponse; // cast if needed

    // Extract your needed fields
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

  // Fetch accounts + wallet balance
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
          (a: TokenAccount) => new PublicKey(a.pubkey)
        );
        setTokenAccounts(accounts);
        setAccountKeys(accountsKeys);

        // fetch wallet balance
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

  // total SOL from rent
  const totalUnlockableSol = tokenAccounts
    .reduce((sum, a) => sum + (a.rentAmount || 0), 0)
    .toFixed(5);

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

      // chunk ~70 accounts at a time
      const chunkedKeys = chunkArray(accountKeys, 70);
      console.log(`Chunked into ${chunkedKeys.length} sets for up to 70 each.`);

      const referralCode = getCookie("referral_code");

      // Build typed transactions
      const allCloseTxs = await buildAllCloseTxs(publicKey, chunkedKeys, referralCode);

      // signAll
      const unsignedTxs = allCloseTxs.map((r) => r.transaction);
      const signedTxs = await signAllTransactions(unsignedTxs);

      let totalSolReceived = 0;
      let totalSolShared = 0;

      // now send each transaction
      for (let i = 0; i < signedTxs.length; i++) {
        const signedTx = signedTxs[i];
        const { solReceived, solShared, chunkSize } = allCloseTxs[i];

        const signature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        });

        const confirmation = await connection.confirmTransaction({
          signature,
          blockhash: signedTx.recentBlockhash!,
          lastValidBlockHeight: signedTx.lastValidBlockHeight!,
        });

        if (confirmation.value.err) {
          throw new Error(`Transaction ${i} failed: ${confirmation.value.err}`);
        }

        // store claim
        await storeClaimTransaction(publicKey.toBase58(), signature, solReceived, chunkSize);

        // if you have solShared, update referral
        if (referralCode && solShared) {
          await updateAffiliatedWallet(publicKey.toBase58(), solShared);
          totalSolShared += solShared;
        }

        totalSolReceived += solReceived;
      }

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
