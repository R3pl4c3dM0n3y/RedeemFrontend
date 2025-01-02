import "./AccountsScanner.css";
import { TokenAccount } from "../../interfaces/TokenAccount";
import AccountWithBalance from "./AccountWithBalance";
import { useEffect, useState, useCallback } from "react";
import {
  closeAccountWithBalanceTransaction,
  getAccountsWithBalanceFromAddress,
} from "../../api/accounts";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { storeClaimTransaction } from "../../api/claimTransactions";
import { updateAffiliatedWallet } from "../../api/affiliation";
import { PublicKey } from "@solana/web3.js";
import { getCookie } from "../../utils/cookies";
import { Message, MessageState } from "../Message";

function AdvancedMode() {
  const { publicKey, signTransaction } = useWallet();
  const [warningAccepted, setWarningAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tokenAccounts, setTokenAccounts] = useState<TokenAccount[]>();
  const [error, setError] = useState<string | null>(null);
  const { connection } = useConnection();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);

  const handleSelectAccount = (pubkey: string, isSelected: boolean) => {
    setSelectedAccounts((prev) =>
      isSelected
        ? [...prev, pubkey]
        : prev.filter((selected) => selected !== pubkey)
    );
  };

  const scanTokenAccounts = useCallback(
    async (forceReload: boolean = false) => {
      if (!publicKey) {
        return;
      }
      try {
        setLoading(true);
        setError(null);

        // Fetch token accounts with balance
        const accounts = await getAccountsWithBalanceFromAddress(
          publicKey,
          forceReload
        );
        setTokenAccounts(accounts);

        // Fetch wallet balance
        const response = await fetch(
          `${
            import.meta.env.VITE_API_URL
          }api/accounts/get-wallet-balance?wallet_address=${publicKey.toBase58()}`
        );
        const data = await response.json();

        if (data.balance < 0.05) {
          setError(
            "Insufficient SOL to cover transaction fees. Please add more SOL to your wallet."
          );
        }
      } catch (err) {
        console.error("Error fetching token accounts or balance:", err);
        setError("Failed to fetch token accounts or wallet balance.");
      } finally {
        setLoading(false);
      }
    },
    [publicKey]
  );

  useEffect(() => {
    if (warningAccepted) {
      scanTokenAccounts();
    }
  }, [warningAccepted, scanTokenAccounts]);

  async function closeAccountWIthBalance(accountPubkey: string): Promise<void> {
    if (!publicKey) {
      setError("Wallet not connected");
      return;
    }

    if (!signTransaction) throw new Error("Error signing transaction");

    try {
      setLoading(true);
      setError(null);

      const accountToClose = new PublicKey(accountPubkey);

      const code = getCookie("referral_code");
      const { transaction, solReceived, solShared } =
        await closeAccountWithBalanceTransaction(
          publicKey,
          accountToClose,
          code
        );

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

      // Send the signed transaction
      const signature = await connection.sendRawTransaction(
        serializedTransaction,
        {
          skipPreflight: false, // Perform preflight checks
          preflightCommitment: "confirmed", // Preflight commitment level
        }
      );

      if (!transaction.recentBlockhash)
        throw new Error("Block hash not provided by server");

      // Confirm the transaction
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }); // Specify the desired commitment level

      if (confirmation.value.err) {
        throw new Error("Transaction failed to confirm");
      }

      storeClaimTransaction(publicKey.toBase58(), signature, solReceived);

      if (code && solShared) {
        await updateAffiliatedWallet(publicKey.toBase58(), solShared);
      }
      setStatusMessage(`Account closed successfully. Signature: ${signature}`);
      // Refresh the account list
    } catch (err) {
      console.error("Detailed error:", err);
      setStatusMessage("");
      setError(
        "Error closing account: " +
          (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setLoading(false);
      setTimeout(() => {
        scanTokenAccounts(true);
      }, 3000);
    }
  }

  return (
    <>
      {!warningAccepted && (
        <div
          className="smooth-appear"
          style={{
            display: "grid",
            placeItems: "center",
            marginTop: "50px",
            marginBottom: "50px",
          }}
        >
          <h3 style={{ fontSize: "1.6rem", textAlign: "center" }}>
            ⚠️ Warning
          </h3>
          <p
            style={{
              textAlign: "center",
              fontSize: "1em",
              marginTop: "20px",
              marginBottom: "40px",
              maxWidth: "480px",
            }}
          >
            You are about to enter Advanced Mode. This mode allows you to
            perform advanced operations such as close accounts with balance.
            Please ensure you understand the implications before proceeding.
          </p>
          <button onClick={() => setWarningAccepted(true)}>
            I know what I am doing
          </button>
        </div>
      )}

      {warningAccepted && (
        <>
          {loading && (
            <div className="loading-wrapper">
              <div className="lds-ring">
                <div></div>
                <div></div>
                <div></div>
                <div></div>
              </div>
            </div>
          )}

          {!loading && error && (
            <p
              className="gradient-text"
              style={{
                marginTop: "40px",
                textAlign: "center",
                color: "red",
              }}
            >
              {error}
            </p>
          )}

          {!loading &&
          !error &&
          (!tokenAccounts || tokenAccounts.length === 0) ? (
            <p
              className="gradient-text"
              style={{
                marginTop: "40px",
                textAlign: "center",
              }}
            >
              No accounts found
            </p>
          ) : (
            <div className="accounts-list">
              {selectedAccounts.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    width: "100%",
                  }}
                >
                  <button
                    onClick={() =>
                      selectedAccounts.forEach((pubkey) =>
                        closeAccountWIthBalance(pubkey)
                      )
                    }
                    disabled={selectedAccounts.length === 0}
                  >
                    Force Close Selected
                  </button>
                </div>
              )}

              {tokenAccounts?.map((account, index) => (
                <AccountWithBalance
                  key={index}
                  index={index}
                  scanTokenAccounts={scanTokenAccounts}
                  account={account}
                  onSelectAccount={handleSelectAccount}
                />
              ))}

              {statusMessage && !error ? (
                <Message state={MessageState.SUCCESS}>
                  <p>{statusMessage}</p>
                </Message>
              ) : (
                <></>
              )}

              {error ? (
                <Message state={MessageState.ERROR}>
                  <p>{error}</p>
                </Message>
              ) : (
                <></>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

export default AdvancedMode;
