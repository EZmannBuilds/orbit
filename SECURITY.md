# Security policy

## Reporting a vulnerability

Please report security issues **privately** rather than opening a public issue.

Use the support address published at `/support` on any running instance. If the
repository is public and has GitHub private vulnerability reporting enabled, that
works too.

Useful reports include: what you found, how to reproduce it, and what an attacker
could achieve. A proof of concept helps.

## Please do not

- Test against other people's accounts or real user data
- Run denial-of-service or load tests against a live instance
- Access, modify, or keep data that is not yours
- Disclose publicly before there has been a reasonable chance to fix it

If you find you can reach another user's data, **stop, do not read further, and
report it**. A single screenshot proving access is enough.

## Scope

In scope: authentication and session handling, account deletion, Row Level
Security and cross-user access, the `/api/v1` surface, secret exposure in client
bundles or API responses, and injection into the calculation runtime.

Out of scope: findings that require a compromised device, social engineering,
missing hardening headers with no demonstrated impact, and automated scanner
output with no working exploit.

## What Orbit already does

Recorded so reports can focus on what is not covered:

- Every user-owned table enforces ownership in the database, verified with two
  live accounts rather than assumed
- The service-role key is server-only and never reaches a browser; a test scans
  the built client output for it
- Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` on deployments
- Sign-in and password reset are non-enumerating: the same response whether or
  not an account exists
- Request bodies are never logged, so birth details do not reach logs
- API errors name the field that was wrong, never its value
- Account deletion derives identity from the verified token; a client-supplied
  user id is never read

## Handling

Reports are acknowledged, investigated, and fixed as quickly as is practical.
Credit is given if you would like it. There is no paid bounty programme — Orbit
Axis is a free, open-source project.
