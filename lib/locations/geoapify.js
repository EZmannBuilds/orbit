import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseConfig } from "../local-llm/config.js";

const GEOAPIFY_ROOT = "https://api.geoapify.com/v1/geocode/autocomplete";
const MIN_QUERY = 3;
const MAX_QUERY = 120;
const DEFAULT_LIMIT = 5;

export class LocationError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function geoapifyKey() {
  supabaseConfig();
  return process.env.GEOAPIFY_API_KEY || "";
}

export function cleanLocationQuery(query) {
  const q = String(query || "").normalize("NFKC").trim().replace(/\s+/g, " ");
  if (q.length < MIN_QUERY) throw new LocationError("query_too_short", "Enter at least 3 characters.");
  if (q.length > MAX_QUERY) throw new LocationError("query_too_long", "Search is too long.");
  return q;
}

function bestLocality(p = {}) {
  return p.city || p.town || p.village || p.municipality || p.county || p.district || p.suburb || p.name || "";
}

export function normalizeGeoapifyFeature(feature) {
  const p = feature?.properties || {};
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const label = p.formatted || [bestLocality(p), p.state, p.country].filter(Boolean).join(", ");
  if (!label) return null;
  return {
    provider: "geoapify",
    provider_place_id: String(p.place_id || p.datasource?.raw?.place_id || `${lat},${lon}`),
    label,
    city: bestLocality(p),
    region: p.state || p.county || "",
    country: p.country || "",
    country_code: String(p.country_code || "").toLowerCase(),
    latitude: Math.round(lat * 1e6) / 1e6,
    longitude: Math.round(lon * 1e6) / 1e6,
  };
}

export function signPlace(place) {
  const key = geoapifyKey();
  if (!key) throw new LocationError("geoapify_unconfigured", "Birthplace search is not configured.", 503);
  const payload = JSON.stringify({
    provider: place.provider,
    provider_place_id: place.provider_place_id,
    label: place.label,
    latitude: place.latitude,
    longitude: place.longitude,
  });
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function verifyPlaceSignature(place, signature) {
  if (!signature) return false;
  const expected = Buffer.from(signPlace(place));
  const received = Buffer.from(String(signature));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function safePlaceForClient(place) {
  return { ...place, selection_token: signPlace(place) };
}

export async function searchGeoapify(query, { fetchImpl = fetch, limit = DEFAULT_LIMIT, timeoutMs = 5000 } = {}) {
  const key = geoapifyKey();
  if (!key) throw new LocationError("geoapify_unconfigured", "Birthplace search is not configured.", 503);
  const q = cleanLocationQuery(query);
  const capped = Math.max(1, Math.min(Number(limit) || DEFAULT_LIMIT, 8));
  const url = new URL(GEOAPIFY_ROOT);
  url.searchParams.set("text", q);
  url.searchParams.set("limit", String(capped));
  url.searchParams.set("format", "geojson");
  url.searchParams.set("apiKey", key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(url, { signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") throw new LocationError("geoapify_timeout", "Birthplace search timed out.", 504);
    throw new LocationError("geoapify_unreachable", "Birthplace search is unavailable.", 502);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new LocationError("geoapify_error", "Birthplace search failed.", 502);
  let data;
  try { data = await res.json(); } catch { throw new LocationError("geoapify_malformed", "Birthplace search returned malformed data.", 502); }
  const features = Array.isArray(data.features) ? data.features : [];
  return features.map(normalizeGeoapifyFeature).filter(Boolean).slice(0, capped).map(safePlaceForClient);
}
