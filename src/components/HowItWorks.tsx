import React from "react";
import { Wallet, Users, Sparkles, ArrowRight } from "lucide-react";

const HowItWorks: React.FC = () => {
  const styles = {
    section: {
      padding: "64px 0",
      backgroundColor: "var(--bg-secondary)",
      color: "var(--text-primary)",
    },
    container: {
      maxWidth: "800px",
      margin: "0 auto",
      padding: "0 16px",
    },
    heading: {
      fontSize: "30px",
      fontWeight: "bold",
      textAlign: "center" as const,
      marginBottom: "48px",
    },
    introText: {
      fontSize: "18px",
      color: "var(--text-secondary)",
      marginBottom: "24px",
      textAlign: "center" as const,
    },
    card: {
      backgroundColor: "var(--bg-primary)",
      padding: "24px",
      borderRadius: "8px",
      boxShadow: "0 1px 3px var(--shadow-color)",
      marginBottom: "48px",
    },
    cardHeader: {
      display: "flex",
      alignItems: "center", // Change from 'flex-start' to 'center'
      marginBottom: "16px",
    },
    icon: {
      marginRight: "16px",
      flexShrink: 0,
      marginTop: "0.25em", // Adjust this value for fine-tuning
    },
    titleContainer: {
      display: "flex",
      flexDirection: "column" as const,
    },
    cardTitle: {
      fontSize: "20px",
      fontWeight: 600,
      marginBottom: "8px",
      lineHeight: "1.2", // Add this line to ensure consistent spacing
    },
    cardText: {
      color: "var(--text-secondary)",
    },
    benefitsList: {
      marginTop: "32px",
    },
    benefitsTitle: {
      fontSize: "20px",
      fontWeight: 600,
      marginBottom: "16px",
    },
    benefitItem: {
      display: "flex",
      alignItems: "center",
      marginBottom: "12px",
    },
    benefitIcon: {
      marginRight: "8px",
      color: "var(--color-primary)",
    },
    ctaSection: {
      textAlign: "center" as const,
      marginTop: "40px",
    },
    ctaText: {
      fontSize: "18px",
      fontWeight: 500,
      marginBottom: "16px",
    },
    ctaButton: {
      backgroundColor: "var(--color-primary)",
      color: "var(--text-on-primary)",
      padding: "12px 32px",
      borderRadius: "8px",
      border: "none",
      fontSize: "16px",
      cursor: "pointer",
      transition: "background-color 0.3s",
    },
  };

  return (
    <section id="how-it-works" style={styles.section}>
      <div style={styles.container}>
        <h2 style={styles.heading}>How It Works</h2>

        <div>
          <div style={{ marginBottom: "40px" }}>
            <p style={styles.introText}>
              Connect Your Wallet: Simply click the "Connect" button, select
              your preferred Solana wallet and Redeem show you the total amount
              of Solana fees you have to claim.
              <br />
              <br />
              Redeem Your Solana: Once the Redeem has complete a scan of your
              wallet, click the "Redeem" button to claim your Solana storage
              fees back to your wallet.
            </p>
          </div>

          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <Wallet
                style={{ ...styles.icon, color: "var(--color-blue)" }}
                size={24}
              />
              <div style={styles.titleContainer}>
                <h3 style={styles.cardTitle}>For Newcomers</h3>
                <p style={styles.cardText}>
                  Got unused Solana accounts but no SOL to close them? No
                  problem! We'll cover your transaction fees, making account
                  cleanup completely accessible. Unlike other platforms, you can
                  close your unused accounts even with zero SOL balance - we
                  handle all the costs upfront.
                </p>
              </div>
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <Sparkles
                style={{ ...styles.icon, color: "var(--color-purple)" }}
                size={24}
              />
              <div style={styles.titleContainer}>
                <h3 style={styles.cardTitle}>Rent Redemption</h3>
                <p style={styles.cardText}>
                  At Redeem we understand that not every project can be a winner
                  but that doesnt mean you have to looser. Even if you’ve been
                  caught in a scam coin, a failed project, or a quick
                  pump-and-dump, Redeem can still help you recover some of your
                  lost funds.
                  <br />
                  <br />
                  As the small rent fees are set aside with every token
                  purchase—even bad ones—Redeem tracks them down and brings that
                  SOL back to your wallet. It’s a simple way to reclaim value
                  from those unfortunate losses and focus on better, more secure
                  opportunities in the future.
                </p>
              </div>
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <Users
                style={{ ...styles.icon, color: "var(--color-green)" }}
                size={24}
              />
              <div style={styles.titleContainer}>
                <h3 style={styles.cardTitle}>
                  Industry-Leading Referral Program
                </h3>
                <p style={styles.cardText}>
                  Earn while you help others! Our referral program offers an
                  unprecedented 50% of our fee for every friend you bring.
                  That's the highest reward rate in the market, making it
                  rewarding to share the benefits of our platform with others.
                </p>
              </div>
            </div>
          </div>

          <div style={styles.benefitsList}>
            <h3 style={styles.benefitsTitle}>How Redeem works for you?</h3>
            <ul style={{ listStyleType: "none", padding: 0 }}>
              {[
                "Security First - We follow best practices for privacy and secure rent redemption.",
                "Ease of use - In a few clicks of a button you can scan and Redeem Solana straight to your wallet, hassle free!",
                "Sustainability - Redeem is not only efficient but it also provides a seamless solution to manage your activity on the blockchain.",
                "Referrals - Get 10% of the total claimed value.",
                "No coding skills no problem - We have that handled!",
                "0 Balance? - At Redeem we can cover the transaction costs.",
              ].map((benefit, index) => (
                <li key={index} style={styles.benefitItem}>
                  <ArrowRight style={styles.benefitIcon} size={20} />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          <div style={styles.ctaSection}>
            <p style={styles.ctaText}>Ready to optimize your Solana wallet?</p>
            <p style={{ marginTop: "40px" }}>
              <a href="#intro" className="cta-button">
                Get Started Now
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
