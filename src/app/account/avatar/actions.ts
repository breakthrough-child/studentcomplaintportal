"use server";

import { revalidatePath } from "next/cache";
import { removeMyAvatar, updateMyAvatar } from "@/lib/avatars/data";
import type { AvatarState } from "@/lib/avatars/policy";

/** Upload or remove the signed-in user's own profile picture (students and staff alike). */
export async function avatarAction(_previous: AvatarState, formData: FormData): Promise<AvatarState> {
  const result = formData.get("intent") === "remove" ? await removeMyAvatar() : await updateMyAvatar(formData.get("avatar"));
  if (result.ok) revalidatePath("/", "layout"); // the header shows the picture on every page
  return result;
}
