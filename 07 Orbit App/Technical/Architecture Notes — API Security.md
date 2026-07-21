---
id: 7b41e0d8-5c92-4a6f-8e13-9d20c7fa4b85
title: Architecture Notes — API Security
type: technical_decision
status: active
created_at: 2026-07-21T00:00:00-05:00
updated_at: 2026-07-21T00:00:00-05:00
tags:
  - orbit
  - orbit-axis
  - api
  - security
  - privacy
source: user
supabase_sync: true
---

# Architecture Notes — API Security

The security posture of `/api/v1`, introduced by Update 5.0, Session 3.

Related: [[Architecture Notes — Versioned API]],
[[Supabase Auth and Session Architecture]], [[Orbit Axis Engine Architecture]]

## Birth data is the sensitive asset

A birth date, time, and coordinates identify a person and a place to within a
few minutes and a few hundred metres. Everything below follows from treating
that as personal data rather than as calculation input.

**Errors never echo values.** Error details name the *field* that was wrong,
never its contents. A birth date in an error message ends up in logs, bug
reports, and screenshots. A final allow-list strips anything outside `field`,
`allowed`, `available`, `maxBytes`, `retryAfterSeconds`, and `received` before a
response leaves the router — the rule is enforced at the boundary rather than
trusted to every handler.

**Request bodies are never logged.** Server-side logging records the error code,
the route, and the request id. Enough to diagnose; nothing that identifies a
person.

**Stack traces never appear in a response** on any environment, deployed or
local. There is no debug flag that turns them on.

## Cross-cutting concerns live in one place

The router owns request id, method checks, content-type checks, body limits,
rate limiting, error translation, and CORS. Each handler is then a plain
function of its input.

This is a security property, not a tidiness one: a check that each handler must
remember to perform is a check that some handler will eventually forget.

## Rate limiting, described honestly

Two classes — calculation at 30/minute, platform at 120/minute — keyed on a
SHA-256 hash of the peer address rather than the raw address, because an IP is
personal data.

**It is per-instance, in-memory, best-effort. It is not distributed
enforcement.** A serverless deployment runs many instances and memory is not
durable storage, so the real ceiling is the per-instance limit times the
instance count. `describeGuarantees()` reports `distributed: false` rather than
letting a reader assume protection Orbit does not have.

Overstating this would be the actual danger: someone would rely on it. Moving to
a shared store is a later change, and the limiter is injectable so that change
will not require touching the router.

## CORS is an allow-list

Localhost, origins configured via `ORBIT_ALLOWED_ORIGINS`, and this project's
own Vercel hostnames — matched by pattern because preview deployments have
per-commit names, and scoped to Orbit rather than any `*.vercel.app`.
Credentials are never allowed, because these endpoints do not use cookies.

A native iOS client is unaffected: CORS is a browser mechanism, so the policy
can stay tight for browsers without blocking the future app.

## Public calculation is a deliberate choice

The calculation endpoints read nothing and write nothing, so exposure is bounded
by compute rather than by data. They are rate-limited instead of authenticated.

If a request does carry a bearer token, the identity buckets rate limiting only.
It never changes the answer, and a client-supplied user id is never trusted for
anything.

## Health reports capability, never configuration

`/api/v1/health` says whether the engine can calculate on this instance. It will
not report which database is connected or which environment variables are set.
An unauthenticated health endpoint is a reconnaissance target, and the useful
answer and the dangerous answer are not the same answer.

## Request limits

Bodies are capped at 64 KB and the stream is destroyed on overflow rather than
buffered and then rejected — otherwise the limit describes what is stored, not
what is read. Content type must be JSON. Unknown `/api/v1` paths return a JSON
404 in the standard envelope, so a client's error handling never has to parse
HTML.

## Inbound request ids are validated

A client-supplied `x-request-id` is honoured only if it matches
`^[A-Za-z0-9_-]{8,64}$`; otherwise Orbit generates one. An id echoed into logs
unvalidated is a log-injection vector.
