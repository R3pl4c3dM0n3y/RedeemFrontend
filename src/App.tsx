import { useState, useEffect } from "react";
import "./App.css";
import { CustomConnectButton } from "./components/CustomConnectButton";
import { useWallet } from "@solana/wallet-adapter-react";
import AccountsScanner from "./components/accounts/AccountsScanner";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { ClaimedSol } from "./components/ClaimedSol";
import HowItWorks from "./components/HowItWorks";

function App() {
  const [darkMode, setDarkMode] = useState(true);
  const { publicKey } = useWallet();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Apply dark mode to body when component mounts and when darkMode changes
    document.body.classList.toggle("dark-mode", darkMode);
  }, [darkMode]);

  useEffect(() => {
    if (publicKey) {
      setWalletAddress(publicKey.toBase58());
    } else {
      setWalletAddress("");
    }
  }, [publicKey]);

  const toggleDarkMode = () => {
    setDarkMode((prevMode) => !prevMode);
  };

  const handleApiCall = async () => {
    if (!walletAddress) {
      setError("Please connect your wallet first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${
          import.meta.env.VITE_API_URL
        }api/accounts/get-accounts-without-balance-list`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();

      if (response.ok) {
        alert(
          `Successfully fetched accounts: ${JSON.stringify(data.accounts)}`
        );
      } else {
        setError(data.error || "Failed to fetch accounts.");
      }
    } catch (err) {
      console.error("API call failed:", err);
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`app ${darkMode ? "dark-mode" : ""}`}>
      {/* HEADER */}
      <Header
        toggle={toggleDarkMode}
        darkMode={darkMode}
        walletAddress={walletAddress}
        setWalletAddress={setWalletAddress}
      ></Header>

      {/* MAIN */}
      <main>
        <section id="intro" className="hero">
          <div className="top-middle">
            <img
              src="/images/logo.webp"
              alt="Company Logo"
              style={{
                width: "320px",
              }}
            />
          </div>
          <div className="content">
            <h1>
              <span className="gradient-text">
                Recovering your SOL is easier than ever.
              </span>
            </h1>

            {!walletAddress && (
              <>
                <p>
                  Close unused accounts — whether they’re empty or still holding
                  tokens. <br />
                  No SOL? No Problem. In that case, we’ll cover the fees! <br />
                  <a href="#how-it-works" className="small-link gradient-text">
                    How It Works
                  </a>
                </p>
                <div className="button-container">
                  <CustomConnectButton setWalletAddress={setWalletAddress} />
                </div>
              </>
            )}
          </div>
        </section>

        {/* Error Message */}
        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}

        {/* Accounts Scanner */}
        {walletAddress && (
          <>
            <AccountsScanner
              walletAddress={walletAddress}
              setWalletAddress={setWalletAddress}
            />
            <button
              onClick={handleApiCall}
              disabled={loading}
              className={`api-call-button ${loading ? "loading" : ""}`}
            ></button>
          </>
        )}

        {/* Claimed SOL */}
        <ClaimedSol></ClaimedSol>

        {/* How It Works */}
        <HowItWorks></HowItWorks>
      </main>

      {/* FOOTER */}
      <Footer></Footer>
    </div>
  );
}

export default App;
