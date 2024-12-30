import "./AccountsScanner.css";
import { TokenAccount } from "../../interfaces/TokenAccount";
import AccountWithBalance from "./AccountWithBalance";
import { useEffect, useState, useCallback } from "react";
import { getAccountsWithBalanceFromAddress } from "../../api/accounts";
import { useWallet } from "@solana/wallet-adapter-react";

function AdvancedMode() {
  const { publicKey } = useWallet();
  const [warningAccepted, setWarningAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tokenAccounts, setTokenAccounts] = useState<TokenAccount[]>();
  const [error, setError] = useState<string | null>(null);

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
              {tokenAccounts?.map((account, index) => (
                <AccountWithBalance
                  key={index}
                  index={index}
                  scanTokenAccounts={scanTokenAccounts}
                  account={account}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

export default AdvancedMode;
