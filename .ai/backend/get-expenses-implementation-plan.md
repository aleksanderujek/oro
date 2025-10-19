# API Endpoint Implementation Plan: GET /expenses

## 1. Endpoint Overview

- Serve the authenticated user with a keyset-paginated expense list filtered by optional date range, categories, account type, and free-text search.
- Support inclusion/exclusion of soft-deleted expenses and return pagination metadata (`nextCursor`, `hasMore`).
- Rely on Supabase RLS to scope results to the current user while respecting generated columns (search text, merchant key, deleted flag).

## 2. Request Details

- HTTP Method: GET
- URL Structure: `/expenses`
- Query Parameters
  - Required: none (auth header implicit via Supabase session).
  - Optional
    - `timeRange`: enum `this_month` | `last_7_days` | `last_month`.
    - `from`, `to`: ISO 8601 timestamps; both must be present to override `timeRange`; enforce `from <= to` and clamp to user timezone via profile if needed.
    - `categoryIds`: comma-separated UUIDs; parse into array, dedupe, enforce max length (e.g., 20) to guard query size.
    - `account`: enum `cash` | `card`.
    - `search`: trimmed string (max ~200 chars) used for trigram search on `search_text`.
    - `includeDeleted`: boolean (`false` by default) to toggle partial index usage vs full table scan.
    - `cursor`: encoded `(occurred_at,id)` pair (e.g., `ISO|uuid`); fail fast on invalid formats.
    - `limit`: integer, default 50, min 1, max 50.
- Request Body: none.
- Validation: wrap query params in Zod schema; produce friendly 400 messages on violations.

## 3. Response Details

- Success: `200 OK` with `ExpenseListResponse` ({ items: `ExpenseDTO[]`, nextCursor, hasMore }).
- Empty result: items `[]`, `nextCursor` null, `hasMore` false.
- Error codes: `400` invalid filters/cursor, `401` missing/invalid session, `403` authorization failures (if RLS denies query), `500` unexpected errors.
- Serialization: convert Supabase rows to camelCase DTO fields, ensure timestamps serialized as ISO strings.

## 4. Data Flow

- Astro API route retrieves `locals.supabase` and authenticated user id (via `locals.getUser()` or profile lookup).
- Parse and validate query params with Zod util; convert into normalized filter object (final `from`/`to`, array of UUIDs, boolean flags, cursor tuple, limit).
- Delegate to service `src/lib/services/expenses/getExpenses.ts` (new) that accepts `{ supabase, userId, filters }`.
  - Service builds base query on `public.expenses` filtered by `user_id` and soft-deleted flag depending on `includeDeleted`.
  - Apply date filter: `occurred_at` range from normalized `from`/`to` or derived from `timeRange` using profile timezone.
  - Apply category/account filters if provided.
  - Apply `search` using `ilike` or `textSearch` with trigram similarity threshold.
  - Implement keyset pagination: decode cursor to `(occurred_at,id)`; apply `<` comparisons (desc order) and limit `limit + 1` for `hasMore`.
- Fetch results, map to DTO, compute next cursor if more rows.
- Route responds with JSON `ExpenseListResponse`.

## 5. Security Considerations

- Authentication: require valid Supabase session; short-circuit with 401 when user not present.
- Authorization: rely on Supabase RLS (queries filtered by `user_id`) plus explicit `.eq("user_id", userId)` for clarity.
- Input sanitization: strict Zod schemas for enums, UUIDs, boolean parsing, cursor decoding to prevent injection.
- Ensure search term handling avoids wildcard abuse (trim length, reject empty after trim).
- Never expose internal cursor decoding errors beyond generic 400 response.

## 6. Error Handling

- Validation failures throw typed errors mapped to `400` with descriptive message payload (e.g., `{ error: "Invalid cursor" }`).
- Missing auth → `401` using shared auth guard utility.
- RLS denial or profile mismatch → `403` (log details without leaking identifiers).
- Unexpected Supabase errors or serialization issues → `500`.
- Ensure service rejects unknown `timeRange` even if new value added without handler.

## 7. Performance

- Rely on existing partial index `(user_id, occurred_at DESC, amount DESC, id DESC)` by ordering query accordingly and filtering on `deleted_at IS NULL` when `includeDeleted=false`.
- Keep limit ≤ 50; fetch `limit + 1` rows to determine `hasMore` without extra request.
- For search, use trigram functions with similarity threshold to limit work; fallback to `.ilike` if trigram extension unavailable.
- Avoid N+1 by selecting only required fields; no joins needed.
- Consider caching user timezone/profile in request locals to avoid repeated queries.

## 8. Implementation Steps

1. Add/confirm shared utilities: cursor codec (parse/encode), Zod validators for UUID array, enums, and ISO timestamps (create in `src/lib/validation/expenses.ts`).
2. Create service `src/lib/services/expenses/getExpenses.ts` handling filter normalization, Supabase query construction, and DTO mapping.
3. Implement cursor helpers supporting encode/decode and guard against tampering.
4. Implement Astro API route `src/pages/api/expenses/index.ts` (or existing file) calling validation + service, returning typed JSON with correct status codes.
5. Wire authentication guard (reuse middleware) to ensure session before invoking service; handle 401/403 consistently with other routes.
6. Create tests in ./api-testing/expenses.http
