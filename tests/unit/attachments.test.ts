import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_POLICY, FILE_TYPES, SUPPORTED_MIMES, checkBatch, detectType, extensionOf, sanitizeFilename, storagePath, validateUpload, type UploadPolicy,
} from "../../src/lib/attachments/policy";

const A = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const u8 = (...parts: (number[] | string)[]) => Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? A(p) : p)));
const pad = (n: number) => new Array(n).fill(0);
const utf16 = (s: string) => A(s).flatMap((c) => [c, 0]);

const SAMPLES: Record<string, Uint8Array> = {
  "image/jpeg": u8([0xff, 0xd8, 0xff, 0xe0], pad(16)),
  "image/png": u8([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], pad(16)),
  "image/webp": u8("RIFF", [1, 0, 0, 0], "WEBP", pad(8)),
  "audio/wav": u8("RIFF", [1, 0, 0, 0], "WAVE", pad(8)),
  "application/pdf": u8("%PDF-1.7\n", pad(8)),
  "application/msword": u8([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], pad(64), utf16("WordDocument"), pad(8)),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": u8([0x50, 0x4b, 0x03, 0x04], pad(8), "[Content_Types].xml", pad(4), "word/document.xml"),
  "audio/mpeg": u8("ID3", [4, 0], pad(16)),
  "audio/mp4": u8([0, 0, 0, 0x20], "ftypM4A ", pad(16)),
  "audio/webm": u8([0x1a, 0x45, 0xdf, 0xa3], pad(16)),
};
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "audio/wav": "wav", "application/pdf": "pdf", "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/webm": "webm",
};

test("every supported format is detected from its signature", () => {
  for (const [mime, bytes] of Object.entries(SAMPLES)) assert.equal(detectType(bytes), mime, mime);
  assert.deepEqual(FILE_TYPES.map((t) => t.mime).sort(), Object.keys(SAMPLES).sort());
});
test("an MP3 without ID3 is recognised by its frame sync; random bytes are not a format", () => {
  assert.equal(detectType(u8([0xff, 0xfb, 0x90, 0x00])), "audio/mpeg");
  assert.equal(detectType(u8("hello world, plain text")), null);
  assert.equal(detectType(new Uint8Array()), null);
});
test("dangerous formats have no detector: SVG, HTML, scripts, PE and ELF executables, plain ZIP, OLE non-Word", () => {
  const rejected: Uint8Array[] = [
    u8('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), u8("<!doctype html><script>1</script>"), u8("<?php system($_GET[1]);"),
    u8("MZ", pad(64)), u8([0x7f], "ELF", pad(16)), u8("#!/bin/sh\nrm -rf /"),
    u8([0x50, 0x4b, 0x03, 0x04], pad(16), "xl/workbook.xml"), u8([0x50, 0x4b, 0x03, 0x04], pad(16), "META-INF/MANIFEST.MF"),
    u8([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], pad(64), utf16("Workbook")),
    u8([0, 0, 0, 0x20], "ftypisom", pad(16)), // MP4 video brand
  ];
  for (const f of rejected) assert.equal(detectType(f), null);
});

const ok = (name: string, mime: string, declared = mime, policy: UploadPolicy = DEFAULT_POLICY) => validateUpload({ name, declaredMime: declared, bytes: SAMPLES[mime] as Uint8Array }, policy);

test("a genuine file with a matching name and type is accepted and the DETECTED type is returned", () => {
  for (const mime of Object.keys(SAMPLES)) {
    const v = ok(`evidence.${EXT[mime]}`, mime);
    assert.equal(v.ok, true, mime);
    if (v.ok) assert.equal(v.mime, mime);
  }
});
test("browsers that send no type, a generic type, an alias or parameters are accepted", () => {
  for (const declared of ["", "application/octet-stream", "image/pjpeg", "IMAGE/JPEG; charset=binary"]) assert.equal(ok("a.jpg", "image/jpeg", declared).ok, true, declared);
  assert.equal(ok("a.m4a", "audio/mp4", "audio/x-m4a").ok, true);
});
test("a mismatched declared type is rejected", () => {
  const v = ok("a.jpg", "image/jpeg", "text/html");
  assert.equal(v.ok, false);
});
test("renaming a file does not change what it is: content must match the extension", () => {
  const png = SAMPLES["image/png"] as Uint8Array;
  assert.equal(validateUpload({ name: "photo.jpg", declaredMime: "image/jpeg", bytes: png }, DEFAULT_POLICY).ok, false);
  const svg = u8("<svg onload=alert(1)>");
  for (const name of ["x.png", "x.pdf", "x.svg", "x.html", "x.exe", "x.php", "x"]) assert.equal(validateUpload({ name, declaredMime: "image/png", bytes: svg }, DEFAULT_POLICY).ok, false, name);
  assert.equal(validateUpload({ name: "x.pdf.exe", declaredMime: "", bytes: SAMPLES["application/pdf"] as Uint8Array }, DEFAULT_POLICY).ok, false);
});
test("empty and oversized files are rejected", () => {
  assert.equal(validateUpload({ name: "a.pdf", declaredMime: "", bytes: new Uint8Array() }, DEFAULT_POLICY).ok, false);
  const big = new Uint8Array(DEFAULT_POLICY.maxFileBytes + 1); big.set(SAMPLES["application/pdf"] as Uint8Array);
  assert.equal(validateUpload({ name: "a.pdf", declaredMime: "application/pdf", bytes: big }, DEFAULT_POLICY).ok, false);
  const exact = new Uint8Array(DEFAULT_POLICY.maxFileBytes); exact.set(SAMPLES["application/pdf"] as Uint8Array);
  assert.equal(validateUpload({ name: "a.pdf", declaredMime: "application/pdf", bytes: exact }, DEFAULT_POLICY).ok, true);
});
test("the administrator's allow-list is honoured", () => {
  const noPdf: UploadPolicy = { ...DEFAULT_POLICY, allowedMimes: new Set(["image/png"]) };
  assert.equal(ok("a.pdf", "application/pdf", "application/pdf", noPdf).ok, false);
  assert.equal(ok("a.png", "image/png", "image/png", noPdf).ok, true);
  const aliasOnly: UploadPolicy = { ...DEFAULT_POLICY, allowedMimes: new Set(["audio/x-wav"]) };
  assert.equal(ok("a.wav", "audio/wav", "audio/wav", aliasOnly).ok, true);
});
test("batch limits", () => {
  assert.equal(checkBatch([1, 2, 3], DEFAULT_POLICY), null);
  assert.match(checkBatch(new Array(6).fill(1), DEFAULT_POLICY) ?? "", /at most 5/);
  assert.match(checkBatch([DEFAULT_POLICY.maxRequestBytes, 1], DEFAULT_POLICY) ?? "", /too large/);
});
test("filenames are sanitised for storage and display", () => {
  assert.equal(sanitizeFilename("../../etc/passwd"), "passwd");
  assert.equal(sanitizeFilename("C:\\Users\\me\\scan.pdf"), "scan.pdf");
  assert.equal(sanitizeFilename("a\u0000b\u0007c.pdf"), "abc.pdf");
  assert.equal(sanitizeFilename("  .  "), "file");
  assert.equal(sanitizeFilename(".."), "file");
  assert.equal(sanitizeFilename(undefined), "file");
  assert.equal(sanitizeFilename("x".repeat(400)).length, 255);
  assert.equal(sanitizeFilename("<script>alert(1)</script>.png"), "script>.png"); // path separators split; the rest is only ever rendered escaped
  assert.equal(extensionOf("a.b.PDF"), "pdf");
  assert.equal(extensionOf(".bashrc"), "");
  assert.equal(extensionOf("noext"), "");
  assert.equal(extensionOf("trailing."), "");
});
test("bidirectional and zero-width characters are stripped from filenames", () => {
  const bidi = String.fromCharCode(0x202e), zw = String.fromCharCode(0x200b);
  assert.equal(sanitizeFilename(`gnp${bidi}.exe${zw}.pdf`), "gnp.exe.pdf");
});
test("storage paths are <complaint id>/<random id> and nothing else", () => {
  const c = "11111111-1111-4111-8111-111111111111", o = "22222222-2222-4222-8222-222222222222";
  assert.equal(storagePath(c, o), `${c}/${o}`);
  for (const bad of [["../x", o], [c, "../../etc"], [c, `${o}/x`], [`${c}x`, o], ["", ""]] as const) assert.equal(storagePath(bad[0], bad[1]), null);
});
test("the supported MIME list matches the database defaults and storage bucket (no SVG or executables)", () => {
  const ref = readFileSync(new URL("../../supabase/migrations/20261009000006_reference_data.sql", import.meta.url), "utf8");
  const bucket = readFileSync(new URL("../../supabase/migrations/20261009000005_storage.sql", import.meta.url), "utf8");
  for (const m of [...DEFAULT_POLICY.allowedMimes]) { assert.ok(ref.includes(`'${m}'`), `reference_data lacks ${m}`); assert.ok(bucket.includes(`'${m}'`), `bucket lacks ${m}`); }
  for (const m of SUPPORTED_MIMES) assert.equal(/svg|html|javascript|executable|octet/.test(m), false, m);
});
