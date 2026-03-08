# Authentication

This document describes ArrMate's authentication model, the security assumptions behind it, and the conventions developers should follow when adding new pages, API routes, or auth-related behavior.

## Goals

- Keep setup simple for a self-hosted single-user deployment.
- Require authentication for the dashboard and all operational APIs.
- Avoid storing reusable bearer tokens in plaintext.
- Support logout and password-change session revocation.
- Protect cookie-authenticated mutations from CSRF without adding per-form CSRF tokens.

## Model Summary

ArrMate uses a single persisted administrator account. There is no multi-user support, role system, invitation flow, or external identity provider.

- The administrator account is created once during first-run onboarding.
- Credentials are stored in SQLite in `auth_admin`.
- Authenticated sessions are stored in SQLite in `auth_sessions`.
- Failed login attempts are tracked per IP in `auth_login_attempts`.
- Passwords are hashed with scrypt.
- Session cookies store an opaque random token; the database stores only an HMAC-SHA256 hash of that token.

## First-Run Onboarding

When no administrator account exists, ArrMate is considered unconfigured.

- `/` redirects to `/onboarding`.
- `POST /api/auth/setup` is the only route that can create the initial admin account.
- Onboarding can optionally create the first instance after verifying its connection.
- A successful onboarding request also creates the first authenticated session and sets the session cookie.

If authentication configuration is invalid, onboarding remains blocked until the underlying problem is fixed. Today that primarily means the session secret must be valid.

## Login Flow

`POST /api/auth/login` verifies the submitted username and password against the stored admin record.

- Usernames are compared in constant time after trimming the submitted value.
- Password hashes are verified with scrypt.
- On success, ArrMate creates a 24-hour session row and sets an HTTP-only cookie.
- On failure, ArrMate increments the failed-login window for the caller's IP address.
- After 5 failed attempts within 15 minutes, that IP is blocked for 15 minutes.

The login throttle is persisted in SQLite, so it survives process restarts.

## Session Model

Sessions are opaque, server-side, and revocable.

- Cookie value: a random 32-byte token encoded as base64url.
- Stored value: `HMAC-SHA256(token, session secret)` in `auth_sessions.token_hash`.
- TTL: fixed 24 hours from login or onboarding.
- Cookie flags: `HttpOnly`, `SameSite=Strict`, `Path=/`, and `Secure` in production.
- Cookie name:
  - Development: `arrmate_session`
  - Production: `__Host-arrmate_session`

In production the `__Host-` prefix intentionally prevents setting a `Domain` attribute and requires `Secure`, which keeps the cookie scoped to the current host over HTTPS.

Expired sessions are cleaned up during authentication operations before active-session lookups or new-session creation.

## Route Protection

### App Pages

Dashboard pages must call `requirePageSession()` before rendering protected content.

- If the app is configured and the request is unauthenticated, the user is redirected to `/login`.
- If no admin account exists yet, the user is redirected to `/onboarding`.

Public pages are intentionally limited to `/login` and `/onboarding`.

### API Routes

Protected API routes must be wrapped with `withApiAuth(...)`.

- All routes except `POST /api/auth/setup`, `POST /api/auth/login`, and `POST /api/auth/logout` require an authenticated session.
- `withApiAuth(...)` checks whether onboarding has completed before looking up the session.
- When auth fails, the route returns `401` and clears the session cookie.
- If onboarding has not completed, protected routes return onboarding-required errors instead of pretending the caller is merely logged out.

### CSRF Model

ArrMate relies on same-origin validation for state-changing cookie-authenticated requests.

- Mutating routes require an `Origin` header that exactly matches `request.nextUrl.origin`.
- `withApiAuth(...)` enables this automatically for non-`GET`/`HEAD`/`OPTIONS` requests.
- Public auth endpoints that mutate state (`/api/auth/setup`, `/api/auth/login`, `/api/auth/logout`) call `ensureSameOrigin(...)` directly.

This means new browser-facing mutating routes should not invent separate CSRF handling unless the auth model changes across the app.

## Logout And Password Changes

`POST /api/auth/logout` is public in the sense that it does not require a valid session first, but it still requires a same-origin request.

- If a session cookie is present, ArrMate revokes the matching session row.
- The response always clears the session cookie.

`POST /api/auth/account` changes the admin password after verifying the current password.

- The current session remains valid.
- All other sessions are revoked.
- This is the main session-revocation mechanism beyond logout and expiry.

## Secrets

Session hashing uses a 32-byte secret.

- Preferred override: `AUTH_SESSION_SECRET` as 64 hex characters.
- Default behavior: generate and persist `auth-session-secret.hex` beside the SQLite database.

This persisted-secret pattern matches the API-key encryption key behavior and allows a self-hosted install to survive restarts without forcing initial env setup.

## Developer Guidance

### When Adding Protected Pages

- Call `requirePageSession()` in the page entry point before rendering protected UI.
- Do not rely on client-side redirects alone for protection.
- Keep `/login` and `/onboarding` as the only public dashboard routes unless there is a deliberate product decision to add another one.

### When Adding API Routes

- Wrap protected handlers with `withApiAuth(...)`.
- Accept the injected authenticated session parameter even if the route does not currently use it; it documents that the route is protected.
- Do not duplicate cookie parsing or session lookup logic inside route handlers.
- For unusual safe methods that still need CSRF checks, pass `{ requireCsrf: true }` explicitly.

### When Changing Auth State

- Use `src/lib/services/auth-service.ts` for admin credential checks, session creation, session revocation, and password rotation.
- Use `src/lib/auth/session.ts` for cookie creation, clearing, and token hashing.
- Do not write directly to `auth_admin`, `auth_sessions`, or `auth_login_attempts` from route handlers.

### When Handling Credentials Or Tokens

- Never log passwords, API keys, or raw session tokens.
- Never persist raw session tokens; only persist the hashed token.
- Keep session cookies HTTP-only. Do not move session state into `localStorage`, client-visible cookies, or query parameters.

### When Extending The Model

Before adding multi-user support, roles, external auth, or long-lived API tokens, revisit these assumptions:

- The database schema currently allows exactly one administrator row.
- UI routing assumes a simple configured/unconfigured + authenticated/unauthenticated state machine.
- Session management is optimized for browser sessions, not personal access tokens or service accounts.
- The current CSRF strategy assumes same-origin browser requests with cookie auth.

Any such change should update this document plus:

- `docs/architecture.md`
- `docs/api-routes.md`
- `docs/database-schema.md`
- `docs/testing.md` if new auth test patterns are introduced
