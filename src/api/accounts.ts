import { TokenAccount } from "../interfaces/TokenAccount";
import { PublicKey, Transaction } from "@solana/web3.js";

const API_URL = `${import.meta.env.VITE_API_URL}api/accounts`;
//const API_URL = "http://localhost:5001/api/accounts"

console.log(API_URL, "API_URL");

// Data received by the server
interface TransactionJSON {
  transaction: string;
  solReceived: number;
  solShared?: number;
}

// Data returned by the functions
interface TransactionData {
  transaction: Transaction;
  solReceived: number;
  solShared?: number;
}

// Helper to send JSON data via POST request and handle the response
async function postData<T>(url: string, data: object): Promise<T> {
  const response = await fetch(API_URL + url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  return response.json();
}

// Helper to send JSON data via GET request and handle the response with query params in the URL
async function getData<T>(url: string, params: object): Promise<T> {
  // Convert the params object to a query string
  const queryString = new URLSearchParams(
    params as Record<string, string>
  ).toString();

  // Append the query string to the URL
  const fullUrl = `${API_URL}${url}?${queryString}`;

  // Send the GET request
  const response = await fetch(fullUrl, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  // Return the response as JSON
  return response.json();
}

// Close a single SPL token account with no balance
export async function closeAccountTransaction(
  userPublicKey: PublicKey,
  accountPublicKey: PublicKey,
  referralCode: string | null
): Promise<TransactionData> {
  const url = "/close-account";
  const data = {
    user_public_key: userPublicKey.toBase58(),
    account_public_key: accountPublicKey.toBase58(),
    referral_code: referralCode,
  };

  const result = await postData<TransactionJSON>(url, data);

  return {
    transaction: deserializeTransaction(result.transaction),
    solReceived: result.solReceived,
    solShared: result.solShared,
  };
}

// Close a single SPL token account with balance
export async function closeAccountWithBalanceTransaction(
  userPublicKey: PublicKey,
  accountPublicKey: PublicKey,
  referralCode: string | null
): Promise<TransactionData> {
  const url = "/close-account-with-balance";
  const data = {
    user_public_key: userPublicKey.toBase58(),
    account_public_key: accountPublicKey.toBase58(),
    referral_code: referralCode,
  };

  const result = await postData<TransactionJSON>(url, data);

  return {
    transaction: deserializeTransaction(result.transaction),
    solReceived: result.solReceived,
    solShared: result.solShared,
  };
}

// Close multiple SPL token accounts in a batch
export async function closeAccountBunchTransaction(
  userPublicKey: PublicKey,
  accountPublicKeys: PublicKey[],
  referralCode: string | null
): Promise<TransactionData> {
  const url = "/close-accounts-bunch";
  const data = {
    user_public_key: userPublicKey.toBase58(),
    account_public_keys: accountPublicKeys.map((pk) => pk.toBase58()),
    referral_code: referralCode,
  };

  const result = await postData<TransactionJSON>(url, data);

  return {
    transaction: deserializeTransaction(result.transaction),
    solReceived: result.solReceived,
    solShared: result.solShared,
  };
}

interface AddressTokensList {
  accounts: TokenAccount[];
}

let accountsWithoutBalance: TokenAccount[] = [];

export async function getAccountsWithoutBalanceFromAddress(
  userPublicKey: PublicKey,
  forceReload: boolean = false
): Promise<TokenAccount[]> {
  if (accountsWithoutBalance.length > 0 && !forceReload)
    return accountsWithoutBalance;

  const url = "/get-accounts-without-balance-list";
  const data = {
    wallet_address: userPublicKey.toBase58(),
  };

  const result = await getData<AddressTokensList>(url, data);

  accountsWithoutBalance = result.accounts;
  return result.accounts;
}

let accountsWithBalance: TokenAccount[] = [];

export async function getAccountsWithBalanceFromAddress(
  userPublicKey: PublicKey,
  forceReload: boolean = false
): Promise<TokenAccount[]> {
  if (accountsWithBalance.length > 0 && !forceReload)
    return accountsWithBalance;

  const url = "/get-accounts-with-balance-list";
  const data = {
    wallet_address: userPublicKey.toBase58(),
  };

  const result = await getData<AddressTokensList>(url, data);

  accountsWithBalance = result.accounts;
  return result.accounts;
}

// Helper to deserialize a base64 string into a Transaction object
function deserializeTransaction(base64Transaction: string): Transaction {
  const buffer = Buffer.from(base64Transaction, "base64");
  return Transaction.from(buffer);
}
