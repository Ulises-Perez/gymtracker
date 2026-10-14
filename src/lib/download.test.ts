import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadCsv, exportFileName } from './download.ts';

/**
 * The browser half of the download, kept in its own module so it can be tested with the object URL
 * and the anchor stubbed. jsdom has no object URLs, so both are installed here by hand and both are
 * asserted: a URL that is created and never revoked leaks the whole file for the life of the tab.
 */

let blobs: Blob[];
let revoked: string[];
let clicked: HTMLAnchorElement[];
let nextUrl: number;

beforeEach(() => {
  blobs = [];
  revoked = [];
  clicked = [];
  nextUrl = 0;

  URL.createObjectURL = vi.fn((blob: Blob) => {
    blobs.push(blob);

    return `blob:gymtracker/${nextUrl++}`;
  });
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('exportFileName', () => {
  it('names the file after the day it was exported', () => {
    expect(exportFileName('2026-10-14')).toBe('gymtracker-2026-10-14.csv');
  });
});

describe('downloadCsv', () => {
  it('downloads the csv under the expected name, with the csv media type and the BOM intact', async () => {
    const csv = '\uFEFFdate;title\r\n2026-10-14;Piernas\r\n';

    downloadCsv('gymtracker-2026-10-14.csv', csv);

    expect(clicked).toHaveLength(1);
    const anchor = clicked[0]!;

    expect(anchor.download).toBe('gymtracker-2026-10-14.csv');
    expect(blobs[0]?.type).toBe('text/csv;charset=utf-8');
    /*
     * The BOM is asserted on the bytes and not on `blob.text()`: a Blob decoded as UTF-8 strips the
     * mark, so the text looks identical with or without it while the spreadsheet is the one that can
     * tell the difference. `EF BB BF` is the mark, and it is what makes the accents readable.
     */
    const head = new Uint8Array((await blobs[0]?.arrayBuffer()) ?? new ArrayBuffer(0)).slice(0, 3);

    expect([...head]).toEqual([0xef, 0xbb, 0xbf]);
    expect(await blobs[0]?.text()).toBe(csv.replace(/^\uFEFF/, ''));
    // The URL is handed to the anchor and then revoked, and the anchor is taken back out of the
    // document: a hidden one left behind is a link that keeps the file alive.
    expect(revoked).toEqual([anchor.href]);
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
