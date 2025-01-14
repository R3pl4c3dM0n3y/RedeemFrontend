import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import "./AccountsScanner.css";
import { closeAccountTransaction } from "../../api/accounts";
import { TokenAccount } from "../../interfaces/TokenAccount";
import "./Account.css";
import { Message, MessageState } from "../Message";
import { storeClaimTransaction } from "../../api/claimTransactions";
import { getCookie } from "../../utils/cookies";
import { updateAffiliatedWallet } from "../../api/affiliation";

interface AccountProps {
  account: TokenAccount;
  scanTokenAccounts: () => void;
}

function Account(props: AccountProps) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const account = props.account;

  const closeAccount = async (accountPubkey: string) => {
    if (!publicKey) {
      setError("Wallet not connected");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setStatusMessage("Processing transaction...");

      const code = getCookie("referral_code");
      const accountToClose = new PublicKey(accountPubkey);

      // 1) Ask the backend for a transaction
      const { transaction, solReceived, solShared } = await closeAccountTransaction(
        publicKey,
        accountToClose,
        code
      );

      // 2) signTransaction
      if (!signTransaction) {
        throw new Error("Wallet does not support signTransaction");
      }
      const signedTransaction = await signTransaction(transaction);

      // 3) Serialize + send
      const serializedTx = signedTransaction.serialize();
      const signature = await connection.sendRawTransaction(serializedTx, {
        skipPreflight: false,
        preflightCommitment: "processed",
      });

      // 4) Confirm
      let blockhash = transaction.recentBlockhash;
      let lastValidBlockHeight = transaction.lastValidBlockHeight;
      if (!blockhash || !lastValidBlockHeight) {
        const latestBlockhash = await connection.getLatestBlockhash();
        blockhash = latestBlockhash.blockhash;
        lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
      }

      try {
        const confirmation = await connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight,
        });
        if (confirmation.value.err) {
          throw new Error("Transaction failed to confirm");
        }
      } catch (err) {
        // ─────────────────────────────────────────────────────────────────
        // FALLBACK: Possibly "TransactionExpiredBlockheightExceededError"
        // ─────────────────────────────────────────────────────────────────
        if (
          err instanceof Error &&
          err.message.includes("TransactionExpiredBlockheightExceededError")
        ) {
          console.warn("Blockhash expired. Checking chain for success...");

          // Re-check on chain:
          const txInfo = await connection.getTransaction(signature, {
            commitment: "confirmed",
          });
          if (txInfo && !txInfo.meta?.err) {
            console.log("Transaction actually succeeded on chain despite expiry.");
            // We do NOT throw here. We continue as success.
          } else {
            throw new Error("Blockhash expired, not found on chain => fail.");
          }
        } else {
          throw err; // rethrow anything else
        }
      }

      // 5) If we get here, it’s considered success
      await storeClaimTransaction(publicKey.toBase58(), signature, solReceived);

      if (code && solShared) {
        await updateAffiliatedWallet(code, solShared);
      }

      setStatusMessage(`Account closed successfully. Signature: ${signature}`);
    } catch (err) {
      console.error("Detailed error:", err);
      setStatusMessage("");
      setError(
        "Error closing account: " + (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setIsLoading(false);
      // Re-scan the token accounts
      props.scanTokenAccounts();

      // Clear messages after a short delay
      setTimeout(() => {
        setStatusMessage("");
        setError("");
      }, 3000);
    }
  };

  return (
    <>
      <article className="account" key={account.pubkey}>
        <div className="account-info">
          <p>
            <b>Account: </b>
            <br />
            {account.pubkey}
          </p>
          <p>
            <b>Mint: </b>
            <br />
            {account.mint}
          </p>
          <p>
            <b>Balance: </b>
            <br />
            {account.balance} SOL
          </p>
        </div>
        <button onClick={() => closeAccount(account.pubkey)}>Close Account</button>
      </article>

      {isLoading && (
        <Message state={MessageState.SUCCESS}>
          <p>Loading...</p>
        </Message>
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
    </>
  );
}

export default Account;
