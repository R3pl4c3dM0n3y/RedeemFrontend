import { useEffect, useState } from "react";
import "./accounts/AccountsScanner.css";
import "./ClaimedSol.css";
import {
  getClaimTransactions,
  getClaimTransactionsInfo,
} from "../api/claimTransactions";

interface ClaimTransaction {
  wallet_address: string;
  accounts_closed: number;
  sol_received: number;
  transaction_id: string;
  claimed_at: { _seconds: number; _nanoseconds: number };
}

export function ClaimedSol() {
  const [claimedSOL, setClaimedSOL] = useState<ClaimTransaction[]>([]);

  const [claimedSolInfo, setClaimedSOLInfo] = useState<Record<
    string,
    string
  > | null>(null);

  useEffect(() => {
    obtainClaimedSolTransacations();
    obtainClaimedSolInfo();
  }, []);

  async function obtainClaimedSolTransacations() {
    const claimedSol = await getClaimTransactions();
    const formattedClaimedSol = claimedSol.map((claim: ClaimTransaction) => ({
      ...claim,
      claimed_at: new Date(claim.claimed_at._seconds * 1000),
    }));
    setClaimedSOL(formattedClaimedSol);
  }

  async function obtainClaimedSolInfo() {
    const info = await getClaimTransactionsInfo();
    setClaimedSOLInfo(info);
  }

  return (
    claimedSolInfo && (
      <>
        <section className="record-columns-wrapper">
          <div className="record-columns">
            <article className="record-card">
              <span>Total Sol Recovered</span>
              <p>{claimedSolInfo.total_sol_claimed} SOL</p>
            </article>

            <article className="record-card">
              <span>Total Sol Shared</span>
              <p>{Number(claimedSolInfo.total_sol_shared).toFixed(6)} SOL</p>
            </article>

            <article className="record-card">
              <span>Total Accounts Closed</span>
              <p>{claimedSolInfo.total_accounts_closed} </p>
            </article>
          </div>
        </section>
        <section className="account-scanner">
          <img src="/images/solanatoken.png"></img>
          <div
            style={{
              fontSize: "32px",
              textAlign: "center",
              fontWeight: "700",
              marginBottom: "20px",
            }}
          >
            Latest Claimed SOL
          </div>

          <div style={{ marginTop: "40px !important" }}>
            {claimedSOL.map((claim, index) => (
              <div
                key={claim.transaction_id}
                className="account-item "
                style={{ animationDelay: `${index * 0.1}s`, width: "100%" }}
              >
                <article className="account">
                  <div className="account-info" style={{ width: "100%" }}>
                    <a
                      target="_blank"
                      style={{
                        maxWidth: "140px",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        display: "inline-block",
                      }}
                      href={"https://solscan.io/tx/" + claim.transaction_id}
                    >
                      {claim.transaction_id}
                    </a>

                    <p>
                      <b>{claim.sol_received.toString().substring(0, 7)} SOL</b>
                    </p>
                    <p>
                      <b>{claim.accounts_closed}</b>
                    </p>

                    <b>
                      {" "}
                      {claim.claimed_at instanceof Date
                        ? claim.claimed_at.toLocaleString()
                        : ""}
                    </b>
                  </div>
                </article>
              </div>
            ))}
          </div>
        </section>
      </>
    )
  );
}
