// File: src/api/accounts.ts
import { TokenAccount } from "../interfaces/TokenAccount";
import { PublicKey, Transaction } from "@solana/web3.js";

const API_URL = `${import.meta.env.VITE_API_URL}api/accounts`;

console.log("API_URL:", API_URL);

// For the JSON shape returned by the server
interface TransactionJSON {
  transaction: string; // base64
  solReceived: number;
  solShared?: number;
  processedAccounts?: string[];
}

// For the typed data we return to the FE
interface TransactionData {
  transaction: Transaction;
  solReceived: number;
  solShared?: number;
  processedAccounts?: string[];
}

/**
 * Helper: POST JSON
 */
async function postData<T>(url: string, data: object): Promise<T> {
  const response = await fetch(API_URL + url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(`Failed POST to ${url}: ${await response.text()}`);
  }
  return response.json();
}

/**
 * Helper: GET with query string
 */
async function getData<T>(url: string, params: object): Promise<T> {
  const queryString = new URLSearchParams(
    params as Record<string, string>
  ).toString();
  const fullUrl = `${API_URL}${url}?${queryString}`;

  const response = await fetch(fullUrl, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Failed GET to ${url}: ${await response.text()}`);
  }
  return response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) Close single SPL token account w/ no balance
// ─────────────────────────────────────────────────────────────────────────────
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
    processedAccounts: result.processedAccounts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) Close single SPL token account w/ actual token balance
// ─────────────────────────────────────────────────────────────────────────────
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
    processedAccounts: result.processedAccounts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) Close multiple SPL token accounts in a batch
// ─────────────────────────────────────────────────────────────────────────────
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
    processedAccounts: result.processedAccounts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: get-accounts
// ─────────────────────────────────────────────────────────────────────────────
interface AddressTokensList {
  accounts: TokenAccount[];
}

// local caches
let accountsWithoutBalance: TokenAccount[] = [];
let accountsWithBalance: TokenAccount[] = [];

/** 
 * Return zero-balance token accounts for a user 
 */
export async function getAccountsWithoutBalanceFromAddress(
  userPublicKey: PublicKey,
  forceReload: boolean = false
): Promise<TokenAccount[]> {
  if (accountsWithoutBalance.length > 0 && !forceReload) {
    return accountsWithoutBalance;
  }
  const url = "/get-accounts-without-balance-list";
  const data = { wallet_address: userPublicKey.toBase58() };
  const result = await getData<AddressTokensList>(url, data);

  accountsWithoutBalance = result.accounts;
  return result.accounts;
}

/** 
 * Return token accounts that actually have balances 
 */
export async function getAccountsWithBalanceFromAddress(
  userPublicKey: PublicKey,
  forceReload: boolean = false
): Promise<TokenAccount[]> {
  if (accountsWithBalance.length > 0 && !forceReload) {
    return accountsWithBalance;
  }
  const url = "/get-accounts-with-balance-list";
  const data = { wallet_address: userPublicKey.toBase58() };
  const result = await getData<AddressTokensList>(url, data);

  accountsWithBalance = result.accounts;
  return result.accounts;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) Helper: deserialize base64 => Transaction
// ─────────────────────────────────────────────────────────────────────────────
function deserializeTransaction(base64Tx: string): Transaction {
  const buffer = Buffer.from(base64Tx, "base64");
  return Transaction.from(buffer);
}
