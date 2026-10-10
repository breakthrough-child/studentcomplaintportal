// Re-encodes an already validated profile picture (see ./policy.ts). Server code only: it uses sharp
// (libvips), which Next.js ships for image optimisation.
//
// The output is a new AVATAR_SIZE_PX square WebP. sharp writes no EXIF/XMP/ICC metadata unless asked,
// so camera details and GPS coordinates in the original are dropped. Decoding is bounded by
// limitInputPixels (decompression bombs) and fails on corrupt input.
import sharp from "sharp";
import { AVATAR_SIZE_PX } from "./policy";

const MAX_INPUT_PIXELS = 40_000_000;

export async function normaliseAvatar(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const out = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error", animated: false })
      .rotate() // apply the EXIF orientation before the metadata is discarded
      .resize(AVATAR_SIZE_PX, AVATAR_SIZE_PX, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
    return new Uint8Array(out);
  } catch {
    return null;
  }
}
