import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { initMonitoring } from './lib/monitoring.ts';
import { registerServiceWorker } from './lib/pwa.ts';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

initMonitoring();
registerServiceWorker();
