// Orbit Axis :: known database targets (Update 4.0.2).
//
// The ONE place that names which Supabase projects Orbit knows about. Nothing
// else in the codebase should compare hostnames or project references — import
// from here so there is a single, reviewable list.
//
// A project reference is a public identifier (it appears in the project URL).
// It is not a credential, and nothing in this file is secret. Keys, tokens, and
// connection strings never belong here.

// Hosts that mean "a database running on this machine".
export const LOCAL_HOSTS = Object.freeze(["127.0.0.1", "localhost", "::1", "[::1]", "0.0.0.0"]);

// The hosted production project. Writing to this by accident is the exact
// failure this update exists to prevent.
export const PRODUCTION_PROJECT_REF = "mtdrazdastcgiweauwoj";

// Hosted projects explicitly approved as non-production preview targets.
// Empty by design: a hosted project is NOT preview-safe just because it isn't
// production. Add a ref here (or via ORBIT_PREVIEW_PROJECT_REFS) only after a
// human has confirmed it is disposable.
export const APPROVED_PREVIEW_PROJECT_REFS = Object.freeze([]);

// Extra preview refs supplied by configuration, comma-separated.
export function configuredPreviewRefs(env = process.env) {
  return String(env.ORBIT_PREVIEW_PROJECT_REFS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Supabase hosted URLs look like https://<ref>.supabase.co
export function projectRefFromUrl(url) {
  if (!url) return null;
  let host;
  try { host = new URL(String(url)).hostname; } catch { return null; }
  // Supabase refs are currently 20 lowercase alphanumerics, but the length is
  // not guaranteed forever. Anchoring on the full host is what actually matters:
  // "<ref>.supabase.co.evil.com" must never parse as a Supabase project.
  const match = host.match(/^([a-z0-9]{16,40})\.supabase\.(co|in)$/i);
  return match ? match[1].toLowerCase() : null;
}

export function hostFromUrl(url) {
  if (!url) return null;
  try { return new URL(String(url)).hostname; } catch { return null; }
}

export function isLocalHost(host) {
  if (!host) return false;
  return LOCAL_HOSTS.includes(String(host).toLowerCase());
}
