import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      // Registration is owned by src/lib/pwa.ts through virtual:pwa-register,
      // so the plugin must not inject a second one.
      injectRegister: null,
      injectManifest: {
        // woff2 is not in the plugin default: without it the app shell would
        // render offline with fallback fonts. favicon and the web manifest are
        // already added by the plugin, so they are not in the glob to avoid
        // duplicate precache entries.
        globPatterns: ['**/*.{js,css,html,woff2}'],
        globIgnores: [
          // Bundle-analysis report: dev tooling, never worth caching.
          '**/stats.html',
          // The app is Spanish-facing; ship latin + latin-ext only and keep
          // ~85 KiB of Cyrillic, Greek and Vietnamese subsets out of the cache.
          '**/inter-cyrillic*',
          '**/inter-greek*',
          '**/inter-vietnamese*',
        ],
      },
      manifest: {
        name: 'GymTracker',
        short_name: 'GymTracker',
        description: 'Registrá tus entrenamientos, incluso sin señal.',
        lang: 'es',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0a0a0f',
        theme_color: '#0a0a0f',
        // T7.1 replaces this with real 192/512 maskable PNGs.
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
    // Bundle budget evidence for the T0.8 baseline. Written outside dist so the
    // report is never precached by the service worker nor deployed.
    visualizer({
      filename: 'stats/bundle.html',
      gzipSize: true,
      brotliSize: true,
      template: 'treemap',
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    /*
     * Fifteen seconds per test, where the default is five.
     *
     * Several screens resolve lazy chunks — the exercise list carries dnd-kit and Motion, the
     * exercise screen carries uPlot — so a test that looks like a render is also waiting on a dynamic
     * `import()`. Under a full parallel run that wait has gone past five seconds, and the file passes
     * on its own while the suite fails it.
     *
     * This is the knob that was actually needed. The first attempt raised Testing Library's
     * `asyncUtilTimeout` instead, which governs how long a `findBy` waits and not how long a test may
     * run; the number not moving at all when it was raised is what said so.
     */
    testTimeout: 15_000,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
