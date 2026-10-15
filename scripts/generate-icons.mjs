/*
 * The icon generator: the project draws its own icons from the notebook's tokens.
 *
 * T7.1 decided the app's icons are neither hand-drawn files nor downloads but artifacts the repository
 * regenerates -- if the world changes, the icons are rebuilt with it, which is why the favicon that came
 * with the scaffold (a purple gradient, from a design system that never existed here) is replaced by the
 * output of this script. There is no image library installed and none may be added, so the mark is
 * defined as flat geometry, rasterised through an anti-aliased signed-distance coverage, and written as
 * PNGs by scripts/png.mjs.
 *
 * Everything is a pure function of the constants below. Run it after changing the tokens:
 *
 *   node scripts/generate-icons.mjs
 *
 * and it rewrites `public/` in place. `scripts/pwa-assets.test.mjs` fails if what was committed does not
 * match a fresh run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './png.mjs';
import { PNG_SPECS, PWA_COLORS, SPLASH_SPECS } from './pwa-assets.mjs';

/*
 * The mark, in a 1000 x 1000 design square centred on (500, 500).
 *
 * Three ruled rows of the notebook, and one correction stroke through the last of them: the page is what
 * the product is, and struck-through-and-replaced is the only thing the red ever means. The stroke is
 * the signature, not decoration -- it is the moment the app exists for, drawn in the icon.
 */
const MARK = [
  { kind: 'roundRect', x: 250, y: 300, w: 500, h: 56, tone: 'ink' },
  { kind: 'roundRect', x: 250, y: 444, w: 500, h: 56, tone: 'ink' },
  { kind: 'roundRect', x: 250, y: 588, w: 380, h: 56, tone: 'ink' },
  { kind: 'capsule', ax: 232, ay: 668, bx: 768, by: 596, radius: 30, tone: 'accent' },
];

const DESIGN_SIZE = 1000;
const DESIGN_CENTRE = DESIGN_SIZE / 2;

function distanceFromCentre(x, y) {
  return Math.hypot(x - DESIGN_CENTRE, y - DESIGN_CENTRE);
}

/**
 * The farthest drawn point from the centre, in design units.
 *
 * It is measured rather than written down so that redrawing the mark cannot quietly break the maskable
 * guarantee: every artwork is scaled down until this radius fits the box it is allowed to occupy.
 */
const MARK_RADIUS = Math.max(
  ...MARK.flatMap((shape) =>
    shape.kind === 'roundRect'
      ? [
          [shape.x, shape.y],
          [shape.x + shape.w, shape.y],
          [shape.x, shape.y + shape.h],
          [shape.x + shape.w, shape.y + shape.h],
        ].map(([x, y]) => distanceFromCentre(x, y))
      : [
          distanceFromCentre(shape.ax, shape.ay) + shape.radius,
          distanceFromCentre(shape.bx, shape.by) + shape.radius,
        ],
  ),
);

/*
 * How much of the canvas the mark may occupy, as the radius it is allowed to reach.
 *
 * `maskable` is the one that matters: Android crops a maskable icon to a shape of its choosing inside a
 * safe circle of radius 0.4 x size, so anything past that can be cut off. 0.38 leaves the anti-aliased
 * edge inside the boundary instead of exactly on it.
 */
const ARTWORK_RADIUS = {
  maskable: (width, height) => 0.38 * Math.min(width, height),
  app: (width, height) => 0.46 * Math.min(width, height),
  og: (width, height) => 0.34 * Math.min(width, height),
  splash: (width, height) => 0.16 * Math.min(width, height),
};

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

const TONES = {
  ink: hexToRgb(PWA_COLORS.ink),
  accent: hexToRgb(PWA_COLORS.accent),
};

/** Signed distance to the shape's boundary, in design units; negative inside. */
function signedDistance(shape, x, y) {
  if (shape.kind === 'roundRect') {
    const halfWidth = shape.w / 2;
    const halfHeight = shape.h / 2;
    const radius = Math.min(halfWidth, halfHeight); // the ruled rows are pills
    const qx = Math.abs(x - (shape.x + halfWidth)) - (halfWidth - radius);
    const qy = Math.abs(y - (shape.y + halfHeight)) - (halfHeight - radius);

    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
  }

  // A capsule is a segment with round caps.
  const segmentX = shape.bx - shape.ax;
  const segmentY = shape.by - shape.ay;
  const pointX = x - shape.ax;
  const pointY = y - shape.ay;
  const t = Math.max(
    0,
    Math.min(1, (pointX * segmentX + pointY * segmentY) / (segmentX ** 2 + segmentY ** 2)),
  );

  return Math.hypot(pointX - segmentX * t, pointY - segmentY * t) - shape.radius;
}

function deviceBox(shape, scale, centreX, centreY) {
  const toDeviceX = (x) => centreX + (x - DESIGN_CENTRE) * scale;
  const toDeviceY = (y) => centreY + (y - DESIGN_CENTRE) * scale;
  const bounds =
    shape.kind === 'roundRect'
      ? [shape.x, shape.y, shape.x + shape.w, shape.y + shape.h]
      : [
          Math.min(shape.ax, shape.bx) - shape.radius,
          Math.min(shape.ay, shape.by) - shape.radius,
          Math.max(shape.ax, shape.bx) + shape.radius,
          Math.max(shape.ay, shape.by) + shape.radius,
        ];

  return {
    x0: toDeviceX(bounds[0]),
    y0: toDeviceY(bounds[1]),
    x1: toDeviceX(bounds[2]),
    y1: toDeviceY(bounds[3]),
  };
}

function paint(rgb, width, height, shape, color, scale, centreX, centreY) {
  const box = deviceBox(shape, scale, centreX, centreY);
  const x0 = Math.max(0, Math.floor(box.x0 - 1));
  const y0 = Math.max(0, Math.floor(box.y0 - 1));
  const x1 = Math.min(width, Math.ceil(box.x1 + 1));
  const y1 = Math.min(height, Math.ceil(box.y1 + 1));

  for (let y = y0; y < y1; y += 1) {
    const designY = (y + 0.5 - centreY) / scale + DESIGN_CENTRE;

    for (let x = x0; x < x1; x += 1) {
      const designX = (x + 0.5 - centreX) / scale + DESIGN_CENTRE;
      // Coverage over one pixel of the edge is what keeps the 192 px icon from looking jagged.
      const coverage = Math.max(
        0,
        Math.min(1, 0.5 - signedDistance(shape, designX, designY) * scale),
      );

      if (coverage <= 0) continue;

      const offset = (y * width + x) * 3;
      rgb[offset] = Math.round(rgb[offset] * (1 - coverage) + color[0] * coverage);
      rgb[offset + 1] = Math.round(rgb[offset + 1] * (1 - coverage) + color[1] * coverage);
      rgb[offset + 2] = Math.round(rgb[offset + 2] * (1 - coverage) + color[2] * coverage);
    }
  }
}

/**
 * The mark on paper, as an RGB buffer: width x height x 3 bytes, row-major.
 *
 * `artwork` is one of the keys of `ARTWORK_RADIUS` and decides how much of the canvas the mark fills.
 */
export function renderArtwork({ width, height, artwork }) {
  const rgb = Buffer.alloc(width * height * 3);
  const paper = hexToRgb(PWA_COLORS.paper);
  const paperRow = Buffer.alloc(width * 3);

  for (let x = 0; x < width; x += 1) paperRow.set(paper, x * 3);
  for (let y = 0; y < height; y += 1) paperRow.copy(rgb, y * width * 3);

  const scale = ARTWORK_RADIUS[artwork](width, height) / MARK_RADIUS;
  const centreX = width / 2;
  const centreY = height / 2;

  for (const shape of MARK) {
    paint(rgb, width, height, shape, TONES[shape.tone], scale, centreX, centreY);
  }

  return rgb;
}

/**
 * The same mark as an SVG, for the favicon.
 *
 * A tab paints the favicon at whatever size the browser likes and an SVG has no size to lose, so the
 * favicon is vector while every place that needs a raster asks for a PNG above.
 */
export function markSvg() {
  const rows = MARK.map((shape) => {
    const fill = shape.tone === 'ink' ? PWA_COLORS.ink : PWA_COLORS.accent;

    if (shape.kind === 'roundRect') {
      const rx = Math.min(shape.w, shape.h) / 2;
      return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="${rx}" fill="${fill}"/>`;
    }

    return `<line x1="${shape.ax}" y1="${shape.ay}" x2="${shape.bx}" y2="${shape.by}" stroke="${fill}" stroke-width="${shape.radius * 2}" stroke-linecap="round"/>`;
  }).join('');

  return [
    '<!-- Generated by scripts/generate-icons.mjs from the design tokens. Do not edit by hand. -->',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DESIGN_SIZE} ${DESIGN_SIZE}" width="${DESIGN_SIZE}" height="${DESIGN_SIZE}">`,
    `<rect width="${DESIGN_SIZE}" height="${DESIGN_SIZE}" fill="${PWA_COLORS.paper}"/>`,
    rows,
    '</svg>',
    '',
  ].join('\n');
}

function write(outDir, file, contents) {
  const target = path.join(outDir, file);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

/** Writes every declared asset under `outDir` and returns the relative paths it wrote, in order. */
export function generateAll(outDir) {
  const written = [];

  for (const spec of PNG_SPECS) {
    write(
      outDir,
      spec.file,
      encodePng({ width: spec.width, height: spec.height, rgb: renderArtwork(spec) }),
    );
    written.push(spec.file);
  }

  for (const spec of SPLASH_SPECS) {
    write(
      outDir,
      spec.file,
      encodePng({
        width: spec.width,
        height: spec.height,
        rgb: renderArtwork({ ...spec, artwork: 'splash' }),
      }),
    );
    written.push(spec.file);
  }

  write(outDir, 'favicon.svg', Buffer.from(markSvg(), 'utf8'));
  written.push('favicon.svg');

  return written;
}

const isDirectRun =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

  for (const file of generateAll(publicDir)) console.log(`wrote public/${file}`);
}
