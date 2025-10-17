# API Endpoint Implementation Plan: GET /profiles/me

## 1. Endpoint Overview

- Serve an authenticated GET endpoint at `/profiles/me` to fetch the caller’s profile defaults (`timezone`, `lastAccount`) alongside lifecycle metadata (`createdAt`, `updatedAt`).
- Provide a consistent DTO response (`ProfileDTO`) for client consumption, leveraging Supabase’s RLS to scope data to the current user.
- Ensure graceful handling of missing profiles (treat as authorization failure) and unexpected backend issues.

## 2. Request Details

- HTTP Method: GET
- URL Structure: `/profiles/me`
- Parameters:
  - Required: none
  - Optional: none
- Headers: rely on Supabase session cookie established via Astro middleware; optionally echo `X-Request-Id` for observability if already in use.
- Request Body: none

## 3. Response Details

- Success (200): JSON body shaped as `ProfileDTO` (`id`, `timezone`, `lastAccount`, `createdAt`, `updatedAt`).
- Response Types:
  - Reuse `ProfileDTO` from `src/types.ts` as the contract; ensure mapper converts `last_account` → `lastAccount`.
  - Validate `lastAccount` remains within enum values (`cash` | `card`) or `null` per `AccountType`.
- Headers: `Content-Type: application/json`; optionally `X-Request-Id` passthrough.
- No pagination or cursor fields.

## 4. Data Flow

- Handler lives in `src/pages/api/profiles/me.ts` (new Astro API route) with `export const GET` and `export const prerender = false`.
- Retrieve Supabase client and session via `locals.supabase` / `locals.session`.
- Introduce `src/lib/services/profiles/getProfile.ts`:
  1. Accept `{ supabase, userId }` and optional `requestId` for logging.
  2. Query `profiles` table with `.select("id, timezone, last_account, created_at, updated_at").eq("id", userId).maybeSingle()`.
  3. Map result to `ProfileDTO` via helper `toProfileDTO`; ensure timestamps remain ISO strings.
  4. Throw typed `GetProfileError` codes for lookup failures or missing rows.
- Route translates service result to HTTP response and handles error-to-status mapping; echo `X-Request-Id` when provided.

## 5. Security Considerations

- Require authenticated Supabase session; return 401 otherwise.
- Depend on Supabase RLS (`id = auth.uid()`) by filtering on `userId` to ensure only the caller’s profile is fetched.
- Sanity-check `lastAccount` value before returning; treat unexpected values as server errors to avoid leaking invalid state.
- Ensure no additional profile metadata beyond `ProfileDTO` is exposed; respect existing middleware and CORS rules.

## 6. Error Handling

- `401 Unauthorized`: triggered when `locals.session` is absent.
- `403 Forbidden`: service raises `PROFILE_NOT_FOUND` when profile row missing (likely due to RLS mismatch or inconsistent data).
- `500 Internal Server Error`: Supabase client missing, query errors (`PROFILE_LOOKUP_FAILED`), invalid enum/timezone values, or other unhandled exceptions.
- Error responses contain machine-readable `code` and human-friendly `message`; log unexpected errors with structured `console.error` (or shared logger) including request ID and user ID (no dedicated error table currently).

## 7. Performance Considerations

- Single lightweight select query; minimal overhead.
- Use `.maybeSingle()` to avoid thrown exceptions on empty result, allowing graceful 403 handling.
- Avoid redundant transformations; rely on DB check constraint for timezone validity and enum type for `last_account`.
- No caching required; expected request volume is low; ensure handler remains fast by avoiding additional network calls.

## 8. Implementation Steps

1. Scaffold `src/lib/services/profiles/getProfile.ts` exporting `getProfile`, helper `toProfileDTO`, and `GetProfileError` (codes such as `PROFILE_LOOKUP_FAILED`, `PROFILE_NOT_FOUND`).
2. Implement Supabase select logic with proper error mapping, RLS-respecting filters, and enum validation prior to DTO conversion.
3. Add API route file `src/pages/api/profiles/me.ts` with `GET` handler: verify session, ensure Supabase client exists, call service, map results/errors to HTTP responses, echo `X-Request-Id` if provided.
4. Add defensive guard in the route or service to assert `lastAccount` is `cash` | `card` | `null` before responding; throw `GetProfileError` when encountering unexpected values.
5. Write unit/integration tests (if infrastructure exists) covering: success path, missing session (401), missing profile (403), Supabase error (500), unexpected enum handling.
6. Update API documentation or `.ai` references if required; ensure lint/tests pass.
