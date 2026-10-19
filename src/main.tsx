import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ui/ErrorBoundary.tsx';
import { installGlobalErrorHandlers } from './lib/logging.ts';
import { installPersistFlush } from './lib/persist-flush.ts';
import { installSaveSync } from './lib/save-sync.ts';
import { registerServiceWorker } from './lib/pwa.ts';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root not found');
}

/*
 * The single point of entry for the app's error handling, and the whole of it: there is no
 * monitoring SDK (T7.6). The boundary catches what breaks the render; these two listeners
 * catch what React never sees, an error thrown outside it and a promise nobody handled.
 *
 * Installed before the first render so nothing that happens during startup goes unrecorded,
 * and outside the render tree on purpose: the crash it has to survive is the tree breaking.
 */
installGlobalErrorHandlers();

createRoot(rootElement).render(
  <StrictMode>
    {/* Above the router on purpose: a screen that throws must not take the app's shell with it,
        and the fallback must still be able to say what happened. */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

registerServiceWorker();
// Outlives the render tree on purpose: a queue that is only flushed by a
// component would stop being flushed the moment that component unmounts.
installPersistFlush();

// Same reason, and the same shape. A resumed write reaches `success` with no hook
// mounted to hear it, so the draft would stay finished over a workout that was
// already saved — indistinguishable from one that failed.
installSaveSync();
