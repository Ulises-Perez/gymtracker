import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { initMonitoring } from './lib/monitoring.ts';
import { installPersistFlush } from './lib/persist-flush.ts';
import { installSaveSync } from './lib/save-sync.ts';
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
// Outlives the render tree on purpose: a queue that is only flushed by a
// component would stop being flushed the moment that component unmounts.
installPersistFlush();

// Same reason, and the same shape. A resumed write reaches `success` with no hook
// mounted to hear it, so the draft would stay finished over a workout that was
// already saved — indistinguishable from one that failed.
installSaveSync();
