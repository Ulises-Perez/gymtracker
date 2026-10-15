/*
 * A hand-rolled PNG codec, and the reason it exists.
 *
 * T7.1 needs icons the project itself draws from its own tokens. `sharp` and `canvas` are not
 * installed and the phase does not allow adding a dependency for a handful of flat geometric marks, so
 * the PNG is assembled by hand out of what the format actually is: an 8-byte signature, `IHDR`, `IDAT`
 * and `IEND`, with `zlib` doing the deflate and a CRC32 per chunk.
 *
 * Only 8-bit truecolour (colour type 2, RGB) is written. Every icon here is opaque paper with ink and
 * one red on top, so an alpha channel would only spend bytes describing transparency nobody asked for.
 *
 * Nothing below reads a clock, an environment variable or a random source -- and no `tIME` chunk is
 * ever written -- which is what makes the output reproducible. The determinism rule in
 * scripts/pwa-assets.test.mjs runs the generator twice and compares the bytes.
 */
import zlib from 'node:zlib';

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }

  return table;
})();

/** The CRC32 of the PNG spec (IEEE 802.3, reflected polynomial 0xEDB88320). */
export function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);

  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typed = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);

  return Buffer.concat([length, typed, crc]);
}

/**
 * Encodes an RGB buffer (`width * height * 3` bytes, row-major) as an 8-bit truecolour PNG.
 *
 * Every scanline is written with filter `None`, which is all this codec needs: the artwork is flat
 * colour and deflate is what does the compressing.
 */
export function encodePng({ width, height, rgb }) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter method: adaptive
  ihdr[12] = 0; // interlace: none

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);

  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function unfilterRow(filter, row, out, previous, bpp) {
  for (let i = 0; i < row.length; i += 1) {
    const left = i >= bpp ? out[i - bpp] : 0;
    const up = previous ? previous[i] : 0;
    const upLeft = previous && i >= bpp ? previous[i - bpp] : 0;

    switch (filter) {
      case 0:
        out[i] = row[i];
        break;
      case 1:
        out[i] = (row[i] + left) & 0xff;
        break;
      case 2:
        out[i] = (row[i] + up) & 0xff;
        break;
      case 3:
        out[i] = (row[i] + ((left + up) >> 1)) & 0xff;
        break;
      case 4:
        out[i] = (row[i] + paeth(left, up, upLeft)) & 0xff;
        break;
      default:
        throw new Error(`unknown PNG filter ${filter}`);
    }
  }
}

/**
 * Reads back a PNG this codec wrote: signature, chunk CRCs, `IHDR` and the inflated pixels.
 *
 * It exists so the tests can assert on what is really in the file instead of on the intent behind the
 * writer, and it verifies each chunk's CRC so a corrupted file fails loudly rather than as a wrong
 * pixel.
 */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG: bad signature');

  const chunkTypes = [];
  const idat = [];
  let header;
  let offset = 8;

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    const expected = buffer.readUInt32BE(offset + 8 + length);

    if (crc32(buffer.subarray(offset + 4, offset + 8 + length)) !== expected) {
      throw new Error(`bad CRC in ${type} chunk`);
    }

    chunkTypes.push(type);

    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }

    offset += 12 + length;
  }

  if (!header) throw new Error('PNG has no IHDR chunk');
  if (header.bitDepth !== 8 || header.colorType !== 2) {
    throw new Error(
      `unsupported PNG: bit depth ${header.bitDepth}, colour type ${header.colorType}`,
    );
  }

  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const stride = header.width * 3;
  const rgb = Buffer.alloc(stride * header.height);

  for (let y = 0; y < header.height; y += 1) {
    const start = y * (stride + 1);
    unfilterRow(
      inflated[start],
      inflated.subarray(start + 1, start + 1 + stride),
      rgb.subarray(y * stride, (y + 1) * stride),
      y === 0 ? null : rgb.subarray((y - 1) * stride, y * stride),
      3,
    );
  }

  return { ...header, chunkTypes, rgb };
}
