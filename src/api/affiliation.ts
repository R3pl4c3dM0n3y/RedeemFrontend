import { AffiliatedWallet } from "../interfaces/AffiliatedWallet";

const API_URL = import.meta.env.VITE_API_URL;
//const API_URL = "http://localhost:5001"

console.log(API_URL, "API_URL");
/* 
    Fetch server to obtain the referral code assigned to a certain wallet_address
*/
export async function getReferralInfo(wallet_address: string): Promise<{
  referral_code: string;
  sol_received: string;
}> {
  const url = `${API_URL}api/affiliation/wallet-info?wallet_address=${wallet_address}`;
  const request = await fetch(url);

  if (!request.ok) throw new Error("Error obtaining referral code");

  const request_json = await request.json();

  return {
    referral_code: request_json["referral_code"],
    sol_received: request_json["sol_received"],
  };
}

/* 
    Fetch server to obtain the affiliated wallet information 
    associated to the referral code given as parameter
*/
export async function getAffiliatedWallet(
  referral_code: string
): Promise<AffiliatedWallet> {
  const url = `${API_URL}api/affiliation/affiliated-wallet?referral_code=${referral_code}`;
  const request = await fetch(url);

  if (!request.ok) throw new Error("Error obtaining referral code");

  const request_json = await request.json();

  const affiliated_wallet: AffiliatedWallet = request_json["affiliated_wallet"];

  return affiliated_wallet;
}

/*  
    Fetch server with the sol amount to sum to the affiliated wallet
*/
export async function updateAffiliatedWallet(
  wallet_address: string,
  sol_amount: number
): Promise<void> {
  const data = {
    wallet_address,
    amount: sol_amount,
  };

  const url = `${API_URL}api/affiliation/affiliated-wallet/update`;
  const request = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!request.ok) throw new Error("Error obtaining referral code");
}
