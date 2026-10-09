// UNVERIFIED: depends on next and react, which could not be installed when this was written.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeHref, type NavItem } from "@/lib/nav/nav";

export function NavLinks({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  const current = activeHref(items, pathname);
  return (
    <nav aria-label="Main" className="-mx-1 flex flex-wrap gap-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.href === current ? "page" : undefined}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${item.href === current ? "bg-brand-50 text-brand-800" : "text-slate-700 hover:bg-slate-100"}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
