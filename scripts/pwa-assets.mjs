/*
 * The single source of truth for the PWA's static surface.
 *
 * Three places describe the same files -- the icon generator, the web manifest handed to VitePWA in
 * vite.config.ts, and the `<head>` of index.html -- and three places drift. They live here instead: the
 * generator writes exactly what `PNG_SPECS` and `SPLASH_SPECS` list, `PWA_MANIFEST` is passed to the plugin
 * untouched, and scripts/pwa-assets.test.mjs asserts that what ended up on disk and in the document
 * agrees with it.
 *
 * The colours are copied from the notebook's design tokens (`DESIGN.md`, mirrored in `src/index.css`)
 * rather than invented: cold off-white paper, ink, and the one red that means "this was replaced".
 */
export const PWA_COLORS = {
  paper: '#f3f2ee',
  ink: '#16171b',
  accent: '#c7342a',
};

export const APP_NAME = 'GymTracker';
export const APP_DESCRIPTION = 'Registrá tus entrenamientos, incluso sin señal.';

/**
 * The raster artwork the generator must produce.
 *
 * `artwork` picks the framing. `maskable` keeps every drawn pixel inside the maskable safe circle -- a
 * circle of radius 0.4 x the icon size -- because the launcher crops the edges to its own shape; `app`
 * may fill more of the square, since the iOS touch icon rounds the corners itself instead of cutting a
 * circle. `purpose` is what the manifest entry says, and its presence is what decides whether the file
 * is named there.
 */
export const PNG_SPECS = [
  { file: 'icons/icon-192.png', width: 192, height: 192, artwork: 'maskable', purpose: 'maskable' },
  { file: 'icons/icon-512.png', width: 512, height: 512, artwork: 'maskable', purpose: 'maskable' },
  { file: 'apple-touch-icon.png', width: 180, height: 180, artwork: 'app' },
  { file: 'og-image.png', width: 1200, height: 630, artwork: 'og' },
];

/**
 * The iOS launch images, and the media query that picks each one.
 *
 * iOS does not read launch images out of the manifest: each one is a `<link rel="apple-touch-startup-image">`
 * in the document with a `media` query naming the device box and pixel ratio. The query is built here so
 * that the document's copies are compared against a single definition instead of hand-kept in step.
 */
function splash(width, height, deviceWidth, deviceHeight, devicePixelRatio) {
  return {
    file: `splash/splash-${width}x${height}.png`,
    width,
    height,
    media: `(device-width: ${deviceWidth}px) and (device-height: ${deviceHeight}px) and (-webkit-device-pixel-ratio: ${devicePixelRatio}) and (orientation: portrait)`,
  };
}

/** The portrait iPhones still in use, from the 8/SE up to the 15 Pro Max. */
export const SPLASH_SPECS = [
  splash(1290, 2796, 430, 932, 3),
  splash(1179, 2556, 393, 852, 3),
  splash(1284, 2778, 428, 926, 3),
  splash(1170, 2532, 390, 844, 3),
  splash(1125, 2436, 375, 812, 3),
  splash(1242, 2688, 414, 896, 3),
  splash(828, 1792, 414, 896, 2),
  splash(750, 1334, 375, 667, 2),
];

/**
 * The web manifest, handed to VitePWA unchanged.
 *
 * `theme_color` and `background_color` are the paper, not a chrome colour: the notebook is what the
 * status bar and the launch splash should continue, and the old dark `#0a0a0f` belonged to a skin this
 * app no longer has.
 */
export const PWA_MANIFEST = {
  name: APP_NAME,
  short_name: APP_NAME,
  description: APP_DESCRIPTION,
  lang: 'es',
  dir: 'ltr',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: PWA_COLORS.paper,
  theme_color: PWA_COLORS.paper,
  icons: [
    { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ...PNG_SPECS.filter((spec) => spec.purpose).map((spec) => ({
      src: spec.file,
      sizes: `${spec.width}x${spec.height}`,
      type: 'image/png',
      purpose: spec.purpose,
    })),
  ],
};
