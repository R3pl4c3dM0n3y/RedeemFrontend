import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import "./AccountsScanner.css"
import { closeAccountWithBalanceTransaction } from '../../api/accounts';
import { TokenAccount } from '../../interfaces/TokenAccount';
import "./Account.css"
import { Message, MessageState } from '../Message';
import { storeClaimTransaction } from '../../api/claimTransactions';
import { getCookie } from '../../utils/cookies';
import { updateAffiliatedWallet } from '../../api/affiliation';


interface AccountProps {
    index: number,
    account: TokenAccount
    scanTokenAccounts: (arg0: boolean) => void
}


function AccountWithBalance(props: AccountProps) {
    const { publicKey, signTransaction } = useWallet();
    const [isLoading, setIsLoading] = useState(false);
    const { connection } = useConnection();
    const [error, setError] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    const account = props.account

    async function closeAccountWIthBalance(accountPubkey: string): Promise<void> {
        if (!publicKey) {
            setError("Wallet not connected");
            return;
        }

        if (!signTransaction)
            throw new Error("Error signing transaction")

        try {
            setIsLoading(true);
            setError(null);

            const accountToClose = new PublicKey(accountPubkey);

            const code = getCookie("referral_code")
            const { transaction, solReceived, solShared } = await closeAccountWithBalanceTransaction(publicKey, accountToClose, code)

            const signedTransaction = await signTransaction(transaction);
            
            let blockhash = transaction.recentBlockhash
            let lastValidBlockHeight = transaction.lastValidBlockHeight

            if(!blockhash || !lastValidBlockHeight){
                const latestBlockhash = await connection.getLatestBlockhash();
                transaction.recentBlockhash = latestBlockhash.blockhash;
                transaction.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
                blockhash = transaction.recentBlockhash
                lastValidBlockHeight = transaction.lastValidBlockHeight
            }

            // Serialize the signed transaction
            const serializedTransaction = signedTransaction.serialize();

            // Send the signed transaction
            const signature = await connection.sendRawTransaction(serializedTransaction, {
                skipPreflight: false,         // Perform preflight checks
                preflightCommitment: 'confirmed', // Preflight commitment level
            });

            if(!transaction.recentBlockhash)
                throw new Error("Block hash not provided by server")


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

            if (code && solShared){
                await updateAffiliatedWallet(publicKey.toBase58(), solShared)
            }
            setStatusMessage(`Account closed successfully. Signature: ${signature}`);
            // Refresh the account list
        } catch (err) {
            console.error("Detailed error:", err);
            setStatusMessage('')
            setError('Error closing account: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
            setIsLoading(false);
            // Refresh the account list
            setTimeout(() => {
                props.scanTokenAccounts(true)
            }, 3000);

        }
    };


    return (<>
        <div
            key={account.pubkey}
            className="account-item"
            style={{ animationDelay: `${props.index * 0.1}s` }}>
            <article className='account' key={account.pubkey}>
                <div className='account-info'>
                    <img src={account.logo} alt={account.name} />
                    <p><b>{account.name}</b></p>
                    <p><b>{account.balance} {account.symbol}</b></p>
                    <a href={'https://solscan.io/token/' + account.mint} target='_blank'><b>{account.mint.toString().substring(0, 10)}...</b></a>
                </div>
                <button onClick={() => closeAccountWIthBalance(account.pubkey)}>
                    { !isLoading ? "Force Close" :
                        <div className="loading-circle"></div>
                    }
                </button>
            </article>
        </div>

        {statusMessage && !error ? <Message state={MessageState.SUCCESS}>
            <p>{statusMessage}</p>
        </Message> : <></>}

        {error ? <Message state={MessageState.ERROR}>
            <p>{error}</p>
        </Message> : <></>}
    </>);
};

export default AccountWithBalance;