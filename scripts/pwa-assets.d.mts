/*
 * Types for the PWA asset contract.
 *
 * `scripts/pwa-assets.mjs` is plain JavaScript because it is read by the Node icon generator as well as
 * by Vite; this declaration is what lets `vite.config.ts`, which is type-checked, import the manifest
 * from it without a cast.
 */
import type { ManifestOptions } from 'vite-plugin-pwa';

export declare const PWA_MANIFEST: Partial<ManifestOptions>;
