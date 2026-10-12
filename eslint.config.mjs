import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "supabase/**", "docs/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // The service-role client must only be reachable from trusted server modules.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/supabase/admin", "@/lib/supabase/admin"],
              message: "The service-role client is server-only. Import it only from audited server actions or route handlers.",
            },
          ],
        },
      ],
    },
  },
  {
    // Allow the admin client where it is audited and intentionally used.
    files: ["src/lib/supabase/admin.ts", "src/lib/admin/**/*.ts", "src/lib/notifications/send.ts"],
    rules: { "no-restricted-imports": "off" },
  },
];

export default config;
