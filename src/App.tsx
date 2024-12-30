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
                Welcome to Redeem. The safest way to reclaim Solana storage
                fees.
              </span>
            </h1>

            {!walletAddress && (
              <>
                <p>
                  A little known fact on the Solana blockchain is that when you
                  purchase a meme token, a portion of your funds covers network
                  storage fees that build up over time. <br />
                  <br />
                  These storage fees are held on the solana network even once
                  you have completely sold your holding. <br />
                  <br />
                  Redeem allows Solana wallet holders to analyse hidden storage
                  fees attached to old meme tokens (even ones you no longer
                  hold). This allows you to reclaim these valuable funds from
                  the Solana network in just a few steps. Connect Wallet → Scan
                  Accounts → Reclaim SOL <br />
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
