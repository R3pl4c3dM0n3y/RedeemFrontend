import { TokenAccount } from "../interfaces/TokenAccount";
import { PublicKey, Transaction } from "@solana/web3.js";

const API_URL = `${import.meta.env.VITE_API_URL}api/accounts`;

console.log("API_URL:", API_URL);

interface TransactionJSON {
  transaction: string;
  solReceived: number;
  solShared?: number;
}
interface TransactionData {
  transaction: Transaction;
  solReceived: number;
  solShared?: number;
}

// Helper: POST
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

// Helper: GET
async function getData<T>(url: string, params: object): Promise<T> {
  const queryString = new URLSearchParams(params as Record<string, string>).toString();
  const fullUrl = `${API_URL}${url}?${queryString}`;
  const response = await fetch(fullUrl, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  return response.json();
}

// Close a single account
export async function closeAccountTransaction(
  userPublicKey: PublicKey,
  accountPublicKey: PublicKey,
  referralCode: string | null
): Promise<TransactionData> {
  const result = await postData<TransactionJSON>("/close-account", {
    user_public_key: userPublicKey.toBase58(),
    account_public_key: accountPublicKey.toBase58(),
    referral_code: referralCode,
  });
  return {
    transaction: deserializeTransaction(result.transaction),
    solReceived: result.solReceived,
    solShared: result.solShared,
  };
}

// Close multiple accounts
export async function closeAccountBunchTransaction(
  userPublicKey: PublicKey,
  accountPublicKeys: PublicKey[],
  referralCode: string | null
): Promise<TransactionData> {
  const result = await postData<TransactionJSON>("/close-accounts-bunch", {
    user_public_key: userPublicKey.toBase58(),
    account_public_keys: accountPublicKeys.map((pk) => pk.toBase58()),
    referral_code: referralCode,
  });
  return {
    transaction: deserializeTransaction(result.transaction),
    solReceived: result.solReceived,
    solShared: result.solShared,
  };
}

// Close an account with balance
export async function closeAccountWithBalanceTransaction(
  userPublicKey: PublicKey,
  accountPublicKey: PublicKey,
  referralCode: string | null
): Promise<TransactionData> {
  const result = await postData<TransactionJSON>("/close-account-with-balance", {
    user_public_key: userPublicKey.toBase58(),
    account_public_key: accountPublicKey.toBase58(),
    referral_code: referralCode,
  });
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
  if (accountsWithoutBalance.length > 0 && !forceReload) {
    return accountsWithoutBalance;
  }
  const result = await getData<AddressTokensList>("/get-accounts-without-balance-list", {
    wallet_address: userPublicKey.toBase58(),
  });
  accountsWithoutBalance = result.accounts;
  return result.accounts;
}

// Helper: deserialize base64 => Transaction
function deserializeTransaction(base64Transaction: string): Transaction {
  const buffer = Buffer.from(base64Transaction, "base64");
  return Transaction.from(buffer);
}
