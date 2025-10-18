# API Endpoint Implementation Plan: PATCH /profiles/me

## 1. Endpoint Overview

- Updates the authenticated user’s profile `timezone` and/or `lastAccount`.
- Executes in Supabase with RLS ensuring only the owner’s row is affected.
- Returns the refreshed `ProfileDTO`, matching the existing `GET /profiles/me` response format.

## 2. Request Details

- HTTP Method: PATCH
- URL Structure: `/profiles/me`
- Parameters:
  - Required: none (user context resolved from `locals.session`)
  - Optional: none
- Request Body (JSON, at least one field required):
  - `timezone?: string` – trimmed IANA timezone identifier
  - `lastAccount?: "cash" | "card"` – enum constrained
- Validation:
  - Strict schema rejecting unknown keys.
  - `lastAccount` optional but, when present, must be either `cash` or `card`.
  - `timezone` optional but, when present, must pass IANA validation via util/Supabase RPC.
  - Payload must include at least one mutable field (`timezone`, `lastAccount`).

## 3. Response Details

- Success: `200 OK` with `ProfileDTO` `{ id, timezone, lastAccount, createdAt, updatedAt }`.
- Error Codes:
  - `400 Bad Request` – invalid schema, empty update, unsupported timezone/account enum.
  - `401 Unauthorized` – missing or invalid session.
  - `403 Forbidden` – session authenticated but profile row absent (RLS prevents access).
  - `500 Internal Server Error` – unexpected Supabase or infrastructure errors.
- Response headers include `X-Request-Id` when available.

## 4. Data Flow

- Astro route obtains `locals.supabase`, `locals.session`, `requestId`.
- Guard clauses: return `500` if Supabase unavailable, `401` if no session.
- Parse JSON body (handle empty body as `{}`) and run through `UpdateProfileSchema`.
- Invoke `updateProfile` service with `{ supabase, userId, command, requestId }`.
- Service workflow:
  - Validate `timezone` via reusable `isValidIanaTimezone` util (Intl list with RPC fallback and no caching).
  - Build `updatePayload` using provided fields only.
  - Construct Supabase update query on `profiles` filtering by `id` and optional `updated_at` match (converted to timestamptz).
  - On success, reuse shared mapper (`toProfileDTO`) to transform row.
  - Throw typed errors for lookup failures, invalid timezone/account, concurrency mismatches, or Supabase errors.
- Route maps service result to `buildJsonResponse` or maps error codes to HTTP responses via `buildErrorResponse`.

## 5. Security Considerations

- Authentication via Supabase session; reject anonymous calls.
- Leverage RLS; never accept `id` from input to avoid mass assignment.
- Zod schema `.strict()` prevents extraneous properties, mitigating over-posting.
- Validate enums explicitly to avoid invalid `account_type` states.
- Sanitize timezone input (trim, enforce IANA).
- Propagate `requestId` through logs/errors to support traceability.

## 6. Error Handling

- Map known validation failures to 400 with codes (`INVALID_TIMEZONE`, `INVALID_ACCOUNT_TYPE`, `EMPTY_UPDATE`).
- `Profile` missing after authenticated lookup → 403 (`PROFILE_NOT_FOUND`).
- Supabase client errors wrapped into `UpdateProfileError` with codes like `PROFILE_UPDATE_FAILED`, `TIMEZONE_VALIDATION_FAILED`; log `cause` including `requestId`.
- Unexpected exceptions return `500 UNKNOWN_ERROR` while preserving requestId for correlation.
- Utilize structured logging (console or existing telemetry) noting error code, userId, requestId.

## 7. Performance

- Single-row update; leverage primary key index on `profiles.id`.
- Avoid redundant RPC calls by only validating timezone when field supplied.
- Early validation fails fast before database interaction.
- Limit selected columns to those needed for response (`id`, `timezone`, `last_account`, `created_at`, `updated_at`).

## 8. Implementation Steps

1. Add `src/lib/utils/timezone.ts` providing `isValidIanaTimezone` using `Intl.supportedValuesOf('timeZone')` with Supabase RPC fallback.
2. Create `src/lib/validators/profiles.ts` with `UpdateProfileSchema`:
   - `.strict()`, `.partial()` on mutable fields, `.refine` to ensure at least one defined.
3. Extract shared `toProfileDTO` helper from `getProfile` into `src/lib/services/profiles/mappers.ts`; update existing service to use it.
4. Implement `src/lib/services/profiles/updateProfile.ts`:
   - Define `UpdateProfileErrorCode`/class.
   - Accept `UpdateProfileCommand`, optional concurrency token, requestId.
   - Validate timezone via util; validate account enum (reusing `AccountType`).
   - Execute Supabase update with conditional `eq('updated_at', expectedValue)` when provided, returning updated row.
   - Handle cases where `select` returns null (profile missing or stale) and throw typed errors.
5. Extend `src/pages/api/profiles/me.ts` with `PATCH` handler:
   - Guard Supabase & session.
   - Parse and validate request body via new validator (catch Zod errors → 400).
   - Call service, map success to 200 JSON, map known errors to proper status via `buildErrorResponse`.
6. Update developer documentation / `.http` playground file with new PATCH request.
7. Run linting (`npm lint`), type checks (`npm typecheck`), and ensure CI passes.
