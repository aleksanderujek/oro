# API Endpoint Implementation Plan: Restore Expense

## 1. Endpoint Overview

- Implement `POST /expenses/{id}/restore` to reinstate a user's soft-deleted expense when restored within a 7-day retention window.
- Route lives under `src/pages/api/expenses/[id]/restore.ts` with `prerender = false`, following existing Astro API conventions.
- Leverage Supabase from `locals.supabase` and response helpers in `src/lib/http` to keep error/success handling consistent.

## 2. Request Details

- HTTP Method: POST
- URL Structure: `/expenses/{id}/restore`
- Parameters:
  - Required: `id` (path, UUID string validated via `validateExpenseId`)
  - Optional: none; ignore query params
- Request Body: none accepted; if a payload is present, return `400 Bad Request` using `buildValidationErrorResponse`
- Data contracts: reuse `ExpenseIdSchema` for validation
- Preconditions: Supabase client available in `locals.supabase`; authenticated session in `locals.session`

## 3. Response Details

- Success: `200 OK` with `RestoreExpenseResponse` (`id`, `deleted: false`, `restoredAt`) using DB `updated_at` timestamp after restoration
- Error status/code pairs:
  - `400 Bad Request`: invalid `id` parameter or unexpected body payload
  - `401 Unauthorized`: missing session
  - `403 Forbidden`: authenticated but lacks entitlement (reserve for future business rules)
  - `404 Not Found`: expense missing or belongs to another user (mask unauthorized access)
  - `409 Conflict`: expense not soft-deleted or retention window (>7 days since `deleted_at`) expired
  - `500 Internal Server Error`: Supabase availability issues or unexpected failures
- Error payloads built with `buildErrorResponse` / `buildValidationErrorResponse` to maintain schema consistency and propagate `requestId`

## 4. Data Flow

- Astro handler extracts `requestId`, Supabase client, and session from `locals`
- Validate `id` via `validateExpenseId`; reject on failure before hitting Supabase
- Ensure no request body is processed; optionally confirm `request.headers.get("content-length")` is `0`
- Invoke `restoreExpense({ supabase, userId: session.user.id, expenseId, requestId })`
- Service steps:
  1. Fetch expense row (`id`, `deleted_at`, `updated_at`) filtering by `id`, `user_id`, `deleted = true`
  2. If row missing → throw `EXPENSE_NOT_FOUND`
  3. If `deleted_at` null → throw `EXPENSE_NOT_DELETED`
  4. Compare `deleted_at` to `Date.now() - RETENTION_WINDOW_MS` (7 days); if exceeded → throw `RETENTION_WINDOW_EXPIRED`
  5. Update row setting `deleted_at` to `null`; select `id`, `deleted`, `updated_at` post-update (Supabase still returns generated `deleted`)
  6. Map response to `RestoreExpenseResponse` using `updated_at` as `restoredAt`
- Handler maps domain errors to HTTP responses and returns JSON via `buildJsonResponse`

## 5. Security Considerations

- Enforce authentication (return 401 when `locals.session` missing) before leaking any resource details
- Filter Supabase queries by `user_id` to honor RLS and prevent cross-tenant access; treat missing rows as 404 to avoid enumeration
- Leave placeholder to integrate entitlement/plan checks (return 403) if the feature becomes restricted
- Reject non-empty bodies to avoid abuse vectors that attempt to smuggle conflicting state
- Include `requestId`, `expenseId`, and `userId` in error causes for audit trails and tracing

## 6. Error Handling

- Service throws `RestoreExpenseError` with structured codes; include original Supabase errors in `cause`
- Map error codes to HTTP statuses: `EXPENSE_NOT_FOUND` → 404; `EXPENSE_NOT_DELETED`/`RETENTION_WINDOW_EXPIRED` → 409; `EXPENSE_QUERY_FAILED`/`EXPENSE_UPDATE_FAILED` → 500
- Convert Zod validation issues via `buildValidationErrorResponse`
- Bubble unexpected errors through a default 500 with `UNKNOWN_ERROR` code while retaining cause metadata

## 7. Performance Considerations

- Single-row lookups and updates keyed by `id`; leverage existing indexes on `id`/`user_id`
- Avoid duplicate round-trips by selecting only necessary columns in both fetch and update
- Define retention window constant (`const RETENTION_LIMIT_MS = 7 * 24 * 60 * 60 * 1000`) to keep computation cheap and readable
- Service remains idempotent: repeated requests after success should return 409 quickly without extra updates

## 8. Implementation Steps

1. Create `src/lib/services/expenses/restoreExpense.ts` defining the error enum/class, retention constant, fetch logic, retention check, update, and mapping to `RestoreExpenseResponse`.
2. Update `src/lib/services/expenses/index.ts` to export the new `restoreExpense` function.
3. Add `src/pages/api/expenses/[id]/restore.ts` with `prerender = false`; wire up Supabase/session checks, `validateExpenseId`, optional payload rejection, service invocation, and response mapping.
4. Use `buildValidationErrorResponse` for invalid IDs or unexpected bodies; reuse `buildErrorResponse` for service errors, ensuring `requestId` propagation.
5. Extend existing test harness (if present) or add an `.http` collection/manual cURL examples documenting success, 401, 404, 409 cases for QA reference.
6. Run lint/tests to confirm code quality before merge; document feature in change log if required.
