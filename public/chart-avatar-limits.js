// Orbit Axis :: avatar limits shared by the browser and the server.
//
// Both halves of the pipeline need the same numbers, and both need to agree on
// what a rejection is called. The browser enforces these so the person is told
// immediately; the server enforces them again against the actual bytes,
// because the browser is a client. Two copies of these constants would drift,
// and the drift would show up as an upload the client accepted and the server
// refused.
//
// Lives in public/ because lib/ is never served. public/moon-phase.js and
// public/chart-identity.js are arranged the same way.

export const AVATAR_DIMENSION = 512;
export const AVATAR_MAX_BYTES = 1_048_576;        // 1 MB, normalized ceiling
export const AVATAR_SOURCE_MAX_BYTES = 10_485_760; // 10 MB, what the picker accepts
export const AVATAR_SOURCE_MIN_DIMENSION = 128;
export const AVATAR_CONTENT_TYPES = Object.freeze(["image/webp", "image/png"]);
export const AVATAR_OBJECT_NAME = "avatar.webp";

export class AvatarError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}


/** What the picker accepts before the browser normalizes it. */
export function validateSourceFile({ size, type } = {}) {
  if (!Number.isFinite(size) || size <= 0) {
    throw new AvatarError("avatar_empty", "That file was empty.");
  }
  if (size > AVATAR_SOURCE_MAX_BYTES) {
    throw new AvatarError("avatar_source_too_large", "Choose an image under 10 MB.");
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(String(type || "").split(";")[0])) {
    throw new AvatarError("avatar_source_format", "Choose a JPEG, PNG, or WebP image.");
  }
  return true;
}

export function validateSourceDimensions(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new AvatarError("avatar_malformed", "Orbit couldn't read that image.");
  }
  if (width < AVATAR_SOURCE_MIN_DIMENSION || height < AVATAR_SOURCE_MIN_DIMENSION) {
    throw new AvatarError("avatar_source_too_small",
      `Choose an image at least ${AVATAR_SOURCE_MIN_DIMENSION} pixels on each side.`);
  }
  return true;
}
