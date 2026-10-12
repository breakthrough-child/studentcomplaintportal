#!/usr/bin/env node
// Static guard for security-relevant module boundaries. Plain Node, no dependencies.
//   node scripts/check-boundaries.mjs [rootDir]
// Exits 1 and lists every violation. Complements (does not replace) review and RLS.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.argv[2] ?? process.cwd();
const posix = (p) => p.split(sep).join("/");

function walk(dir, out = []) {
  let names;
  try { names = readdirSync(dir); } catch { return out; } // missing directory: nothing to scan
  for (const name of names) {
    if (["node_modules", ".next", ".git"].includes(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(full);
  }
  return out;
}

const SERVER_ONLY_MODULES = [
  "@/lib/supabase/server", "@/lib/supabase/admin", "@/lib/supabase/middleware",
  "@/lib/env/server", "@/lib/auth/guards", "server-only", "next/headers",
];
// The env modules parse the key; admin.ts is the single consumer (via getServerEnv()).
const SERVICE_KEY_ALLOWED = new Set(["src/lib/env/schema.ts", "src/lib/env/server.ts", "src/lib/supabase/admin.ts"]);
const ADMIN_IMPORT_ALLOWED = new Set(["src/lib/supabase/admin.ts", "src/lib/notifications/send.ts"]); // plus src/lib/admin/** below; send.ts only claims/completes queued e-mails

// Zero-width, bidirectional-control and line-separator characters. Built from hex ranges so this file
// itself never contains the characters it forbids.
const INVISIBLE = new RegExp(
  "[" + ["200b-200f", "2028-202e", "2060-2069", "feff"].map((r) => r.split("-").map((h) => "\\u" + h).join("-")).join("") + "]",
);

const violations = [];
const files = walk(join(root, "src"));
const extraFiles = walk(join(root, "tests")).concat(walk(join(root, "scripts")));

for (const file of files) {
  const rel = posix(relative(root, file));
  const text = readFileSync(file, "utf8");
  const isClient = /^\s*["']use client["']/m.test(text.split("\n").slice(0, 8).join("\n"));

  if (isClient) {
    for (const mod of SERVER_ONLY_MODULES) {
      if (new RegExp(`from\\s+["']${mod.replace(/[/@.]/g, "\\$&")}["']`).test(text) || new RegExp(`import\\s+["']${mod.replace(/[/@.]/g, "\\$&")}["']`).test(text)) {
        violations.push(`${rel}: Client Component imports server-only module "${mod}"`);
      }
    }
  }
  if (text.includes("SUPABASE_SERVICE_ROLE_KEY") && !SERVICE_KEY_ALLOWED.has(rel)) {
    violations.push(`${rel}: references SUPABASE_SERVICE_ROLE_KEY outside the env modules`);
  }
  if (/from\s+["'](?:@\/lib\/supabase\/admin|\.{1,2}\/(?:\.{2}\/)*(?:lib\/)?supabase\/admin|\.\/admin)["']/.test(text)
      && !ADMIN_IMPORT_ALLOWED.has(rel) && !rel.startsWith("src/lib/admin/")) {
    violations.push(`${rel}: imports the service-role client (allow-list it deliberately if intended)`);
  }
  if (/\.auth\.getSession\s*\(/.test(text)) {
    violations.push(`${rel}: uses auth.getSession() (unverified cookie). Use auth.getUser() for authorization`);
  }
  if (/NEXT_PUBLIC_[A-Z0-9_]*(SERVICE_ROLE|SECRET|PRIVATE)/.test(text)
      && rel !== "src/lib/env/schema.ts") {
    violations.push(`${rel}: a NEXT_PUBLIC_ variable name suggests a secret would reach the browser`);
  }
  // Trojan Source: invisible / bidirectional / line-separator characters must be written as visible \uXXXX escapes.
  const invisible = INVISIBLE.exec(text);
  if (invisible) {
    violations.push(`${rel}: contains a literal invisible or bidirectional character (U+${invisible[0].codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}); write it as an escape`);
  }
  if (/dangerouslySetInnerHTML/.test(text)) {
    violations.push(`${rel}: dangerouslySetInnerHTML is not allowed (complaint text and filenames are untrusted)`);
  }
}

// Invisible characters are checked in tests/ and scripts/ as well.
for (const file of extraFiles) {
  const rel = posix(relative(root, file));
  const hit = INVISIBLE.exec(readFileSync(file, "utf8"));
  if (hit) violations.push(`${rel}: contains a literal invisible or bidirectional character (U+${hit[0].codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}); write it as an escape`);
}

// .env.example must hold placeholders only.
try {
  const env = readFileSync(join(root, ".env.example"), "utf8");
  for (const line of env.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && /KEY|SECRET|TOKEN|PASSWORD/.test(m[1]) && m[2].trim() !== "") {
      violations.push(`.env.example: ${m[1]} has a value; placeholders only`);
    }
    if (m && /^NEXT_PUBLIC_.*(SERVICE_ROLE|SECRET|PRIVATE)/.test(m[1])) {
      violations.push(`.env.example: ${m[1]} would be exposed to the browser`);
    }
  }
} catch { violations.push(".env.example is missing"); }

if (violations.length) {
  console.error(`boundary check FAILED (${violations.length}):\n - ${violations.join("\n - ")}`);
  process.exit(1);
}
console.log(`boundary check passed (${files.length} source files scanned)`);
