import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeSupabase } from '../testing/fake-supabase.ts';
import {
  AVATAR_BUCKET,
  AVATAR_MAX_BYTES,
  AVATAR_SIZE_ERROR,
  AVATAR_TYPE_ERROR,
  avatarPathFromPublicUrl,
  removeAvatarObject,
  uploadAvatarObject,
  validateAvatarFile,
} from './avatar-api.ts';
import { getSupabase } from './supabase.ts';

vi.mock('./supabase.ts', () => ({ getSupabase: vi.fn() }));

const USER_ID = '00000000-0000-4000-a000-000000000001';
const OTHER_ID = '00000000-0000-4000-a000-000000000002';

let fake: ReturnType<typeof createFakeSupabase>;

/** A file as the screen hands it over: jsdom has `File`, so the upload input's own type is used. */
function imageFile(type: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], 'foto', { type });
}

/** The public URL the storage client builds, which is what the profile column ends up holding. */
function publicUrlFor(path: string): string {
  return fake.storage.getPublicUrl(path).data.publicUrl;
}

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
});

/**
 * Rule one: what the picker may hand over.
 *
 * The bucket has no `file_size_limit` and no `allowed_mime_types` (0001 inserts only the id, the name
 * and the public flag), so this is the only ceiling there is — and it speaks Spanish, because it is
 * the copy the user reads.
 */
describe('validateAvatarFile', () => {
  it('accepts the three image types the app renders, and refuses the rest in Spanish', () => {
    expect(validateAvatarFile({ type: 'image/png', size: 1024 })).toBeNull();
    expect(validateAvatarFile({ type: 'image/jpeg', size: 1024 })).toBeNull();
    expect(validateAvatarFile({ type: 'image/webp', size: 1024 })).toBeNull();

    // SVG is a document and GIF is an animation; neither is what an avatar is, and both are excluded
    // on purpose rather than by omission.
    expect(validateAvatarFile({ type: 'image/svg+xml', size: 1024 })).toBe(AVATAR_TYPE_ERROR);
    expect(validateAvatarFile({ type: 'image/gif', size: 1024 })).toBe(AVATAR_TYPE_ERROR);
    expect(validateAvatarFile({ type: 'application/pdf', size: 1024 })).toBe(AVATAR_TYPE_ERROR);
  });

  it('refuses a file over the cap, in Spanish, and takes the boundary itself', () => {
    expect(validateAvatarFile({ type: 'image/png', size: AVATAR_MAX_BYTES })).toBeNull();
    expect(validateAvatarFile({ type: 'image/png', size: AVATAR_MAX_BYTES + 1 })).toBe(
      AVATAR_SIZE_ERROR,
    );
  });
});

/**
 * Rule two: a replacement must not be served stale.
 *
 * The bucket is public, so its objects are cached; writing to a fixed path would keep showing the old
 * bytes after an upload. A path that is new on every upload is a URL that is new on every upload,
 * which is the one cache-busting that does not depend on how a CDN keys a query string.
 */
describe('uploadAvatarObject', () => {
  it('uploads into the user’s own folder under a fresh path, and returns the public URL', async () => {
    const first = await uploadAvatarObject(USER_ID, imageFile('image/jpeg', 32));
    const second = await uploadAvatarObject(USER_ID, imageFile('image/jpeg', 32));

    const [firstCall, secondCall] = fake.storage.upload.mock.calls;

    expect(fake.storage.upload).toHaveBeenCalledTimes(2);
    expect(fake.storage.from).toHaveBeenCalledWith(AVATAR_BUCKET);

    for (const call of [firstCall, secondCall]) {
      // The path prefix is the whole security contract of the bucket: the policy on
      // `storage.objects` refuses any name whose first folder is not the caller's id.
      expect(call?.[0].startsWith(`${USER_ID}/`)).toBe(true);
      // A JPEG is uploaded as a JPEG, so the public URL serves it as an image and not as a download.
      expect(call?.[2]?.contentType).toBe('image/jpeg');
    }

    // Two uploads cannot land on the same name, or the second would not be visible.
    expect(firstCall?.[0]).not.toBe(secondCall?.[0]);
    expect(first).toBe(publicUrlFor(firstCall?.[0] ?? ''));
    expect(second).toBe(publicUrlFor(secondCall?.[0] ?? ''));
  });
});

/**
 * Rule three: the file that was replaced.
 *
 * Cleanup happens after the new URL is stored, and this function is the only thing that turns a
 * stored URL back into an object to remove — so it will not act on a path outside the caller's own
 * folder, nor on a URL it does not recognise. The policy would refuse a stranger's path anyway; the
 * guard is what keeps this from being a way to ask storage to delete someone else's file.
 */
describe('removeAvatarObject', () => {
  it('removes the object behind a public URL of the user’s own folder', async () => {
    const url = publicUrlFor(`${USER_ID}/avatar-1.png`);

    expect(avatarPathFromPublicUrl(url)).toBe(`${USER_ID}/avatar-1.png`);

    await removeAvatarObject(USER_ID, url);

    expect(fake.storage.remove).toHaveBeenCalledWith([`${USER_ID}/avatar-1.png`]);
  });

  it('does nothing for a foreign path, a missing avatar, or a URL it does not recognise', async () => {
    await removeAvatarObject(USER_ID, publicUrlFor(`${OTHER_ID}/avatar-1.png`));
    await removeAvatarObject(USER_ID, null);
    await removeAvatarObject(USER_ID, 'https://example.test/algo.png');

    expect(fake.storage.remove).not.toHaveBeenCalled();
  });
});
