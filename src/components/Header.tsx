import React, { ChangeEventHandler, Dispatch } from 'react'
import './Header.css'
import { Affiliation } from './Affiliation';

interface HeaderComponentProps {
    walletAddress: string | null;
    setWalletAddress: Dispatch<React.SetStateAction<string | null>>;
    darkMode: boolean,
    toggle: ChangeEventHandler<HTMLInputElement> | undefined,
}



export function Header(props: HeaderComponentProps) {

    return (<header>
        <div className='header-content'>
            <div className='links'>
                <a href="https://t.me/BetterClaimSol" id="telegram-bot-link" target="_blank" rel="noopener noreferrer" title="Telegram Bot">
                    <img src="/images/telegram.png" alt="Telegram" />
                </a>
                <a href="https://x.com/RedeemOnSol" id="x-account-link" target="_blank" rel="noopener noreferrer" title="Share on X">
                    <img src="/images/x.png" alt="X" />
                </a>
            </div>
            <div className='header-actions'>
                {props.walletAddress && <Affiliation walletAddress={props.walletAddress}></Affiliation>}
                <div className="theme-switch-wrapper">
                    <label className="theme-switch" htmlFor="checkbox">
                        <input
                            type="checkbox"
                            id="checkbox"
                            checked={props.darkMode}
                            onChange={props.toggle}
                        />
                        <div className="slider round">
                            <span className="sun">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12zm0-2a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM11 1h2v3h-2V1zm0 19h2v3h-2v-3zM3.515 4.929l1.414-1.414L7.05 5.636 5.636 7.05 3.515 4.93zM16.95 18.364l1.414-1.414 2.121 2.121-1.414 1.414-2.121-2.121zm2.121-14.85l1.414 1.415-2.121 2.121-1.414-1.414 2.121-2.121zM5.636 16.95l1.414 1.414-2.121 2.121-1.414-1.414 2.121-2.121zM23 11v2h-3v-2h3zM4 11v2H1v-2h3z" /></svg>
                            </span>
                            <span className="moon">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z" /></svg>
                            </span>
                        </div>
                    </label>
                </div>
            </div>
        </div>

    </header>)
}