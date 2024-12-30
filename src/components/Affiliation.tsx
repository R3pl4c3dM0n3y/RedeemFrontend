import { useEffect, useRef, useState } from 'react';
import { getCookie, setCookie } from '../utils/cookies';
import { getReferralInfo } from '../api/affiliation';

import "./Affiliation.css"

interface AffiliationProps {
    walletAddress: string
}

const DOMAIN = "betterclaimsol.xyz"

export function Affiliation(props: AffiliationProps) {

    const [referralCode, setReferralCode] = useState("")
    const [solReceived, setSolReceived] = useState(0)

    const [affiliationOpen, setAffiliationOpen] = useState(false)

    const [copySuccess, setCopySuccess] = useState<string | null>(null); // To track copy success feedback


    // Use ref to target the affiliation wrapper
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const currentUrl = window.location.href
        const url = new URL(currentUrl);

        // Use URLSearchParams to get query parameters
        const queryParams = new URLSearchParams(url.search);
        const code = queryParams.get('referral_code');

        if (code && !getCookie("referral_code")) {
            setCookie("referral_code", code, 30)
        }
    })

    useEffect(() => {
        
        if (!props.walletAddress)
            return

        getReferralInfo(props.walletAddress)
            .then((referralInfo) => {
                if (referralInfo["referral_code"])
                    setReferralCode(referralInfo["referral_code"])
                if (referralInfo["sol_received"])
                    setSolReceived(parseFloat(referralInfo["sol_received"]))
            })
            .catch(err => {
                console.error(err)
            })

    }, [props.walletAddress])

    // Effect to close the affiliation when clicking outside of the wrapper
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setAffiliationOpen(false); // Close affiliation
            }
        }

        // Add event listener when affiliation is open
        if (affiliationOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        // Clean up the event listener when the component unmounts or affiliation closes
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [affiliationOpen]);


    function toggle() {
        setAffiliationOpen(!affiliationOpen)
    }

    // Function to handle the "Copy Referral Link" button click
    function copyToClipboard() {
        const referralLink = `https://${DOMAIN}?referral_code=${referralCode}`;

        navigator.clipboard.writeText(referralLink)
            .then(() => {
                setCopySuccess("Copied to clipboard!"); // Show success message
                setTimeout(() => setCopySuccess(null), 2000); // Hide message after 2 seconds
            })
            .catch(err => {
                console.error('Failed to copy: ', err);
                setCopySuccess("Failed to copy."); // Show error message
            });
    }

    return (
        <div ref={wrapperRef} className="affiliation-wrapper">
            <article className={`affiliation ${affiliationOpen ? 'affiliation-visible' : 'affiliation-hidden'}`}>
                <p style={{
                    marginBottom: "40px"
                }}><b>Earn SOL by Bringing Friends!</b></p>

                <span style={{display: "block", fontSize: "0.8rem", lineHeight: "1em"}}>You’ll need at least 0.002 SOL in your wallet to receive rewards</span>

                <div style={{
                    marginTop: "20px",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr"
                }}>
                    <div>
                        <span>Referral Code:</span>
                        <p className='gradient-text'>{referralCode}</p>
                    </div>
                    <div>
                        <span>Sol Earned:</span>
                        <p className='gradient-text'>{solReceived} SOL</p>
                    </div>
                </div>
                <div style={{
                    marginTop: "20px"
                }}>
                    <div>
                        <span>Referral Link:</span>
                        <p className='gradient-text'>https://{DOMAIN}?referral_code={referralCode}</p>
                    </div>

                    {/* Display success or error message */}
                    {copySuccess && <p style={{
                        fontSize: "14px",
                    }}>{copySuccess}</p>}
                    <button onClick={copyToClipboard} style={{
                        width: "100%",
                        marginTop: "20px",
                        borderRadius: "24px"
                    }}>Copy Referral Link</button>

                </div>
            </article>
            <button onClick={toggle} className="affiliate-button">
                <span className={`affiliate-text ${affiliationOpen ? 'affiliate-text-hide' : 'affiliate-text-show'}`}>
                    Affiliate
                </span>
                <span className={`affiliate-text ${affiliationOpen ? 'affiliate-text-show' : 'affiliate-text-hide'}`}>
                    Close
                </span>
            </button>


        </div>
    )
}