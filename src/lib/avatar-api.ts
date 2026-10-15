import { getSupabase } from './supabase.ts';

/**
 * The avatar object in storage, from the client side.
 *
 * The bucket already existed before this task: `0001` creates `avatars`, makes it **public** so the
 * public URL serves the image without signing anything, and puts one policy on `storage.objects`
 * that restricts every operation to `storage.foldername(name)[1] = auth.uid()`. That policy is the
 * security boundary and it is verified by `supabase/tests/0006_avatar_storage_test.sql`; nothing in
 * this module is one. What lives here is what the database cannot answer for us:
 *
 *  - the path convention, which is the policy's own input (`<user_id>/<file>`);
 *  - the two limits the bucket does not carry — `0001` inserts only the id, the name and the public
 *    flag, so `file_size_limit` and `allowed_mime_types` are both NULL and the only ceiling a user
 *    meets is this one;
 *  - a path that is new on every upload, which is what stops a public, cached object from being
 *    served stale after a replacement.
 */

export const AVATAR_BUCKET = 'avatars';

/**
 * Two megabytes.
 *
 * The bucket has no size limit of its own, so this is the whole ceiling. An avatar is read at about
 * 96 pixels on a 360-pixel screen, which two megabytes already overshoots by orders of magnitude;
 * the point of the number is not the pixel count but that a public download does not become a
 * multi-megabyte one every time the profile opens. A photo over the cap is refused with a message
 * that asks for a smaller one, rather than being resized here: a canvas resize is a real feature and
 * not a line in a validator.
 */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** The three types the app renders, and no others. */
export const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export const AVATAR_TYPE_ERROR = 'El avatar tiene que ser una imagen PNG, JPG o WebP.';
export const AVATAR_SIZE_ERROR = 'El avatar no puede pesar más de 2 MB.';

/** `png` / `jpg` / `webp`, so the stored object is named for what it actually is. */
const AVATAR_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/**
 * What is wrong with the chosen file, or `null` when nothing is.
 *
 * The message is returned instead of thrown because it is copy: the screen shows it next to the
 * picker. It takes the two fields it looks at rather than the `File` itself, so the three branches
 * can be exercised without fabricating a blob.
 */
export function validateAvatarFile(file: { type: string; size: number }): string | null {
  if (!(AVATAR_TYPES as readonly string[]).includes(file.type)) {
    return AVATAR_TYPE_ERROR;
  }

  if (file.size > AVATAR_MAX_BYTES) {
    return AVATAR_SIZE_ERROR;
  }

  return null;
}

/**
 * The name a new upload gets: `<user_id>/avatar-<stamp>.<ext>`.
 *
 * The first segment is not decoration — it is what the storage policy compares against `auth.uid()`,
 * so a name built any other way is refused by the database.
 *
 * The stamp is what makes a replacement visible. The bucket is public and its objects are cached, so
 * uploading to one fixed name would leave the old bytes in front of the user until the cache expired;
 * a new name is a new URL, which is the only cache-busting that does not bet on how a CDN keys a
 * query string. Time gives the order and the random half covers two uploads inside the same
 * millisecond.
 */
function avatarFileName(type: string): string {
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const extension = AVATAR_EXTENSIONS[type] ?? 'bin';

  return `avatar-${stamp}.${extension}`;
}

/** Where a stored public URL points to in storage, or `null` when it is not one of ours. */
export function avatarPathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
  const start = url.indexOf(marker);

  if (start === -1) {
    return null;
  }

  // Any query or fragment is not part of the name an object is stored under.
  const path = url.slice(start + marker.length).split(/[?#]/, 1)[0] ?? '';

  return path === '' ? null : path;
}

/**
 * Puts one file in the user's own folder and hands back the URL that serves it.
 *
 * The URL is what gets stored, and not the path, because that is what `profiles.avatar_url` names and
 * what an `<img>` needs: the profile is read from the cache and drawn offline, so rendering it must
 * not wait on the storage client. The path is still recoverable from it — `avatarPathFromPublicUrl` —
 * which is what lets a replacement clean up after itself.
 */
export async function uploadAvatarObject(userId: string, file: File): Promise<string> {
  const supabase = await getSupabase();
  const path = `${userId}/${avatarFileName(file.type)}`;

  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
    contentType: file.type,
    // Never overwriting, because the name is new every time: `upsert` would only be able to hide a
    // name collision, and a collision here is a bug worth seeing.
    upsert: false,
  });

  if (error) {
    throw error;
  }

  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Deletes the object a stored URL points to, when it is the caller's own.
 *
 * Only what it recognises is touched: a URL that is not this bucket, or a path outside the caller's
 * folder, is ignored and no request is made. The policy would refuse a stranger's path anyway, and
 * this guard is what keeps the function from being a way to ask storage for one.
 *
 * It throws when storage refuses, because what to do about that is the caller's decision: the
 * replacement has already succeeded by then, so its own caller treats this as best effort.
 */
export async function removeAvatarObject(userId: string, url: string | null): Promise<void> {
  const path = url === null ? null : avatarPathFromPublicUrl(url);

  if (path === null || !path.startsWith(`${userId}/`)) {
    return;
  }

  const supabase = await getSupabase();
  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([path]);

  if (error) {
    throw error;
  }
}
