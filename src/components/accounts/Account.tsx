import { useState } from 'react';
import { PublicKey } from '@solana/web3.js'; 
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import "./AccountsScanner.css"
import { closeAccountTransaction } from '../../api/accounts';
import { TokenAccount } from '../../interfaces/TokenAccount';
import "./Account.css"
import { Message, MessageState } from '../Message.tsx';
import { storeClaimTransaction } from '../../api/claimTransactions';
import { getCookie } from '../../utils/cookies.ts';
import { updateAffiliatedWallet } from '../../api/affiliation.ts';


interface AccountProps {
    account: TokenAccount
    scanTokenAccounts: () => void
}

/* const DESTINATION_SHARE = 0.15; */

function Account(props: AccountProps) {
    const { publicKey, signTransaction } = useWallet(); // sendTransaction
    const [isLoading, setIsLoading] = useState(false);
    const { connection } = useConnection();
    const [error, setError] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    const account = props.account

    const closeAccount = async (accountPubkey: string) => {
        if (!publicKey) {
            setError("Wallet not connected");
            return;
        }

        try {
            setIsLoading(true);
            setError(null);
            setStatusMessage("Processing transaction...");

            const accountToClose = new PublicKey(accountPubkey);

            const code = getCookie("referral_code")
            const {transaction, solReceived, solShared } = await closeAccountTransaction(publicKey, accountToClose, code)


            if(!signTransaction)
                throw new Error("Error signing transaction")

            const signedTransaction = await signTransaction(transaction);
          
            // Serialize the signed transaction
            const serializedTransaction = signedTransaction.serialize();

          
            // Send the signed transaction
            const signature = await connection.sendRawTransaction(serializedTransaction, {
              skipPreflight: false,         // Perform preflight checks
              preflightCommitment: 'processed', // Preflight commitment level
            });
          

            const blockhash = transaction.recentBlockhash
            const lastValidBlockHeight = transaction.lastValidBlockHeight

            if(!blockhash || !lastValidBlockHeight)
                throw new Error("Block hash or Block height not provided by server")
            
            // Confirm the transaction
            const confirmation = await connection.confirmTransaction({
              signature,
              blockhash,
              lastValidBlockHeight,
            });  // Specify the desired commitment level 

            if (confirmation.value.err) {
                throw new Error("Transaction failed to confirm");
            }

            storeClaimTransaction(publicKey.toBase58(), signature, solReceived)
            
            if(code && solShared)
                updateAffiliatedWallet(code, solShared)

            setStatusMessage(`Account closed successfully. Signature: ${signature}`);
            
        } catch (err) {
            console.error("Detailed error:", err);
            setStatusMessage('')
            setError('Error closing account: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
            setIsLoading(false);
            // Refresh the account list
            props.scanTokenAccounts()

            setTimeout(() => {
                setStatusMessage('')
                setError('')
            }, 3000) 
        }
    };

    return (<>
        <article className='account' key={account.pubkey}>
            <div className='account-info'>
                <p><b>Account: </b> <br/>{account.pubkey}</p>
                <p><b>Mint: </b><br/>{account.mint}</p>
                <p><b>Balance: </b><br/>{account.balance} Sol</p>
            </div>
            <button onClick={() => closeAccount(account.pubkey)}>
                Close Account
            </button>
        </article>
        {isLoading ? <Message state={MessageState.SUCCESS}>
                <p>Loading...</p>
            </Message> : <></>}

            {statusMessage ? <Message state={MessageState.SUCCESS}>
                <p>{statusMessage}</p>
            </Message> : <></>}

            {error ? <Message state={MessageState.ERROR}>
                <p>{error}</p>
            </Message> : <></>}
    </>
    );
};

export default Account;