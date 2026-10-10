import type { Profile } from "@/lib/auth/profile";
import { avatarUrl } from "@/lib/avatars/data";
import { Avatar } from "./avatar";
import { AvatarForm } from "./avatar-form";

/** "Profile picture" section for the signed-in user's own profile / settings page. */
export async function ProfilePicture({ profile }: { profile: Profile }) {
  const url = await avatarUrl(profile.avatar_path);
  return (
    <section aria-labelledby="picture" className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
      <h2 id="picture" className="font-medium">Profile picture</h2>
      <div className="mt-3 flex flex-wrap items-start gap-4">
        <Avatar name={profile.full_name} url={url} size="lg" />
        <div className="min-w-0 flex-1"><AvatarForm hasPicture={Boolean(profile.avatar_path)} /></div>
      </div>
    </section>
  );
}
