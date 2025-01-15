// Account.tsx
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

  async function closeAccount(accountPubkey: string) {
    if (!publicKey) {
      setError("Wallet not connected");
      return;
    }
    if (!signTransaction) {
      setError("Wallet does not support signTransaction");
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      setStatusMessage("Processing transaction...");

      const code = getCookie("referral_code");
      const accountToClose = new PublicKey(accountPubkey);

      // 1) ask backend
      const { transaction, solReceived, solShared } = await closeAccountTransaction(
        publicKey,
        accountToClose,
        code
      );

      // 2) sign
      const signedTx = await signTransaction(transaction);

      // 3) send
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      // 4) confirm + fallback
      let blockhash = transaction.recentBlockhash;
      let lastValidBlockHeight = transaction.lastValidBlockHeight;
      if (!blockhash || !lastValidBlockHeight) {
        // fetch a fresh one just in case
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
        if (
          err instanceof Error &&
          err.message.includes("TransactionExpiredBlockheightExceededError")
        ) {
          console.warn("blockhash expired, checking chain for success...");
          const txInfo = await connection.getTransaction(signature, {
            commitment: "confirmed",
          });
          if (txInfo && !txInfo.meta?.err) {
            console.log("Chain says success, ignoring blockhash expiry.");
          } else {
            throw new Error("Blockhash expired => not found on chain => fail.");
          }
        } else {
          throw err;
        }
      }

      // If success
      await storeClaimTransaction(publicKey.toBase58(), signature, solReceived);

      if (code && solShared) {
        await updateAffiliatedWallet(code, solShared);
      }

      setStatusMessage(`Account closed successfully. Signature: ${signature}`);
    } catch (err) {
      console.error("Detailed error:", err);
      setStatusMessage("");
      setError("Error closing account: " + (err as Error).message);
    } finally {
      setIsLoading(false);
      props.scanTokenAccounts(); // refresh the list

      setTimeout(() => {
        setStatusMessage("");
        setError("");
      }, 3000);
    }
  }

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
