import { initials } from "@/lib/avatars/policy";

const SIZES = { sm: "h-8 w-8 text-xs", md: "h-12 w-12 text-sm", lg: "h-20 w-20 text-xl" } as const;

/** Profile picture, or initials on a neutral circle when there is none (the default avatar). */
export function Avatar({ name, url, size = "sm" }: { name: string; url: string | null; size?: keyof typeof SIZES }) {
  const box = `${SIZES[size]} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full`;
  if (url) {
    // A signed URL from our own private bucket; next/image would need the storage host whitelisted.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={`${box} bg-slate-100 object-cover`} referrerPolicy="no-referrer" />;
  }
  return (
    <span aria-hidden="true" className={`${box} bg-brand-100 font-semibold text-brand-800`}>
      {initials(name)}
    </span>
  );
}
