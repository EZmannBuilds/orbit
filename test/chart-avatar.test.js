// Orbit Axis :: chart avatar validation.
//
// Every check here runs against real bytes rather than against a declared
// type, because the declared type is the thing an attacker controls. The
// fixtures are built byte by byte for the same reason: a test that validates a
// file the same library produced proves the library agrees with itself.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  sniffFormat, isAnimatedWebp, readDimensions, validateAvatarUpload,
  validateSourceFile, validateSourceDimensions, avatarObjectPath,
  avatarCacheHeaders, assertFreshWrite, AvatarError,
  AVATAR_DIMENSION, AVATAR_MAX_BYTES, AVATAR_SOURCE_MAX_BYTES,
  AVATAR_SOURCE_MIN_DIMENSION, AVATAR_CONTENT_TYPES,
} from "../lib/charts/avatar.js";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const threw = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };

// ── Byte-level fixtures ─────────────────────────────────────────────────────

function webpVP8L(w = 512, h = 512) {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0); b.writeUInt32LE(22, 4); b.write("WEBP", 8);
  b.write("VP8L", 12); b.writeUInt32LE(10, 16); b[20] = 0x2F;
  b.writeUInt32LE((((w - 1) & 0x3FFF) | (((h - 1) & 0x3FFF) << 14)) >>> 0, 21);
  return b;
}
function webpVP8X(w = 512, h = 512, { animated = false } = {}) {
  const b = Buffer.alloc(40);
  b.write("RIFF", 0); b.writeUInt32LE(32, 4); b.write("WEBP", 8);
  b.write("VP8X", 12); b.writeUInt32LE(10, 16);
  b[20] = animated ? 0x02 : 0x00;
  b[24] = (w - 1) & 0xFF; b[25] = ((w - 1) >> 8) & 0xFF; b[26] = ((w - 1) >> 16) & 0xFF;
  b[27] = (h - 1) & 0xFF; b[28] = ((h - 1) >> 8) & 0xFF; b[29] = ((h - 1) >> 16) & 0xFF;
  if (animated) b.write("ANIM", 30);
  return b;
}
function png(w = 512, h = 512) {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).copy(b, 0);
  b.write("IHDR", 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
const jpeg = () => Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(16)]);
const gif = () => Buffer.from("GIF89a" + "\0".repeat(14));
const svg = () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const html = () => Buffer.from("<!doctype html><html><body>hi</body></html>");
const exe = () => Buffer.concat([Buffer.from([0x4D, 0x5A]), Buffer.alloc(16)]);
const elf = () => Buffer.concat([Buffer.from([0x7F]), Buffer.from("ELF"), Buffer.alloc(16)]);

// ── Format sniffing ─────────────────────────────────────────────────────────

test("format comes from the bytes, never from the declared type", () => {
  assert.equal(sniffFormat(webpVP8L()), "image/webp");
  assert.equal(sniffFormat(png()), "image/png");
  assert.equal(sniffFormat(jpeg()), "image/jpeg");
  assert.equal(sniffFormat(gif()), "image/gif");
  assert.equal(sniffFormat(svg()), "image/svg+xml");
  assert.equal(sniffFormat(html()), "text/html");
  assert.equal(sniffFormat(exe()), "application/x-msdownload");
  assert.equal(sniffFormat(elf()), "application/x-elf");
  assert.equal(sniffFormat(Buffer.alloc(4)), null, "too short to judge is not a guess");
  assert.equal(sniffFormat(null), null);
});

test("a mismatch between the claim and the bytes is refused outright", () => {
  // Real WebP labelled as PNG. The label is what an attacker controls.
  assert.equal(threw(() => validateAvatarUpload(webpVP8L(), { declaredType: "image/png" })),
    "avatar_type_mismatch");
  // And the honest pairing still passes, charset parameter and all.
  assert.ok(validateAvatarUpload(webpVP8L(), { declaredType: "image/webp; charset=binary" }));
});

test("a polyglot cannot pass by being labelled an image", () => {
  for (const [name, bytes] of [["svg", svg()], ["html", html()], ["exe", exe()], ["elf", elf()]]) {
    assert.equal(threw(() => validateAvatarUpload(bytes, { declaredType: "image/webp" })),
      "avatar_format_rejected", `${name} slipped through`);
  }
});

// ── Accepted and rejected formats ───────────────────────────────────────────

test("only WebP and PNG are stored", () => {
  assert.deepEqual([...AVATAR_CONTENT_TYPES], ["image/webp", "image/png"]);
  assert.ok(validateAvatarUpload(webpVP8L()));
  assert.ok(validateAvatarUpload(png()));
});

test("SVG, GIF, and an un-normalized JPEG are all refused", () => {
  assert.equal(threw(() => validateAvatarUpload(svg())), "avatar_format_rejected");
  assert.equal(threw(() => validateAvatarUpload(gif())), "avatar_format_rejected");
  // A JPEG arriving here means the browser never normalized it.
  assert.equal(threw(() => validateAvatarUpload(jpeg())), "avatar_format_rejected");
});

test("animated WebP is refused, by flag and by chunk", () => {
  assert.equal(isAnimatedWebp(webpVP8X(512, 512, { animated: true })), true);
  assert.equal(isAnimatedWebp(webpVP8X(512, 512)), false);
  assert.equal(isAnimatedWebp(webpVP8L()), false, "a lossless still is not animated");
  assert.equal(threw(() => validateAvatarUpload(webpVP8X(512, 512, { animated: true }))),
    "avatar_animated");
});

// ── Dimensions ──────────────────────────────────────────────────────────────

test("dimensions are read from the container for every WebP variant and PNG", () => {
  assert.deepEqual(readDimensions(webpVP8L(512, 512), "image/webp"), { width: 512, height: 512 });
  assert.deepEqual(readDimensions(webpVP8X(512, 512), "image/webp"), { width: 512, height: 512 });
  assert.deepEqual(readDimensions(png(512, 512), "image/png"), { width: 512, height: 512 });
  assert.deepEqual(readDimensions(webpVP8L(300, 200), "image/webp"), { width: 300, height: 200 });
});

test("only a square at exactly 512 is accepted", () => {
  const ok = validateAvatarUpload(webpVP8L(AVATAR_DIMENSION, AVATAR_DIMENSION));
  assert.equal(ok.width, AVATAR_DIMENSION);
  assert.equal(ok.height, AVATAR_DIMENSION);
  assert.equal(threw(() => validateAvatarUpload(webpVP8L(512, 256))), "avatar_not_square");
  assert.equal(threw(() => validateAvatarUpload(webpVP8L(256, 256))), "avatar_wrong_dimensions");
  assert.equal(threw(() => validateAvatarUpload(webpVP8L(1024, 1024))), "avatar_wrong_dimensions");
});

test("a truncated or unreadable image is refused rather than assumed", () => {
  const stunted = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(2)]);
  assert.ok(["avatar_malformed", "avatar_unrecognised"].includes(threw(() => validateAvatarUpload(stunted))));
  assert.equal(threw(() => validateAvatarUpload(Buffer.alloc(0))), "avatar_empty");
  assert.equal(threw(() => validateAvatarUpload(null)), "avatar_empty");
});

// ── Size limits ─────────────────────────────────────────────────────────────

test("the normalized ceiling is checked before anything reads the contents", () => {
  assert.equal(AVATAR_MAX_BYTES, 1_048_576);
  assert.equal(threw(() => validateAvatarUpload(Buffer.alloc(AVATAR_MAX_BYTES + 1))), "avatar_too_large");
});

test("the source picker enforces its own limits before any work happens", () => {
  assert.equal(AVATAR_SOURCE_MAX_BYTES, 10_485_760);
  assert.ok(validateSourceFile({ size: 2_000_000, type: "image/jpeg" }));
  assert.ok(validateSourceFile({ size: 10, type: "image/png" }));
  assert.ok(validateSourceFile({ size: 10, type: "image/webp" }));
  assert.equal(threw(() => validateSourceFile({ size: AVATAR_SOURCE_MAX_BYTES + 1, type: "image/png" })),
    "avatar_source_too_large");
  assert.equal(threw(() => validateSourceFile({ size: 10, type: "image/gif" })), "avatar_source_format");
  assert.equal(threw(() => validateSourceFile({ size: 10, type: "image/svg+xml" })), "avatar_source_format");
  assert.equal(threw(() => validateSourceFile({ size: 0, type: "image/png" })), "avatar_empty");
});

test("a source below the minimum would only upscale, so it is refused", () => {
  assert.equal(AVATAR_SOURCE_MIN_DIMENSION, 128);
  assert.ok(validateSourceDimensions(128, 128));
  assert.ok(validateSourceDimensions(4000, 3000));
  assert.equal(threw(() => validateSourceDimensions(127, 400)), "avatar_source_too_small");
  assert.equal(threw(() => validateSourceDimensions(400, 64)), "avatar_source_too_small");
  assert.equal(threw(() => validateSourceDimensions(0, 0)), "avatar_malformed");
});

// ── Paths, headers, concurrency ─────────────────────────────────────────────

test("the object path is built from server-held ids, so traversal is impossible", () => {
  const owner = "9f2b1c4d-1111-4222-8333-444455556666";
  const chart = "0a1b2c3d-1111-4222-8333-444455556666";
  assert.equal(avatarObjectPath(owner, chart), `${owner}/${chart}/avatar.webp`);
  // Anything that is not a uuid never reaches a path at all.
  for (const bad of ["../../etc/passwd", "..", "", null, `${owner}/../x`]) {
    assert.equal(threw(() => avatarObjectPath(bad, chart)), "avatar_path_invalid");
    assert.equal(threw(() => avatarObjectPath(owner, bad)), "avatar_path_invalid");
  }
  assert.ok(!avatarObjectPath(owner, chart).includes(".."));
  assert.ok(avatarObjectPath(owner, chart).startsWith(owner),
    "the first segment is what the storage policies compare against");
});

test("delivery is private, revalidated, and version-keyed", () => {
  const h = avatarCacheHeaders(3);
  assert.match(h["Cache-Control"], /private/);
  assert.ok(!/public/.test(h["Cache-Control"]), "never a shared cache");
  assert.equal(h.ETag, '"avatar-v3"');
  assert.notEqual(avatarCacheHeaders(4).ETag, h.ETag, "a replacement invalidates immediately");
  assert.equal(h["X-Content-Type-Options"], "nosniff");
  assert.equal(avatarCacheHeaders(0).ETag, '"avatar-v0"');
});

test("a stale write is refused so a slow upload cannot bury a newer one", () => {
  assert.ok(assertFreshWrite(3, 3));
  assert.equal(threw(() => assertFreshWrite(2, 3)), "avatar_stale_write");
  // No expectation supplied means the caller is not doing a replace.
  assert.ok(assertFreshWrite(null, 7));
  assert.ok(assertFreshWrite(undefined, 7));
});

// ── What must not leak ──────────────────────────────────────────────────────

test("no rejection message discloses storage internals", () => {
  const messages = [];
  const attempts = [
    () => validateAvatarUpload(svg()), () => validateAvatarUpload(gif()),
    () => validateAvatarUpload(Buffer.alloc(AVATAR_MAX_BYTES + 1)),
    () => validateAvatarUpload(webpVP8L(256, 256)),
    () => validateAvatarUpload(webpVP8L(), { declaredType: "image/png" }),
    () => avatarObjectPath("x", "y"), () => assertFreshWrite(1, 2),
  ];
  for (const fn of attempts) { try { fn(); } catch (e) { messages.push(e.message); } }
  assert.ok(messages.length >= 6);
  for (const m of messages) {
    for (const leak of ["chart-avatars", "bucket", "supabase", "storage.objects", "auth.uid", "/avatar.webp"]) {
      assert.ok(!m.toLowerCase().includes(leak.toLowerCase()), `"${leak}" leaked in: ${m}`);
    }
    assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(m), "no uuid in a user-facing message");
  }
});

test("the validator is pure — no I/O, no client, no dependency", () => {
  const src = readFileSync(join(ROOT, "lib", "charts", "avatar.js"), "utf8");
  const code = src.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
  const banned = ["fetch(", "require(", "import(", "createClient", "Math.random", "process.env"];
  for (const b of banned) {
    assert.ok(!code.includes(b), `${b} must not appear in a pure validator`);
  }
});

test("every rejection carries a structured code", () => {
  const e = new AvatarError("avatar_too_large", "x");
  assert.ok(e instanceof Error);
  assert.equal(e.code, "avatar_too_large");
});
