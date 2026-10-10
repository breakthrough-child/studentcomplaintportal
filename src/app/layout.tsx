import type { Metadata, Viewport } from "next";
import { SITE } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: SITE.name, template: `%s · ${SITE.name}` },
  description: `A private, tracked way for ${SITE.institution} students to raise complaints with their lecturers.`,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#252569" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b26" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The theme script sets class="dark" / data-theme before hydration, hence suppressHydrationWarning.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Deliberately synchronous and tiny: it must run before the first paint to avoid a theme flash. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme-init.js" />
      </head>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-gold-500 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-navy-900 focus:shadow"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
