import './lib/deployment';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WalletProvider } from './lib/wallet';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WalletProvider>
      <App />
    </WalletProvider>
  </StrictMode>,
);
