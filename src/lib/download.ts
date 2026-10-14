import { localIsoDate } from './utils.ts';

/**
 * Turning a string into a downloaded file.
 *
 * The browser half of the export, kept in its own module with no data and no screen: everything it
 * needs is a name and the text, so a test can hand it both and watch the object URL and the anchor
 * instead of driving a real download. The Blob, the object URL, the anchor and, above all, the
 * revocation live here — a URL that is created and never revoked keeps the whole file in memory for
 * the life of the tab.
 */

/** What a CSV is, said out loud so a browser does not guess it is plain text. */
export const CSV_MEDIA_TYPE = 'text/csv;charset=utf-8';

/**
 * The name the user sees in their downloads.
 *
 * Dated because two exports a week apart must not overwrite each other in a downloads folder. The
 * date is the local one, through `localIsoDate`, for the same reason the workout is filed by it: the
 * UTC day is tomorrow for an evening in Argentina.
 */
export function exportFileName(date: string = localIsoDate()): string {
  return `gymtracker-${date}.csv`;
}

/**
 * Hands the text to the browser as a file.
 *
 * The anchor is appended before the click and removed after — a detached anchor still fires in most
 * browsers, but not all of them, and the one it does not is the one that matters. The URL is revoked
 * as soon as the click returns, which is safe: the navigation has already taken its own reference to
 * the blob.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: CSV_MEDIA_TYPE });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;

  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}
