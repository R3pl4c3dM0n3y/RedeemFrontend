import { useState} from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import "./AccountsScanner.css"
import SimpleMode from './SimpleMode';
import AdvancedMode from './AdvancedMode';
import { CustomConnectButton } from '../CustomConnectButton';


enum Mode {
    SIMPLE = "simple",
    ADVANCED = "advanced"
}

interface AccountsScannerProps {
    walletAddress: string,
    setWalletAddress: (arg0: string) => void
}


function AccountsScanner(props: AccountsScannerProps) {
    const { publicKey } = useWallet();

    const [mode, setMode] = useState<Mode>(Mode.SIMPLE)


    function toggleMode() {
        if (mode == Mode.SIMPLE)
            setMode(Mode.ADVANCED)
        else setMode(Mode.SIMPLE)
    }


    if (!publicKey) return <WalletMultiButton />;

    return (
        <section className='account-scanner'>

            <div className="mode-switch-wrapper">
                <label className="mode-switch">
                    <input
                        type="checkbox"
                        id="checkbox"
                        checked={mode == Mode.ADVANCED}
                        onChange={toggleMode}
                    />
                    <div className="mode-slider round">
                        <span className="simple">
                            simple
                        </span>
                        <span className="advanced">
                            advanced
                        </span>
                    </div>
                </label>
            </div>
            <div className='wallet-wrapper'>
                <p>{`${props.walletAddress.substring(0, 5)}...${props.walletAddress.substring(props.walletAddress.length - 5, props.walletAddress.length)}`}</p>
                { <CustomConnectButton setWalletAddress={ props.setWalletAddress} />}
            </div>
            

            {mode == Mode.SIMPLE ?
                <SimpleMode></SimpleMode> :
                <AdvancedMode></AdvancedMode>
            }
            
        </section>
    );
};

export default AccountsScanner;