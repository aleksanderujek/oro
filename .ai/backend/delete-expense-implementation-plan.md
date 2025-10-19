# API Endpoint Implementation Plan: Delete Expense

## 1. Endpoint Overview
- Implement `DELETE /expenses/{id}` to soft-delete an authenticated user's expense by storing the current timestamp in `deleted_at` and returning undo metadata.
- Preserve existing expense data while marking it unavailable for regular queries; leverage the generated `deleted` column for downstream filtering.
- Integrate with Astro API routes, Supabase client from `locals`, and shared response helpers to match existing patterns.

## 2. Request Details
- HTTP Method: DELETE
- URL Structure: `/expenses/{id}`
- Parameters:
  - Required: `id` (path parameter, UUID string)
  - Optional: none
- Request Body: none (reject or ignore any provided body for safety)
- Validation:
  - Reuse `validateExpenseId` to enforce UUID format and guard against injection.
  - Ensure Supabase client and authenticated session exist before processing.

## 3. Response Details
- Success Status: `200 OK`
- Success Payload (`DeleteExpenseResponse` from `src/types.ts`):
  - `id`: expense UUID
  - `deleted`: boolean true
  - `deletedAt`: ISO timestamp sourced from the database after update
- Error Status Codes:
  - `400 Bad Request` when `id` fails validation
  - `401 Unauthorized` when session is missing
  - `404 Not Found` when expense doesn't exist, belongs to another user, or is already deleted
  - `500 Internal Server Error` for Supabase failures or unexpected conditions
- Error payloads constructed with `buildErrorResponse`/`buildValidationErrorResponse`, mirroring existing error shapes.

## 4. Data Flow
- Astro route receives DELETE request, fetches `requestId` for observability.
- Validate path param using `validateExpenseId`; return 400 on failure.
- Authenticate via `locals.session`; return 401 when absent.
- Invoke new service `softDeleteExpense({ supabase, userId, expenseId, requestId })` exported from `src/lib/services/expenses`.
- Service flow:
  1. Query `expenses` for matching `id`, `user_id`, and `deleted = false` to enforce ownership and ensure not already deleted.
  2. On missing row, throw typed error (`DeleteExpenseError` with `EXPENSE_NOT_FOUND`).
  3. Issue update setting `deleted_at` to `new Date().toISOString()` (let Supabase return server timestamp via `updated_at` if preferred) and selecting `id`, `deleted_at` in the response.
  4. Map resulting row to `DeleteExpenseResponse` (set `deleted` to `true`, `deletedAt` from row).
  5. On Supabase errors, wrap in `DeleteExpenseError` with codes like `EXPENSE_DELETE_FAILED`.
- Route catches typed errors, maps to status codes, uses `buildJsonResponse` for success.

## 5. Security Considerations
- Require authenticated session (`locals.session`) before touching Supabase.
- Filter Supabase queries by `user_id` and `deleted = false` to prevent cross-user access and redundant deletes despite RLS.
- Return `404 Not Found` for missing or unauthorized expenses to avoid leaking existence.
- Ensure `deleted_at` timestamps come from trusted server logic to prevent tampering.
- Do not accept or honor request bodies, preventing malicious overrides (ignore payload or return 400 if body present).
- Maintain request-scoped `requestId` metadata in error causes for auditability.

## 6. Error Handling
- Define `DeleteExpenseError` with codes such as `SUPABASE_NOT_AVAILABLE`, `UNAUTHORIZED_ACCESS`, `EXPENSE_NOT_FOUND`, `EXPENSE_QUERY_FAILED`, `EXPENSE_DELETE_FAILED`.
- Map error codes in route:
  - `SUPABASE_NOT_AVAILABLE` → 500
  - `UNAUTHORIZED_ACCESS` or missing session → 401
  - `EXPENSE_NOT_FOUND` → 404
  - `EXPENSE_QUERY_FAILED` / `EXPENSE_DELETE_FAILED` → 500
- Use `buildValidationErrorResponse` for validation failures.
- Attach `cause` metadata (Supabase error, ids, requestId) when throwing service errors to aid centralized logging/monitoring.
- Consider logging unexpected exceptions (if global logger exists) before returning generic 500.

## 7. Performance Considerations
- Single-row queries and updates; rely on existing indexes on `id` and `user_id` for efficient lookups.
- Keep service idempotent—subsequent deletes short-circuit after fetch to avoid redundant updates.
- Avoid unnecessary round-trips by selecting only required columns after update.
- Ensure Supabase update uses `select()` with `.single()` to minimize client-side processing while getting the timestamp.

## 8. Implementation Steps
1. Create `src/lib/services/expenses/deleteExpense.ts` defining `DeleteExpenseError`, params interface, and `softDeleteExpense` function implementing the flow above.
2. Update `src/lib/services/expenses/index.ts` to export the new service for API routes.
3. Extend `src/lib/validators/expenses.ts` (if needed) to expose any helper for DELETE (likely reuse `validateExpenseId`).
4. Modify `src/pages/api/expenses/[id].ts` to add a `DELETE` handler:
   - Acquire `requestId`, session, Supabase client, validate ID.
   - Call `softDeleteExpense` and map typed errors to HTTP responses.
   - Return `buildJsonResponse` with `DeleteExpenseResponse` on success.
5. Document the endpoint in API docs (e.g., update `.http` collections) and ensure undo window behavior is communicated to client teams.
6. Run lint/test commands to ensure code quality and no regressions.

