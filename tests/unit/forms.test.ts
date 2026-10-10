// React forbids method / encType on a <form> whose action is a function (Server Action or useActionState
// dispatcher): it sets them itself (multipart, so file uploads still work) and logs a console error otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../../src", import.meta.url).pathname;
function tsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) tsx(full, out);
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

// action={expr} values that are URL strings (plain GET/POST forms), where method= is legitimate.
const URL_ACTIONS = new Set(["base"]);

test("forms with a function action never set method or encType", () => {
  for (const file of tsx(root)) {
    for (const tag of readFileSync(file, "utf8").match(/<form\b[^>]*>/g) ?? []) {
      // No form in this app uploads to a plain URL, so encType is never needed.
      assert.doesNotMatch(tag, /\bencType=/, `${file}: ${tag}`);
      const expr = /\baction=\{([^}]*)\}/.exec(tag)?.[1]?.trim();
      if (expr !== undefined && !URL_ACTIONS.has(expr)) assert.doesNotMatch(tag, /\bmethod=/, `${file}: ${tag}`);
    }
  }
});
