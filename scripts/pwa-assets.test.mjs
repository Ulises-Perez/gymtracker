// @vitest-environment node
/*
 * T7.1's rules, asserted where they can actually be checked.
 *
 * The icon generator's promise is a file format and a byte-level guarantee, so these tests read the
 * bytes back instead of trusting the intent: the PNG signature and the declared dimensions, the same
 * input producing the same file twice, and the mark staying inside the maskable safe circle. The rest
 * assert the wiring the icons exist for -- the manifest that names them and the <head> that points iOS
 * splash screens and link previews at them -- plus the declarations those two already had, so replacing
 * their contents cannot silently drop something the project depended on.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateAll } from './generate-icons.mjs';
import { decodePng, PNG_SIGNATURE } from './png.mjs';
import { PNG_SPECS, PWA_COLORS, PWA_MANIFEST, SPLASH_SPECS } from './pwa-assets.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(repoRoot, 'public');
const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

/** A fresh generation in a temp directory, for the reproducibility test. */
let generated;

beforeAll(() => {
  generated = fs.mkdtempSync(path.join(os.tmpdir(), 'gymtracker-icons-'));
  generateAll(generated);
});

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

describe('the icon generator', () => {
  it('ships real PNGs at the sizes it declares', () => {
    for (const spec of [...PNG_SPECS, ...SPLASH_SPECS]) {
      const buffer = fs.readFileSync(path.join(publicDir, spec.file));

      expect(
        buffer.subarray(0, 8).equals(PNG_SIGNATURE),
        `${spec.file} starts with the PNG signature`,
      ).toBe(true);
      const png = decodePng(buffer);
      expect([png.width, png.height], `${spec.file} dimensions`).toEqual([spec.width, spec.height]);
    }
  });

  it('produces the same bytes on every run, and the committed files are those bytes', () => {
    const second = fs.mkdtempSync(path.join(os.tmpdir(), 'gymtracker-icons-'));

    for (const file of generateAll(second)) {
      const fresh = fs.readFileSync(path.join(second, file));

      expect(
        fs.readFileSync(path.join(generated, file)).equals(fresh),
        `${file} is reproducible`,
      ).toBe(true);
      expect(
        fs.existsSync(path.join(publicDir, file)) &&
          fs.readFileSync(path.join(publicDir, file)).equals(fresh),
        `public/${file} matches a fresh generation (run: node scripts/generate-icons.mjs)`,
      ).toBe(true);
    }
  });

  it('keeps every maskable pixel inside the safe circle', () => {
    const paper = hexToRgb(PWA_COLORS.paper);

    for (const spec of PNG_SPECS.filter((candidate) => candidate.artwork === 'maskable')) {
      const png = decodePng(fs.readFileSync(path.join(publicDir, spec.file)));
      const safeRadius = 0.4 * Math.min(png.width, png.height);
      const centreX = png.width / 2;
      const centreY = png.height / 2;
      let drawn = 0;
      let outside = 0;

      for (let y = 0; y < png.height; y += 1) {
        for (let x = 0; x < png.width; x += 1) {
          const offset = (y * png.width + x) * 3;
          if (
            png.rgb[offset] === paper[0] &&
            png.rgb[offset + 1] === paper[1] &&
            png.rgb[offset + 2] === paper[2]
          ) {
            continue;
          }

          drawn += 1;
          // One pixel of grace: the anti-aliased edge is supposed to sit on the boundary.
          if (Math.hypot(x + 0.5 - centreX, y + 0.5 - centreY) > safeRadius + 1) outside += 1;
        }
      }

      expect(drawn, `${spec.file} carries a visible mark`).toBeGreaterThan(0);
      expect(outside, `${spec.file} stays inside the 0.4 x size safe circle`).toBe(0);
    }
  });
});

describe('the web manifest', () => {
  it('names the generated maskable icons and the notebook colours', () => {
    expect(PWA_MANIFEST.display).toBe('standalone');
    expect(PWA_MANIFEST.start_url).toBe('/');
    expect(PWA_MANIFEST.background_color).toBe(PWA_COLORS.paper);
    expect(PWA_MANIFEST.theme_color).toBe(PWA_COLORS.paper);

    const maskable = PWA_MANIFEST.icons.filter((icon) => icon.purpose === 'maskable');
    expect(maskable.map((icon) => icon.sizes).sort()).toEqual(['192x192', '512x512']);

    for (const icon of maskable) {
      expect(icon.type).toBe('image/png');
      const spec = PNG_SPECS.find((candidate) => candidate.file === icon.src);
      expect(spec, `${icon.src} is produced by the generator`).toBeDefined();
      expect(icon.sizes).toBe(`${spec.width}x${spec.height}`);
      expect(fs.existsSync(path.join(publicDir, icon.src)), `public/${icon.src} exists`).toBe(true);
    }
  });

  it('keeps the declaration the project already had', () => {
    expect(PWA_MANIFEST).toMatchObject({
      name: 'GymTracker',
      short_name: 'GymTracker',
      description: 'Registrá tus entrenamientos, incluso sin señal.',
      lang: 'es',
      dir: 'ltr',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
    });
    expect(PWA_MANIFEST.icons).toContainEqual({
      src: 'favicon.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'any',
    });
  });
});

describe('the document head', () => {
  it('points iOS at the splash images and link previews at the share card', () => {
    expect(indexHtml).toContain('<meta name="theme-color" content="#f3f2ee" />');
    expect(indexHtml).toContain(
      '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />',
    );
    expect(indexHtml).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(indexHtml).toContain(
      '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
    );
    expect(indexHtml).toContain('<meta name="apple-mobile-web-app-title" content="GymTracker" />');
    expect(indexHtml).toContain('<meta property="og:title" content="GymTracker" />');
    expect(indexHtml).toContain(
      '<meta property="og:description" content="Registrá tus entrenamientos, incluso sin señal." />',
    );
    expect(indexHtml).toContain('<meta property="og:image" content="/og-image.png" />');

    for (const spec of SPLASH_SPECS) {
      expect(indexHtml, `${spec.file} is linked`).toContain(`href="/${spec.file}"`);
      expect(indexHtml, `${spec.file} media query`).toContain(`media="${spec.media}"`);
    }
    expect(indexHtml.match(/rel="apple-touch-startup-image"/g)).toHaveLength(SPLASH_SPECS.length);
  });

  it('keeps the head tags the document already had', () => {
    expect(indexHtml).toContain('<html lang="es">');
    expect(indexHtml).toContain('<meta charset="UTF-8" />');
    expect(indexHtml).toContain(
      'content="width=device-width, initial-scale=1.0, viewport-fit=cover"',
    );
    expect(indexHtml).toContain('<title>GymTracker</title>');
    expect(indexHtml).toContain(
      '<meta name="description" content="Registrá tus entrenamientos, incluso sin señal." />',
    );
    expect(indexHtml).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
  });
});
