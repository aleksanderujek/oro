# API Endpoint Implementation Plan: GET /categories

## 1. Endpoint Overview

Serve a read-only list of spending categories from Supabase, preserving the deterministic display order and optionally suppressing the seeded `uncategorized` category. The endpoint should be aggressively cached, while still honouring authentication and RLS.

## 2. Request Details

- HTTP Method: GET
- URL Structure: `/categories`
- Parameters:
  - Required: none
  - Optional: `includeUncategorized` (boolean query param; defaults to `true` when absent or malformed)
- Request Body: none (query parameters only)

## 3. Used Types

- `CategoryDTO` (`src/types.ts`) — shape of each returned category
- `CategoriesResponse` (`src/types.ts`) — overall response envelope

## 4. Response Details

- `200 OK`: `{ items: CategoryDTO[] }`
- `400 Bad Request`: invalid query parameter after validation
- `401 Unauthorized`: unauthenticated request when session required by policy
- `500 Internal Server Error`: unexpected failure fetching from Supabase or serialising response
- Headers: set `Cache-Control` with `public, max-age=300, stale-while-revalidate=86400` (tune values as needed) plus `Content-Type: application/json`

## 5. Data Flow

1. Astro API route receives the request at `/categories`.
2. Extract `includeUncategorized` from the query string and validate via Zod schema: permit `true`, `false`, `1`, `0`, `on`, `off`, etc., treating omissions or invalid values as `true`.
3. Read authenticated Supabase client (`const supabase = Astro.locals.supabase`) and ensure the session is present; return `401` with message if absent.
4. Call a new `listCategories` service in `src/lib/services/categories.ts` that encapsulates Supabase access:
   - Execute `supabase.from("categories").select("id,key,name,sort_order")` with `.order("sort_order", { ascending: true })` and a secondary order by `name` for tie-breaking.
   - If `includeUncategorized` is `false`, filter out the record with `key = 'uncategorized'` (client-side filtering after fetch keeps query simple and reuses cache).
5. Transform the rows into `CategoryDTO` objects (mapping snake_case to camelCase) and return a `CategoriesResponse`.
6. Set caching headers on the response and return JSON.

## 6. Security Considerations

- Authentication: rely on `Astro.locals` session (e.g., Supabase auth). Reject missing/expired sessions with `401` to respect private financial data.
- Authorization: RLS on `public.categories` already restricts access to authenticated users; no write access (read-only policy).
- Input validation: enforce strict boolean parsing via Zod to avoid accepting arbitrary values.
- Avoid exposing internal errors; return generic messages for `500` while logging full context server-side.

## 7. Error Handling

- Validation failure: respond `400` with `{ error: "Invalid query parameter" }`.
- Missing session: respond `401` with `{ error: "Unauthorized" }`.
- Supabase error: respond `500` with `{ error: "Unable to load categories" }`.
- JSON serialisation failure (unlikely): catch and log before returning `500`.
- All error responses should omit category data and avoid leaking Supabase error details.

## 8. Performance Considerations

- Leverage HTTP caching headers for CDN/client caching, given the read-only nature.
- Supabase query: rely on existing index on `sort_order`; request only required columns.

## 9. Implementation Steps

1. Define a Zod schema in the route file for `includeUncategorized` parsing and defaulting.
2. Create `src/lib/services/categories.ts` with `listCategories(supabase, options)` returning `{ items: CategoryDTO[] }` and handling filtering.
3. Implement `export const GET` in `src/pages/api/categories.ts` (or update existing file) to:
   - Acquire Supabase client from `Astro.locals` and check session.
   - Parse query params via schema; on failure, return `400`.
   - Invoke `listCategories` and handle returned data/errors.
   - Map database rows to DTOs using helper transformation.
   - Set caching headers and return JSON response.
4. Add API tests to categories.http file.
