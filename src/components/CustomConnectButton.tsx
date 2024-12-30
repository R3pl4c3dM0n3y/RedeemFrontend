import { useCallback, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Buffer } from "buffer";

interface CustomConnectButtonProps {
	setWalletAddress?: (address: string) => void;
}

export function CustomConnectButton({ setWalletAddress }: CustomConnectButtonProps) {
	const { publicKey, wallet, disconnect, connecting, connected } = useWallet();
	const { setVisible } = useWalletModal();

	useEffect(() => {
		if (publicKey && setWalletAddress) {
			setWalletAddress(publicKey.toBase58());
		}
	}, [publicKey, setWalletAddress]);

	const handleClick = useCallback(() => {
		if (connected) {
			disconnect();
		} else if (wallet) {
			setVisible(true);
		} else {
			setVisible(true);
		}
	}, [wallet, disconnect, connected, setVisible]);

	let label: string;
	let buttonClass: string = '';

	if (connected) {
		buttonClass = ''
		label = 'Disconnect';
	} else if (wallet) {
		buttonClass = 'cta-button'
		label = 'Connect';
	} else {
		buttonClass = 'cta-button'
		label = 'Claim Sol';
	}

	return (
		<>
			<button
				onClick={handleClick}
				disabled={connecting}
				className={buttonClass}
			>
				{label}
			</button>
			{/* We don't need to render wallet options here as it's handled by WalletModal */}
		</>
	);
}
window.Buffer = Buffer