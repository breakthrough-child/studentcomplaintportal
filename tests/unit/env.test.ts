import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EnvError,
  assertNoPublicSecrets,
  parsePublicEnv,
  parseServerEnv,
} from "../../src/lib/env/schema";

const KEY_A = "a".repeat(40);
const KEY_B = "b".repeat(40);
const good = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: KEY_A,
  NEXT_PUBLIC_SITE_URL: "https://portal.example.edu/some/path/",
};

test("public env: valid values parse and the site URL is reduced to its origin", () => {
  const env = parsePublicEnv(good);
  assert.equal(env.NEXT_PUBLIC_SITE_URL, "https://portal.example.edu");
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, "https://abcd.supabase.co");
});

test("public env: site URL defaults to localhost when unset or blank", () => {
  assert.equal(parsePublicEnv({ ...good, NEXT_PUBLIC_SITE_URL: undefined }).NEXT_PUBLIC_SITE_URL, "http://localhost:3000");
  assert.equal(parsePublicEnv({ ...good, NEXT_PUBLIC_SITE_URL: "  " }).NEXT_PUBLIC_SITE_URL, "http://localhost:3000");
});

test("public env: plain http is accepted only for localhost", () => {
  assert.doesNotThrow(() => parsePublicEnv({ ...good, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }));
  assert.doesNotThrow(() => parsePublicEnv({ ...good, NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" }));
  assert.throws(() => parsePublicEnv({ ...good, NEXT_PUBLIC_SUPABASE_URL: "http://abcd.supabase.co" }), EnvError);
  assert.throws(() => parsePublicEnv({ ...good, NEXT_PUBLIC_SUPABASE_URL: "http://localhost.evil.com" }), EnvError);
});

test("public env: missing or malformed values are rejected", () => {
  assert.throws(() => parsePublicEnv({}), EnvError);
  assert.throws(() => parsePublicEnv({ ...good, NEXT_PUBLIC_SUPABASE_URL: "not a url" }), EnvError);
  assert.throws(() => parsePublicEnv({ ...good, NEXT_PUBLIC_SUPABASE_ANON_KEY: "short" }), EnvError);
});

test("env errors name the variable but never echo its value", () => {
  const secret = "super-secret-looking-value";
  try {
    parsePublicEnv({ ...good, NEXT_PUBLIC_SUPABASE_URL: `ftp://${secret}` });
    assert.fail("should have thrown");
  } catch (error) {
    assert.ok(error instanceof EnvError);
    assert.match(error.message, /NEXT_PUBLIC_SUPABASE_URL/);
    assert.ok(!error.message.includes(secret), "error message leaked the value");
  }
});

test("server env: requires the service-role key", () => {
  assert.throws(() => parseServerEnv({}, KEY_A), EnvError);
  assert.equal(parseServerEnv({ SUPABASE_SERVICE_ROLE_KEY: KEY_B }, KEY_A).SUPABASE_SERVICE_ROLE_KEY, KEY_B);
});

test("server env: the service-role key must differ from the anon key", () => {
  assert.throws(() => parseServerEnv({ SUPABASE_SERVICE_ROLE_KEY: KEY_A }, KEY_A), EnvError);
});

test("secrets exposed through NEXT_PUBLIC_ names are rejected", () => {
  assert.doesNotThrow(() => assertNoPublicSecrets(good));
  assert.throws(() => assertNoPublicSecrets({ ...good, NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: KEY_B }), EnvError);
  assert.throws(() => assertNoPublicSecrets({ NEXT_PUBLIC_STRIPE_SECRET: "x" }), EnvError);
  assert.throws(() => parseServerEnv({ SUPABASE_SERVICE_ROLE_KEY: KEY_B, NEXT_PUBLIC_SERVICE_ROLE: KEY_B }, KEY_A), EnvError);
});
