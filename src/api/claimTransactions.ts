const API_URL = import.meta.env.VITE_API_URL;
//const API_URL = "http://localhost:5001"

console.log(API_URL, "API_URL");

export async function getClaimTransactionsInfo() {
  const url = `${API_URL}api/claim-transactions/info`;
  const claimTransactions = await fetch(url);
  return await claimTransactions.json();
}

export async function getClaimTransactions() {
  const url = `${API_URL}api/claim-transactions/`;
  const claimTransactions = await fetch(url);
  return await claimTransactions.json();
}

export async function storeClaimTransaction(
  walletAddress: string,
  transactionId: string,
  solReceived: number,
  accountsClosed?: number
) {
  const claimTransaction: Record<string, string | number> = {
    walletAddress,
    transactionId,
    solReceived,
  };

  if (accountsClosed) claimTransaction["accountsClosed"] = accountsClosed;

  const url = `${API_URL}api/claim-transactions/store`;
  const request = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(claimTransaction),
  });

  if (!request.ok)
    throw new Error(
      "An error occourred during server claim transaction storing"
    );

  return await request.json();
}
