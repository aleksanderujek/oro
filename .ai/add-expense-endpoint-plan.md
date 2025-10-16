# API Endpoint Implementation Plan: POST /expenses

## 1. Endpoint Overview

- Provide a unified POST endpoint at `/expenses` for both quick-add and detailed expense creation flows.
- Normalize merchant-facing text, enforce business rules (amount, character limits, category requirements), and persist to Supabase `public.expenses` scoped to the authenticated user.
- Apply server-side defaults: fall back to the user profile’s `last_account` when `account` is omitted, and allow explicit use of the seeded `Uncategorized` category.
- Ensure the response returns the persisted `ExpenseDTO` representation without AI telemetry, adhering to a `201 Created` status on success.

## 2. Request Details

- **HTTP Method**: POST
- **URL**: `/expenses`
- **Headers**: `Content-Type: application/json`; Supabase auth cookie (handled by middleware); optional `X-Request-Id` for duplicate detection logging.
- **Required body fields** (`CreateExpenseCommand`):
  - `amount`: number; positive monetary value (with 2 decimal places)
  - `name`: string ≤64 chars after whitespace squeeze.
  - `occurredAt`: ISO string in UTC (`...Z`).
  - `categoryId`: UUID referencing `public.categories` (allow explicit uncategorized UUID).
- **Optional body fields**:
  - `description`: string ≤200 chars after squeeze; nullable.
  - `account`: enum `cash | card`; defaults to profile `last_account`; if default applied, persist update.
- **Validation approach**: Zod schema in the route file (or dedicated validator module) handles type/format checks, whitespace normalization.

## 3. Used Types

- `CreateExpenseCommand` (`src/types.ts`): request payload contract mirrored by the incoming body; reuse via `z.infer`.
- `ExpenseDTO` (`src/types.ts`): response structure returned post-insert.
- `ProfileDTO` and `UpdateProfileCommand` (`src/types.ts`): used when reading/updating `profiles.last_account`.
- `CategoriesResponse` / `CategoryDTO` (`src/types.ts`): referenced when validating `categoryId` against allowed values.
- New `CreateExpenseSchema` (Zod) inferred type: ensures runtime validation alignment with `CreateExpenseCommand`.

## 4. Response Details

- **Success (201 Created)**: Return a JSON payload shaped as `ExpenseDTO` containing all persisted fields, including `id`, `deleted` (always false on create), `createdAt`, and `updatedAt`.
- **Headers**: `Content-Type: application/json`; optionally echo `X-Request-Id` when provided.
- **No Content cases**: None (always respond with created resource on success).

## 5. Data Flow

- Handler location: implement in `src/pages/api/expenses.ts` using Astro API route conventions (`export const POST`).
- Retrieve Supabase client via `locals.supabase` per backend rule set; ensure an authenticated user is present (RLS enforces user scoping).
- Parse and validate the request body with Zod; on success, normalize `name`/`description` via shared `squeezeWhitespace` helper (extend `src/lib/utils.ts` if needed)
- Determine `account`: if absent, read the caller’s profile (`profiles` table) to fetch `last_account`; if profile missing, return 403. If default applied and differs, queue an update to profile (`profiles.last_account`).
- Validate `categoryId`: ensure supplied UUID matches an existing row in `public.categories`; allow explicit `uncategorized` constant.
- Insert into `public.expenses` using Supabase RPC or direct `insert`, passing `amount`, normalized text, timestamps, `account`, `category_id`, and letting DB triggers derive `merchant_key` and `search_text`.
- Update `profiles.last_account` post-insert when the account default was used and differs from stored value; perform within the same request (serial, not transactional, due to Supabase limitations—failures should be logged but not roll back the expense).
- Serialize the inserted row (via `select` and `single()` on insert) into an `ExpenseDTO` response and return 201.

## 6. Security Considerations

- Enforce authentication: reject requests lacking a valid Supabase session with `401 Unauthorized` before parsing body.
- Authorization relies on Supabase row-level security; ensure no direct `user_id` injection—allow DB to populate from auth context.
- Sanitize and constrain inputs server-side even though DB triggers provide secondary enforcement, preventing injection or overflows.
- Guard against duplicate submissions that could be replay attacks by leveraging request IDs and recent-expense checks.
- Log suspicious activity (e.g., repeated invalid attempts, failed duplicate checks) with structured logger to aid monitoring.

## 7. Error Handling

- **400 Bad Request**: Zod validation failures, malformed JSON, amounts ≤0 after normalization, non-existent category.
- **401 Unauthorized**: Missing/invalid Supabase session.
- **403 Forbidden**: Authenticated user without profile record or lacking rights to mutate profile (should not happen but guard).
- **409 Conflict**: Duplicate expense detected based on hash/window or conflicting concurrent insert detected by DB constraints.
- **500 Internal Server Error**: Unexpected Supabase errors (insert failure, profile update failure); log `error` level with request ID/context.
- In all error responses, include machine-readable `code` and human-friendly `message`; avoid leaking internal details.

## 8. Performance Considerations

- Minimize round trips: batch profile fetch with categories check when possible (parallel Supabase queries using `Promise.all`).
- Rely on DB-generated columns to avoid costly string processing in application code; only perform lightweight normalization client-side.
- Ensure indexes exist on `occured_at`, `merchant_key`, and `user_id` (already implied by schema) to keep duplicate detection fast; consider time-bounded filtering.
- Avoid returning large payloads—respond only with the single created expense.
- Monitor Supabase latency; instrument timings via optional tracing wrapper for future optimization.

## 9. Implementation Steps

1. Define helpers in `src/lib/utils.ts`: `squeezeWhitespace`.
2. Create `CreateExpenseSchema` (Zod) in `src/lib/validators/expenses.ts` or inline with clear reuse potential; export inferred TypeScript type.
3. Implement service `src/lib/services/expenses/createExpense.ts` that accepts `{ input, supabase, userId, requestId? }`, orchestrates profile lookup, defaults, duplicate detection, insert, and profile update; return `ExpenseDTO`.
4. In `src/pages/api/expenses.ts`, wire the POST handler: authenticate user via `locals.session`, parse body, call service, and map service errors to HTTP responses.
5. Add logging via shared logger (or `console.error`) capturing request ID, user ID, and error details for non-4xx cases.
6. Update documentation/readme if necessary to document new endpoint behavior and duplicate-detection expectations.
