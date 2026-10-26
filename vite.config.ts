import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { PWA_MANIFEST } from './scripts/pwa-assets.mjs';
import type { Plugin } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    preloadLatinFonts(),
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
          // The same rule for the display face: Spanish never matches the
          // Vietnamese subset, and precaching it spends first install on text
          // the app cannot show.
          '**/archivo-vietnamese*',
        ],
      },
      // The manifest lives in scripts/pwa-assets.mjs next to the icon specs it references, so the
      // generator, the plugin and the tests read one definition instead of three copies.
      manifest: PWA_MANIFEST,
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
    // The icon generator is a build-time asset pipeline, not app code, so it lives in
    // scripts/ and brings its own tests: they assert a file format and a byte-level promise
    // (PNG signature, dimensions, determinism, the maskable safe circle), which only reads
    // back correctly from plain Node without a DOM.
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
  },
});

/**
 * The two latin fonts, asked for before the app's JavaScript instead of after.
 *
 * The browser discovers a font when it parses the CSS that declares it, and
 * that CSS arrives after the script tag: the 84 KiB of the two faces were
 * going on the wire only once the stylesheet was read, which is late for the
 * first paint. The preload puts them in flight with the script, so the text
 * paints in the face it was designed in instead of swapping into it later.
 *
 * Only the latin subsets are preloaded: the other subsets (cyrillic, greek,
 * vietnamese) are never fetched for a Spanish text, and preloading them would
 * download what nobody asked for.
 */
function preloadLatinFonts(): Plugin {
  return {
    name: 'preload-latin-fonts',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = bundle['index.html'];

      if (!html || html.type !== 'asset') {
        return;
      }

      const fonts = new Set<string>();

      for (const asset of Object.values(bundle)) {
        if (asset.type !== 'asset' || !asset.fileName.endsWith('.css')) {
          continue;
        }

        for (const match of String(asset.source).matchAll(
          /url\(([^)]*-latin-wght-normal-[^)]*)\)/g,
        )) {
          fonts.add(match[1]);
        }
      }

      if (fonts.size === 0) {
        return;
      }

      const links = [...fonts]
        .map((url) => `<link rel="preload" href="${url}" as="font" type="font/woff2" crossorigin>`)
        .join('\n    ');

      html.source = String(html.source).replace('</head>', `    ${links}\n  </head>`);
    },
  };
}
