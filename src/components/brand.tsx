import Link from "next/link";
import { SITE } from "@/lib/site";

/** Simple shield mark in the university colours (a generic emblem, not the official university crest). */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="shrink-0">
      <path d="M20 2 35 7.5v11.2c0 9.3-6.3 16.6-15 19.3C11.3 35.3 5 28 5 18.7V7.5L20 2Z" fill="#FFBA00" />
      <path d="M20 6.4 31 10.5v8.3c0 7-4.6 12.6-11 14.9-6.4-2.3-11-7.9-11-14.9v-8.3L20 6.4Z" fill="#252569" />
      <path d="M13.5 15.5h13M13.5 20h13M13.5 24.5h8" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** Mark + name, for navy backgrounds (the header and hero are navy in both themes). */
export function BrandLink({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="flex min-w-0 items-center gap-2.5 rounded-md text-snow">
      <BrandMark size={compact ? 32 : 38} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-bold tracking-tight sm:text-base">{SITE.name}</span>
        <span className="block truncate text-[11px] font-medium uppercase tracking-[0.14em] text-gold-400">{SITE.institution}</span>
      </span>
    </Link>
  );
}
