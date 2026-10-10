"use client";

import { useEffect, useState } from "react";

type Choice = "light" | "dark" | "system";
const ORDER: readonly Choice[] = ["light", "dark", "system"];
const LABEL: Record<Choice, string> = { light: "Light theme", dark: "Dark theme", system: "System theme" };

function apply(choice: Choice) {
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.theme = choice;
  try {
    if (choice === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", choice);
  } catch {
    // Private mode / blocked storage: the theme still applies for this page view.
  }
}

function Icon({ choice }: { choice: Choice }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
  if (choice === "light") return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>;
  if (choice === "dark") return <svg {...common}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>;
  return <svg {...common}><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>;
}

/** Cycles light → dark → system. The initial theme is applied by /theme-init.js before React loads. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [choice, setChoice] = useState<Choice>("system");
  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    if (current === "light" || current === "dark" || current === "system") setChoice(current);
  }, []);
  const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length] ?? "system";
  return (
    <button
      type="button"
      onClick={() => { apply(next); setChoice(next); }}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors ${className}`}
      aria-label={`${LABEL[choice]} (switch to ${LABEL[next].toLowerCase()})`}
      title={`${LABEL[choice]}: switch to ${LABEL[next].toLowerCase()}`}
    >
      <Icon choice={choice} />
    </button>
  );
}
