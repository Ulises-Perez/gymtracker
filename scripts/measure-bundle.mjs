import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * The initial bundle, measured the same way every time.
 *
 * It exists as a committed script because the review found the numbers were not comparable: the same
 * project reported 117.99, 118.72 and 118.81 kB for the same phase depending on the `.env`, on the
 * gzip implementation, and on whether whoever measured remembered to include the CSS. A number without
 * its method is not a number.
 *
 * The method, frozen here: everything `dist/index.html` references — JavaScript **and** CSS — gzipped
 * at level 9. Run it after a build:
 *
 *   npm run build && node scripts/measure-bundle.mjs
 *
 * The budget is 180 kB and it comes from S11 of the plan; an oversized bundle is reported with the
 * exact figure before anybody decides anything else.
 */
const dist = path.resolve('dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const referenced = [
  ...new Set([...html.matchAll(/assets\/[A-Za-z0-9._-]+\.(?:js|css)/g)].map((match) => match[0])),
];

let total = 0;

for (const file of referenced.sort()) {
  const size = zlib.gzipSync(fs.readFileSync(path.join(dist, file)), { level: 9 }).length;

  total += size;
  console.log(`${(size / 1024).toFixed(2)} kB  ${file}`);
}

console.log(`INICIAL (JS + CSS, gzip 9): ${(total / 1024).toFixed(2)} kB de 180`);
