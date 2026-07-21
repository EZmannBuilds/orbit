# Orbit Axis API v1

The versioned calculation API. It is the contract the web app and a future iOS
client both build on, so it is written to be stable rather than convenient.

Base path: `/api/v1`

## What v1 is for

Calculation, not persistence. Every v1 endpoint is a pure function of its
request: no database read, no session, no user identity, no stored state. Send
the same body twice and you get the same answer.

This is deliberate. Orbit has always let someone explore a chart before creating
an account, and a calculation endpoint that requires a login would break that.
It also makes the API usable by a local-first iOS client that wants to compute a
chart without asking Orbit to remember anything about the person.

Saving, history, and account operations are **not** in v1. They arrive later,
under paths that require a verified Supabase token.

## Endpoints

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/v1/health` | public |
| GET | `/api/v1/version` | public |
| GET | `/api/v1/source` | public |
| POST | `/api/v1/charts/natal` | public, rate-limited |
| POST | `/api/v1/charts/transits` | public, rate-limited |
| POST | `/api/v1/charts/synastry` | public, rate-limited |
| POST | `/api/v1/readings/evidence` | public, rate-limited |

`/health` reports capability — whether the engine can calculate on this
instance — and never configuration. It will not tell a caller which database is
connected or which environment variables are set, because an unauthenticated
health endpoint is a reconnaissance target.

`/source` exists because Orbit's calculation engine is AGPL-3.0-or-later. The
licence requires that users of a network service can obtain the source, and an
endpoint that says where to get it is how that obligation is met in practice.

## Response envelope

Every response, success or failure, has the same shape:

```json
{ "data": { }, "meta": { "requestId": "…", "contractVersion": "v1" }, "error": null }
```

Exactly one of `data` and `error` is non-null. `meta.requestId` is present on
both, including on errors — an error a user cannot quote an identifier for is
not supportable.

Failures look like this:

```json
{
  "data": null,
  "meta": { "requestId": "…", "contractVersion": "v1" },
  "error": { "code": "INVALID_COORDINATES", "message": "…", "details": { "field": "latitude" } }
}
```

**Branch on `code`, never on `message`.** Codes are part of the contract and
will not change meaning within v1. Messages are prose for humans and may be
reworded, translated, or made friendlier at any time.

### Error codes

`INVALID_JSON`, `INVALID_INPUT`, `REQUEST_TOO_LARGE`, `METHOD_NOT_ALLOWED`,
`UNSUPPORTED_MEDIA_TYPE`, `INVALID_DATE`, `INVALID_TIME`, `INVALID_TIMEZONE`,
`INVALID_COORDINATES`, `UNSUPPORTED_HOUSE_SYSTEM`, `UNSUPPORTED_ZODIAC_TYPE`,
`INVALID_CHART`, `UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMITED`,
`ENGINE_UNAVAILABLE`, `ENGINE_CALCULATION_FAILED`, `NOT_FOUND`,
`INTERNAL_ERROR`.

`ENGINE_UNAVAILABLE` and `ENGINE_CALCULATION_FAILED` are kept apart on purpose.
The first means this instance cannot calculate at all — a missing binary,
missing ephemeris data, a checksum mismatch — and retrying the same request on
the same instance will not help. The second means the calculation itself failed
for this input. Different causes, different fixes, different retry advice.

## Input rules

**Nothing is silently repaired.** `2005-02-30` is rejected, not nudged to the
28th. A latitude of `200` is rejected, not clamped to 90. A chart computed from
repaired input is wrong in a way nobody can see, which is worse than an error.

**A time zone name is required, not a UTC offset.** Historical daylight-saving
rules differ by place and year, so `-05:00` is a guess about a date rather than
a fact about it. Orbit resolves the offset that actually applied at that place
on that date. Zone names are validated against the platform's own database, so
the check stays correct as zones change.

**`birthTimeKnown: false` is a first-class case, not an error.** Positions are
computed from a noon default and houses, Ascendant, and Midheaven are withheld
rather than guessed. The response carries a `BIRTH_TIME_UNKNOWN` entry in
`limitations`, and a client is expected to show it. A chart that hides its own
uncertainty invites more trust than it has earned.

The response shape stays stable regardless: when the time is unknown,
`angles` is still an object with `ascendant: null` and `midheaven: null`, so a
client never has to null-check the container before reading a field.

### Example

```http
POST /api/v1/charts/natal
Content-Type: application/json

{
  "birthDate": "1990-06-15",
  "birthTime": "14:30",
  "birthTimeKnown": true,
  "timezone": "America/Chicago",
  "latitude": 41.8781,
  "longitude": -87.6298,
  "houseSystem": "placidus",
  "zodiacType": "tropical"
}
```

`houseSystem` accepts `placidus`, `koch`, `porphyry`, `regiomontanus`,
`campanus`, `equal`, `whole-sign`, `alcabitius`, `morinus`. `zodiacType`
accepts `tropical` only — a request for sidereal fails loudly rather than
silently returning tropical positions.

## Privacy

**Errors never echo values.** `details` names the *field* that was wrong, never
its contents. A birth date in an error message ends up in logs, bug reports, and
screenshots. A final allow-list strips anything outside `field`, `allowed`,
`available`, `maxBytes`, `retryAfterSeconds`, and `received` before a response
leaves the router.

**Request bodies are never logged.** Server-side logging records the error code,
the route, and the request id — enough to diagnose, and nothing that identifies
a person.

**Stack traces never appear in a response** on any environment, deployed or
local.

## Rate limiting

Two classes: calculation at 30 requests/minute, platform at 120/minute, keyed on
a SHA-256 hash of the peer address rather than the raw address, because an IP is
personal data.

**This is per-instance, in-memory, best-effort — not distributed enforcement.**
A serverless deployment runs many instances and memory is not durable storage,
so the real ceiling is the per-instance limit multiplied by the instance count.
`describeGuarantees()` reports `distributed: false` so a reader is told this
rather than left to assume enforcement Orbit does not have. Moving to a shared
store is a later change; the limiter is injectable so that change does not
require touching the router.

## CORS

An allow-list, not a wildcard: localhost, origins configured via
`ORBIT_ALLOWED_ORIGINS`, and this project's own Vercel hostnames. Credentials
are never allowed, because these endpoints do not use cookies.

A native iOS client is unaffected. CORS is a browser mechanism — a native HTTP
client neither sends an `Origin` header nor enforces the response — so the
policy can stay tight for browsers without blocking the future app.

## Relationship to the existing routes

v1 is **additive**. No existing route was renamed, moved, or removed, and the
web app continues to call the routes it already called. The v1 router declines
any path outside `/api/v1`, so existing routing is untouched.

The two layers are not duplicates of each other: legacy routes are
authenticated and stateful (saved charts, sessions, settings), v1 routes are
public and stateless. Redirecting one to the other would be wrong.

Both compute through the same engine. `lib/astro/*` are re-export shims over
`@ezmannbuilds/orbit-axis-engine`, not a second implementation, so the two
layers cannot drift into returning different charts for the same birth data. A
test asserts this by identity.

## Verification

The v1 routes are verified against the **real built Vercel artifact** running in
a `linux/amd64` container, not against a local model of it — a distinction that
has already caught two defects this project would otherwise have shipped.

```
ok  health             200 ok engine 0.1.0 runtime linux-x64
ok  version            200 app 1.0.0 contract v1
ok  source             200 pending-publication
ok  natal              200 Sun 84.4280 houses 12
ok  transits           200 5 transits
ok  synastry           200 29 aspects
ok  evidence           200 6 items aiAssisted=false
ok  validation         400 INVALID_COORDINATES
ok  json-404           404 NOT_FOUND
ok  no-localhost-deps  no Ollama/Supabase localhost connection attempted
```

## Versioning

The path carries the version. Within v1, Orbit may add fields to a response and
add endpoints. It will not remove a field, change a field's type, change what an
error code means, or make an optional request field required. Anything that
would break an existing client gets a new version path, so an iOS build already
in the App Store keeps working after a server deploy — the case that makes
versioning worth the cost.
