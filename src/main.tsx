import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { WalletProvider, ConnectionProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { Buffer } from 'buffer';


import '@solana/wallet-adapter-react-ui/styles.css';

window.Buffer = Buffer;

const wallets = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ConnectionProvider
      endpoint={"https://betterclaimsol.xyz/api/solana-endpoint"}
      config={{
        wsEndpoint: "wss://betterclaimsol.xyz/api/solana-endpoint"
      }}
    >
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </React.StrictMode>
);
