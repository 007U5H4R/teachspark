import './styles/global.css';
import { registerSW } from 'virtual:pwa-register';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App.tsx';
import { initAnalytics, initClarity } from './lib/analytics.ts';

initAnalytics(); // no-op unless VITE_MIXPANEL_TOKEN is set; must run before the first tracked event
initClarity();   // no-op unless VITE_CLARITY_ID is set; Clarity heatmaps + input-masked session replay

registerSW({
  immediate: true,
  onRegisterError(err) { console.error('[pwa] service worker registration failed', err); },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
