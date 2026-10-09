// Attachment validation (pure). Run on the server BEFORE anything is stored.
//
// A file is accepted only if ALL of these agree: its size is within the configured limit, its
// extension is a supported one, its leading bytes ("magic numbers") identify a supported format,
// the MIME type the browser declared (if any) is the same format, and the format is currently
// allowed by the administrator-controlled setting. The detected format, never the declared one,
// is what gets stored. SVG, HTML, scripts and executables cannot be accepted: no detector exists.
//
// Honest limits: signatures prove the file starts like that format, not that it is harmless.
// There is no malware scanning here, and audio/webm cannot be told apart from video/webm.
import { codePointLength } from "../complaints/schema";

export type FileType = {
  readonly mime: string;
  readonly aliases: readonly string[];
  readonly extensions: readonly string[];
  readonly label: string;
};

export const FILE_TYPES: readonly FileType[] = [
  { mime: "image/jpeg", aliases: ["image/jpg", "image/pjpeg"], extensions: ["jpg", "jpeg"], label: "JPEG image" },
  { mime: "image/png", aliases: [], extensions: ["png"], label: "PNG image" },
  { mime: "image/webp", aliases: [], extensions: ["webp"], label: "WebP image" },
  { mime: "application/pdf", aliases: [], extensions: ["pdf"], label: "PDF document" },
  { mime: "application/msword", aliases: [], extensions: ["doc"], label: "Word document (.doc)" },
  { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", aliases: [], extensions: ["docx"], label: "Word document (.docx)" },
  { mime: "audio/mpeg", aliases: ["audio/mp3"], extensions: ["mp3"], label: "MP3 audio" },
  { mime: "audio/mp4", aliases: ["audio/x-m4a", "audio/m4a"], extensions: ["m4a"], label: "M4A audio" },
  { mime: "audio/wav", aliases: ["audio/x-wav", "audio/wave", "audio/vnd.wave"], extensions: ["wav"], label: "WAV audio" },
  { mime: "audio/webm", aliases: [], extensions: ["webm"], label: "WebM audio" },
];

/** MIME types an administrator may enable: exactly the ones with a signature detector. */
export const SUPPORTED_MIMES: readonly string[] = [...FILE_TYPES.map((t) => t.mime), "audio/x-m4a", "audio/x-wav"];

const byMime = new Map(FILE_TYPES.map((t) => [t.mime, t]));

function ascii(bytes: Uint8Array, start: number, text: string): boolean {
  if (bytes.length < start + text.length) return false;
  for (let i = 0; i < text.length; i += 1) if (bytes[start + i] !== text.charCodeAt(i)) return false;
  return true;
}

function startsWith(bytes: Uint8Array, sig: readonly number[]): boolean {
  return bytes.length >= sig.length && sig.every((b, i) => bytes[i] === b);
}

function includes(bytes: Uint8Array, needle: Uint8Array | string): boolean {
  const n = typeof needle === "string" ? Uint8Array.from(needle, (c) => c.charCodeAt(0)) : needle;
  if (n.length === 0 || bytes.length < n.length) return false;
  outer: for (let i = 0; i <= bytes.length - n.length; i += 1) {
    for (let j = 0; j < n.length; j += 1) if (bytes[i + j] !== n[j]) continue outer;
    return true;
  }
  return false;
}

const utf16 = (s: string) => Uint8Array.from([...s].flatMap((c) => [c.charCodeAt(0), 0]));

/** Canonical MIME type of the file's actual content, or null if it is not a supported format. */
export function detectType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) return "image/webp";
  if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WAVE")) return "audio/wav";
  if (ascii(bytes, 0, "%PDF-")) return "application/pdf";
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    // OLE2 container: .doc, but also .xls/.ppt. Require the Word stream name in the directory.
    return includes(bytes, utf16("WordDocument")) ? "application/msword" : null;
  }
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    // ZIP container: only a real word-processing package is accepted, not any zip.
    return includes(bytes, "[Content_Types].xml") && includes(bytes, "word/")
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : null;
  }
  if (ascii(bytes, 4, "ftyp") && (ascii(bytes, 8, "M4A ") || ascii(bytes, 8, "M4B "))) return "audio/mp4";
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "audio/webm";
  if (ascii(bytes, 0, "ID3") || (bytes.length >= 2 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)) return "audio/mpeg";
  return null;
}

/** Lower-cased extension after the last dot, or "" when there is none. */
export function extensionOf(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const i = base.lastIndexOf(".");
  return i > 0 && i < base.length - 1 ? base.slice(i + 1).toLowerCase() : "";
}

// Control, line/paragraph separators, zero-width and bidirectional controls, built from code point
// ranges so the source file contains no invisible characters.
const UNSAFE_NAME = new RegExp(
  `[${[[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2069], [0xfeff, 0xfeff]]
    .map(([a, b]) => `\\u${(a as number).toString(16).padStart(4, "0")}-\\u${(b as number).toString(16).padStart(4, "0")}`)
    .join("")}]`,
  "g",
);

/** A filename that is safe to store and display: no path, no control or bidi characters, max 255. */
export function sanitizeFilename(name: unknown): string {
  const raw = typeof name === "string" ? name : "";
  const base = (raw.split(/[\\/]/).pop() ?? "").replace(UNSAFE_NAME, "").replace(/\s+/g, " ").trim();
  const clipped = Array.from(base).slice(0, 255).join("").trim();
  return clipped === "" || clipped === "." || clipped === ".." ? "file" : clipped;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** "<complaint id>/<random id>": the shape the database and Storage policies require. */
export function storagePath(complaintId: string, objectId: string): string | null {
  return UUID.test(complaintId) && UUID.test(objectId) ? `${complaintId}/${objectId}` : null;
}

export type UploadPolicy = {
  readonly maxFileBytes: number;
  readonly maxFiles: number;
  readonly maxRequestBytes: number;
  readonly allowedMimes: ReadonlySet<string>;
};

export const DEFAULT_POLICY: UploadPolicy = {
  maxFileBytes: 10 * 1024 * 1024,
  maxFiles: 5,
  maxRequestBytes: 50 * 1024 * 1024,
  allowedMimes: new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "audio/mpeg", "audio/mp4", "audio/x-m4a",
    "audio/wav", "audio/x-wav", "audio/webm"]),
};

export type UploadCandidate = { readonly name: string; readonly declaredMime: string; readonly bytes: Uint8Array };
export type UploadVerdict =
  | { readonly ok: true; readonly mime: string; readonly displayName: string; readonly size: number }
  | { readonly ok: false; readonly displayName: string; readonly error: string };

const GENERIC_MIME = new Set(["", "application/octet-stream", "binary/octet-stream"]);

export function validateUpload(file: UploadCandidate, policy: UploadPolicy): UploadVerdict {
  const displayName = sanitizeFilename(file.name);
  const fail = (error: string): UploadVerdict => ({ ok: false, displayName, error });

  if (file.bytes.length === 0) return fail("The file is empty.");
  if (file.bytes.length > policy.maxFileBytes) return fail(`The file is larger than ${Math.floor(policy.maxFileBytes / (1024 * 1024))} MB.`);

  const ext = extensionOf(displayName);
  const type = FILE_TYPES.find((t) => t.extensions.includes(ext));
  if (!type) return fail("This file type is not supported. Use JPEG, PNG, WebP, PDF, DOC, DOCX, MP3, M4A, WAV or WebM audio.");

  const detected = detectType(file.bytes);
  if (detected === null) return fail("The file contents do not match a supported file type.");
  if (detected !== type.mime) return fail("The file contents do not match its extension.");

  const declared = file.declaredMime.trim().toLowerCase().split(";")[0] ?? "";
  if (!GENERIC_MIME.has(declared) && declared !== type.mime && !type.aliases.includes(declared)) {
    return fail("The file type reported by your browser does not match the file.");
  }

  const allowed = policy.allowedMimes.has(detected) || type.aliases.some((a) => policy.allowedMimes.has(a));
  if (!allowed) return fail("This file type is not currently allowed.");
  return { ok: true, mime: detected, displayName, size: file.bytes.length };
}

/** Count and total-size limits for one request, checked before any file is read into memory. */
export function checkBatch(sizes: readonly number[], policy: UploadPolicy): string | null {
  if (sizes.length > policy.maxFiles) return `You can attach at most ${policy.maxFiles} files at a time.`;
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total > policy.maxRequestBytes) return "The files are too large to send together.";
  return null;
}

export function mimeLabel(mime: string): string {
  const t = byMime.get(mime) ?? FILE_TYPES.find((x) => x.aliases.includes(mime));
  return t ? t.label : "File";
}

export function describeAllowed(policy: UploadPolicy): string {
  const labels = FILE_TYPES.filter((t) => policy.allowedMimes.has(t.mime) || t.aliases.some((a) => policy.allowedMimes.has(a))).map((t) => t.label);
  return labels.join(", ");
}

export function nameLength(name: string): number { return codePointLength(name); }
