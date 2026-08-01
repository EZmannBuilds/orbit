// Orbit Axis :: chart avatar validation.
//
// The browser normalizes the image — decode, centre-crop, resize to 512, and
// re-encode as WebP, which is also what strips the metadata. This module does
// not trust any of that.
//
// A browser is a client. Its Content-Type is a claim, its filename is a claim,
// and anyone can POST whatever bytes they like to an endpoint. So every limit
// the client enforces is enforced again here against the actual bytes, and
// the format is determined by reading the file's own header rather than by
// believing what it was labelled.
//
// Pure and dependency-free: takes bytes, returns a verdict. No I/O, no
// Storage client, no image library.

import {
  AVATAR_DIMENSION, AVATAR_MAX_BYTES, AVATAR_SOURCE_MAX_BYTES,
  AVATAR_SOURCE_MIN_DIMENSION, AVATAR_CONTENT_TYPES, AVATAR_OBJECT_NAME,
  AvatarError, validateSourceFile, validateSourceDimensions,
} from "../../public/chart-avatar-limits.js";

export {
  AVATAR_DIMENSION, AVATAR_MAX_BYTES, AVATAR_SOURCE_MAX_BYTES,
  AVATAR_SOURCE_MIN_DIMENSION, AVATAR_CONTENT_TYPES, AVATAR_OBJECT_NAME,
  AvatarError, validateSourceFile, validateSourceDimensions,
};

const u32be = (b, o) => (b[o] << 24 | b[o + 1] << 16 | b[o + 2] << 8 | b[o + 3]) >>> 0;
const u32le = (b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0;
const ascii = (b, o, n) => String.fromCharCode(...b.slice(o, o + n));

/**
 * What the bytes actually are.
 *
 * Returns null for anything unrecognised, which the caller treats as a
 * rejection. Deliberately does NOT fall back to the declared Content-Type:
 * that is the exact hole a polyglot file walks through.
 */
export function sniffFormat(bytes) {
  if (!bytes || bytes.length < 12) return null;
  // RIFF....WEBP
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  // \x89PNG\r\n\x1a\n
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG"
      && bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A) {
    return "image/png";
  }
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return "image/jpeg";
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return "image/gif";
  // SVG and HTML are text; both are rejected, and both can masquerade as an
  // image via Content-Type alone.
  const head = ascii(bytes, 0, Math.min(bytes.length, 256)).trimStart().toLowerCase();
  if (head.startsWith("<?xml") || head.startsWith("<svg")) return "image/svg+xml";
  if (head.startsWith("<!doctype html") || head.startsWith("<html")) return "text/html";
  if (bytes[0] === 0x4D && bytes[1] === 0x5A) return "application/x-msdownload";      // MZ
  if (ascii(bytes, 1, 3) === "ELF" && bytes[0] === 0x7F) return "application/x-elf";
  return null;
}

/**
 * WebP is a RIFF container. VP8X carries a flags byte whose 0x02 bit marks an
 * animation, and an ANIM/ANMF chunk is the animation itself. Either means the
 * upload is a moving image, which a chart avatar is not.
 */
export function isAnimatedWebp(bytes) {
  if (!bytes || bytes.length < 21) return false;
  if (ascii(bytes, 12, 4) !== "VP8X") return false;
  if ((bytes[20] & 0x02) !== 0) return true;
  const window = ascii(bytes, 12, Math.min(bytes.length - 12, 4096));
  return window.includes("ANIM") || window.includes("ANMF");
}

/** Dimensions, read from the container rather than from a decode. */
export function readDimensions(bytes, format) {
  if (format === "image/png") {
    // IHDR width/height sit at fixed offsets after the 8-byte signature.
    if (bytes.length < 24 || ascii(bytes, 12, 4) !== "IHDR") return null;
    return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
  }
  if (format === "image/webp") {
    const chunk = ascii(bytes, 12, 4);
    if (chunk === "VP8X" && bytes.length >= 30) {
      // 24-bit little-endian, stored as (dimension - 1).
      const w = (bytes[24] | bytes[25] << 8 | bytes[26] << 16) + 1;
      const h = (bytes[27] | bytes[28] << 8 | bytes[29] << 16) + 1;
      return { width: w, height: h };
    }
    if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2F) {
      const b = u32le(bytes, 21);
      return { width: (b & 0x3FFF) + 1, height: ((b >> 14) & 0x3FFF) + 1 };
    }
    if (chunk === "VP8 " && bytes.length >= 30) {
      return {
        width: (bytes[26] | bytes[27] << 8) & 0x3FFF,
        height: (bytes[28] | bytes[29] << 8) & 0x3FFF,
      };
    }
    return null;
  }
  return null;
}

/**
 * The whole verdict on an uploaded avatar.
 *
 * Order matters: cheap checks first, so a 40 MB payload is refused on its
 * length before anything tries to reason about its contents.
 */
export function validateAvatarUpload(bytes, { declaredType = null } = {}) {
  if (!bytes || !bytes.length) {
    throw new AvatarError("avatar_empty", "That file was empty.");
  }
  if (bytes.length > AVATAR_MAX_BYTES) {
    throw new AvatarError("avatar_too_large",
      "That image is larger than Orbit accepts after processing. Try another picture.");
  }

  const actual = sniffFormat(bytes);
  if (!actual) {
    throw new AvatarError("avatar_unrecognised", "Orbit couldn't read that file as an image.");
  }
  if (!AVATAR_CONTENT_TYPES.includes(actual)) {
    // Named individually so the message can be useful, but every one of these
    // is a refusal.
    const why = {
      "image/svg+xml": "SVG images aren't accepted.",
      "image/gif": "GIFs aren't accepted.",
      "image/jpeg": "That image wasn't processed before upload. Choose it again.",
      "text/html": "That file isn't an image.",
      "application/x-msdownload": "That file isn't an image.",
      "application/x-elf": "That file isn't an image.",
    }[actual] || "That image format isn't accepted.";
    throw new AvatarError("avatar_format_rejected", why);
  }

  // The claim and the bytes must agree. A mismatch is not a mistake worth
  // recovering from — it is the signature of someone probing the endpoint.
  if (declaredType && declaredType.split(";")[0].trim() !== actual) {
    throw new AvatarError("avatar_type_mismatch", "That upload didn't match its declared format.");
  }

  if (actual === "image/webp" && isAnimatedWebp(bytes)) {
    throw new AvatarError("avatar_animated", "Animated images aren't accepted.");
  }

  const dims = readDimensions(bytes, actual);
  if (!dims || !dims.width || !dims.height) {
    throw new AvatarError("avatar_malformed", "Orbit couldn't read that image's size.");
  }
  if (dims.width !== dims.height) {
    throw new AvatarError("avatar_not_square", "That image wasn't cropped to a square.");
  }
  if (dims.width !== AVATAR_DIMENSION) {
    throw new AvatarError("avatar_wrong_dimensions",
      `Processed images must be ${AVATAR_DIMENSION} by ${AVATAR_DIMENSION}.`);
  }

  return Object.freeze({ contentType: actual, bytes: bytes.length, ...dims });
}


/**
 * The object path.
 *
 * Built here from ids the SERVER holds, never from anything a client sent, so
 * "../" can't appear in it — the traversal is prevented by construction rather
 * than by sanitising a supplied string. The first segment is the owner, which
 * is what the Storage policies compare against.
 */
export function avatarObjectPath(ownerId, chartId) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(String(ownerId)) || !uuid.test(String(chartId))) {
    throw new AvatarError("avatar_path_invalid", "That chart couldn't be identified.");
  }
  return `${ownerId}/${chartId}/${AVATAR_OBJECT_NAME}`;
}

/**
 * Private cache headers.
 *
 * `private` keeps the image out of shared caches; the version-derived ETag
 * means a replacement invalidates immediately rather than serving the previous
 * face until a TTL expires. nosniff stops a browser deciding the bytes are
 * something more interesting than an image.
 */
export function avatarCacheHeaders(version, contentType = "image/webp") {
  return Object.freeze({
    "Content-Type": contentType,
    "Cache-Control": "private, max-age=0, must-revalidate",
    "ETag": `"avatar-v${Number(version) || 0}"`,
    "X-Content-Type-Options": "nosniff",
  });
}

/**
 * Stale-write guard. A slow upload must not land on top of a newer one, and a
 * replacement racing a removal must not resurrect the removed image.
 */
export function assertFreshWrite(expectedVersion, currentVersion) {
  if (expectedVersion === null || expectedVersion === undefined) return true;
  if (Number(expectedVersion) !== Number(currentVersion)) {
    throw new AvatarError("avatar_stale_write",
      "This chart's picture changed somewhere else. Reload and try again.");
  }
  return true;
}
