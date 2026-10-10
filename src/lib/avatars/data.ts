import "server-only";
import { randomUUID } from "node:crypto";
import { cache } from "react";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { normaliseAvatar } from "./image";
import { AVATAR_MAX_UPLOAD_BYTES, AVATAR_STORED_MIME, avatarObjectPath, validateAvatar, type AvatarState } from "./policy";

export const AVATAR_BUCKET = "avatars";
const SIGNED_URL_SECONDS = 60 * 60;

/**
 * Short-lived signed URL for a profile picture, minted with the VIEWER'S session: the storage policy
 * (storage_avatar_readable) decides whether they may see it. null means "show the default avatar".
 */
export const avatarUrl = cache(async (path: string | null | undefined): Promise<string | null> => {
  if (!path) return null;
  const { data, error } = await (await createClient()).storage.from(AVATAR_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  return error || !data?.signedUrl ? null : data.signedUrl;
});

/**
 * Validates, re-encodes and stores the caller's new picture, then points their profile at it through
 * set_my_avatar (which re-checks ownership and that the object exists). Everything runs with the user's
 * own session; no service role is involved. The previous picture is deleted afterwards.
 */
export async function updateMyAvatar(file: unknown): Promise<AvatarState> {
  const profile = await requireUser();
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose an image file." };
  if (file.size > AVATAR_MAX_UPLOAD_BYTES) return { ok: false, message: "The image is too large (limit 2 MB)." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const verdict = validateAvatar({ name: file.name, declaredMime: file.type, bytes });
  if (!verdict.ok) return { ok: false, message: verdict.error };
  const webp = await normaliseAvatar(bytes);
  if (!webp) return { ok: false, message: "That image could not be read. Try a different file." };

  const path = avatarObjectPath(profile.id, randomUUID());
  if (!path) return { ok: false, message: "The picture could not be saved." };
  const supabase = await createClient();
  const up = await supabase.storage.from(AVATAR_BUCKET).upload(path, webp, { contentType: AVATAR_STORED_MIME, upsert: false, cacheControl: "3600" });
  if (up.error) return { ok: false, message: "The picture could not be saved. Please try again." };

  const { data: previous, error } = await supabase.rpc("set_my_avatar", { p_path: path });
  if (error) {
    await supabase.storage.from(AVATAR_BUCKET).remove([path]);
    return { ok: false, message: "The picture could not be saved. Please try again." };
  }
  if (typeof previous === "string" && previous !== "") await supabase.storage.from(AVATAR_BUCKET).remove([previous]);
  return { ok: true, message: "Profile picture updated." };
}

/** Back to the default avatar; the stored picture is deleted. */
export async function removeMyAvatar(): Promise<AvatarState> {
  await requireUser();
  const supabase = await createClient();
  const { data: previous, error } = await supabase.rpc("set_my_avatar", { p_path: null });
  if (error) return { ok: false, message: "The picture could not be removed. Please try again." };
  if (typeof previous === "string" && previous !== "") await supabase.storage.from(AVATAR_BUCKET).remove([previous]);
  return { ok: true, message: "Profile picture removed." };
}
