"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { activeHref, type NavItem } from "@/lib/nav/nav";

/** Desktop: a horizontal tab strip (scrolls sideways if it does not fit). Hidden below `lg`. */
export function NavLinks({ items }: { items: readonly NavItem[] }) {
  const current = activeHref(items, usePathname());
  return (
    <nav aria-label="Main" className="table-scroll -mb-px hidden lg:block">
      <ul className="flex gap-1">
        {items.map((item) => {
          const on = item.href === current;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={`block whitespace-nowrap border-b-[3px] px-3 py-2.5 text-sm font-medium transition-colors ${on ? "border-gold-500 text-snow" : "border-transparent text-navy-100 hover:border-navy-300 hover:text-snow"}`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Mobile / tablet: a menu button that opens a full-width panel. Closes on navigation and Escape. */
export function MobileNav({ items, footer }: { items: readonly NavItem[]; footer?: React.ReactNode }) {
  const pathname = usePathname();
  const current = activeHref(items, pathname);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-snow hover:bg-snow/10"
      >
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open ? (
        <div id="mobile-menu" className="absolute inset-x-0 top-full z-40 border-t border-navy-600 bg-navy-800 shadow-xl dark:bg-navy-950">
          <nav aria-label="Main" className="mx-auto max-w-6xl px-4 py-3">
            <ul className="grid gap-1 sm:grid-cols-2">
              {items.map((item) => {
                const on = item.href === current;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={on ? "page" : undefined}
                      className={`flex items-center rounded-md px-3 py-3 text-base font-medium ${on ? "bg-gold-500 text-navy-900" : "text-navy-50 hover:bg-snow/10"}`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {footer ? <div className="mt-3 border-t border-navy-600 pt-3">{footer}</div> : null}
          </nav>
        </div>
      ) : null}
    </div>
  );
}
