import { test } from "node:test";
import assert from "node:assert/strict";
import { crc32 } from "node:zlib";
import sharp from "sharp";
import { normaliseAvatar } from "../../src/lib/avatars/image";
import { AVATAR_MAX_UPLOAD_BYTES, AVATAR_SIZE_PX, avatarObjectPath, initials, validateAvatar } from "../../src/lib/avatars/policy";

const U1 = "3f2c1d8e-6a39-4b7e-9d52-0c1b2a3d4e5f";
const U2 = "9b1d2c3e-4f50-4a6b-8c7d-0e1f2a3b4c5d";

async function image(format: "jpeg" | "png" | "webp", width = 40, height = 30): Promise<Uint8Array> {
  const base = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } });
  return new Uint8Array(await base[format]().toBuffer());
}

test("avatars: JPEG, PNG and WebP are accepted when name, declared type and content agree", async () => {
  assert.deepEqual(validateAvatar({ name: "me.jpg", declaredMime: "image/jpeg", bytes: await image("jpeg") }), { ok: true, mime: "image/jpeg" });
  assert.deepEqual(validateAvatar({ name: "me.png", declaredMime: "image/png", bytes: await image("png") }), { ok: true, mime: "image/png" });
  assert.deepEqual(validateAvatar({ name: "me.webp", declaredMime: "", bytes: await image("webp") }), { ok: true, mime: "image/webp" });
  assert.equal(validateAvatar({ name: "me.jpeg", declaredMime: "image/pjpeg", bytes: await image("jpeg") }).ok, true, "known aliases");
});

test("avatars: other formats, disguised files, mismatches and oversize files are rejected", async () => {
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const pdf = new TextEncoder().encode("%PDF-1.7 ...");
  const gif = new TextEncoder().encode("GIF89a....");
  for (const bytes of [svg, pdf, gif]) assert.equal(validateAvatar({ name: "me.png", declaredMime: "image/png", bytes }).ok, false);
  assert.equal(validateAvatar({ name: "me.png", declaredMime: "image/png", bytes: new Uint8Array() }).ok, false, "empty");
  assert.equal(validateAvatar({ name: "me.png", declaredMime: "image/jpeg", bytes: await image("png") }).ok, false, "declared type mismatch");
  assert.equal(validateAvatar({ name: "me.html", declaredMime: "", bytes: await image("png") }).ok, false, "extension mismatch");
  const huge = new Uint8Array(AVATAR_MAX_UPLOAD_BYTES + 1);
  huge.set(await image("png"));
  assert.equal(validateAvatar({ name: "me.png", declaredMime: "image/png", bytes: huge }).ok, false, "too large");
});

test("avatars: re-encoded to a small square WebP with all metadata removed", async () => {
  const withExif = new Uint8Array(
    await sharp({ create: { width: 600, height: 400, channels: 3, background: "#3366cc" } })
      .jpeg()
      .withExif({ IFD0: { Make: "SecretCam", Copyright: "GPS 6.5244 3.3792" } })
      .toBuffer(),
  );
  assert.ok((await sharp(withExif).metadata()).exif, "fixture really has EXIF");
  const out = await normaliseAvatar(withExif);
  assert.ok(out);
  if (!out) return;
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, AVATAR_SIZE_PX);
  assert.equal(meta.height, AVATAR_SIZE_PX);
  assert.equal(meta.exif, undefined);
  assert.equal(meta.xmp, undefined);
  assert.ok(!Buffer.from(out).includes("SecretCam"));
});

test("avatars: corrupt images and decompression bombs are refused", async () => {
  const good = await image("png");
  assert.equal(await normaliseAvatar(good.slice(0, 40)), null, "truncated");
  // A tiny PNG whose (valid, correctly checksummed) header claims 20000 x 20000 pixels: the decoder's
  // pixel limit must refuse it before allocating anything.
  const bomb = Buffer.from(good);
  bomb.writeUInt32BE(20000, 16);
  bomb.writeUInt32BE(20000, 20);
  bomb.writeUInt32BE(crc32(bomb.subarray(12, 29)), 29);
  assert.equal((await sharp(bomb, { limitInputPixels: false }).metadata()).width, 20000, "fixture header is valid");
  assert.equal(validateAvatar({ name: "bomb.png", declaredMime: "image/png", bytes: bomb }).ok, true, "passes the byte checks");
  assert.equal(await normaliseAvatar(bomb), null);
});

test("avatars: object names are <profile>/<random uuid> only", () => {
  assert.equal(avatarObjectPath(U1, U2), `${U1}/${U2}`);
  for (const [a, b] of [["../x", U2], [U1, "x.png"], [U1.toUpperCase(), U2], ["", U2]] as const) assert.equal(avatarObjectPath(a, b), null);
});

test("avatars: default avatar initials", () => {
  assert.equal(initials("Ada Lovelace"), "AL");
  assert.equal(initials("  ada   b.  obi "), "AO");
  assert.equal(initials("Ọ̀ṣun"), "Ọ");
  assert.equal(initials("Prince"), "P");
  assert.equal(initials("   "), "?");
  assert.equal(initials("(x)"), "X");
});
