# REST API Plan

## 1. Resources

- `profiles` → `public.profiles`: Stores per-user settings such as `timezone` and `last_account` with owner-only access.
- `categories` → `public.categories`: Read-only taxonomy of spending categories shared by all users.
- `expenses` → `public.expenses`: Core ledger of user expenses, including soft-delete fields and generated columns for search.
- `merchantMappings` → `public.merchant_mappings`: Per-user overrides mapping normalized merchant names to categories.
- `aiLogs` → `public.ai_logs`: Audit log capturing AI categorization requests, responses, and telemetry.
- `dashboard` (virtual resource): Aggregated analytics derived from `expenses` and `AI` data for monthly insights.
- `auth` (Supabase-managed): Authentication flows for magic link and Google OAuth; surfaced via proxy endpoints if required.

## 2. Endpoints

### Profiles

- **HTTP Method**: GET
  - **URL Path**: `/profiles/me`
  - **Description**: Retrieve the authenticated user profile, including defaults used by the client.
  - **Query Parameters**: None
  - **Request Payload**: _None_
  - **Response Payload**:

```json
{
  "id": "uuid",
  "timezone": "Europe/Warsaw",
  "lastAccount": "card",
  "createdAt": "2025-01-10T10:00:00Z",
  "updatedAt": "2025-02-02T11:30:00Z"
}
```

- **Success Codes**: `200 OK`
- **Error Codes**: `401 Unauthorized`, `403 Forbidden` (RLS), `500 Internal Server Error`

- **HTTP Method**: PATCH
  - **URL Path**: `/profiles/me`
  - **Description**: Update editable profile fields such as timezone and last used account.
  - **Query Parameters**: None
  - **Request Payload**:

```json
{
  "timezone": "Europe/Warsaw",
  "lastAccount": "card"
}
```

- **Response Payload**: Same shape as GET response.
- **Success Codes**: `200 OK`
- **Error Codes**: `400 Bad Request` (invalid timezone, enum), `401 Unauthorized`, `403 Forbidden`, `409 Conflict` (concurrent update), `500 Internal Server Error`

### Categories

- **HTTP Method**: GET
  - **URL Path**: `/categories`
  - **Description**: List all categories in display order; cached aggressively because read-only.
  - **Query Parameters**:
    - `includeUncategorized` (boolean, default `true`)
  - **Request Payload**: _None_
  - **Response Payload**:

```json
{
  "items": [
    {
      "id": "uuid",
      "key": "groceries",
      "name": "Groceries",
      "sortOrder": 10
    }
  ]
}
```

- **Success Codes**: `200 OK`
- **Error Codes**: `401 Unauthorized` (if restricted), `500 Internal Server Error`

### Expenses

- **HTTP Method**: GET
  - **URL Path**: `/expenses`
  - **Description**: Keyset-paginated expense list with filters for time range, category, account, and search.
  - **Query Parameters**:
    - `timeRange` (enum: `this_month`, `last_7_days`, `last_month`)
    - `from` / `to` (ISO 8601 timestamps; overrides `timeRange` when both provided)
    - `categoryIds` (comma-separated UUID list)
    - `account` (enum: `cash`, `card`)
    - `search` (string; uses trigram search on `search_text`)
    - `includeDeleted` (boolean; default `false`)
    - `cursor` (string; encoded `(occurred_at, id)` tuple)
    - `limit` (int; 1-50, default 50)
  - **Request Payload**: _None_
  - **Response Payload**:

```json
{
  "items": [
    {
      "id": "uuid",
      "amount": 24.99,
      "name": "Coffee Shop",
      "description": "Latte and croissant",
      "occurredAt": "2025-02-15T08:30:00Z",
      "account": "card",
      "categoryId": "uuid",
      "deleted": false,
      "createdAt": "2025-02-15T08:30:05Z",
      "updatedAt": "2025-02-15T08:30:05Z"
    }
  ],
  "nextCursor": "2025-02-15T08:29:59Z|uuid",
  "hasMore": true
}
```

- **Success Codes**: `200 OK`
- **Error Codes**: `400 Bad Request` (invalid cursor/filter), `401 Unauthorized`, `403 Forbidden`, `500 Internal Server Error`

- **HTTP Method**: POST
  - **URL Path**: `/expenses`
  - **Description**: Create a new expense (Quick Add and full form share this endpoint). Server normalizes merchant name, applies defaults (e.g., account, uncategorized), and persists the record. Client is responsible for resolving merchant mappings and triggering AI categorization before calling this endpoint.
  - **Query Parameters**: None
  - **Request Payload**:

```json
{
  "amount": 24.99,
  "name": "Coffee Shop",
  "description": "Latte and croissant",
  "occurredAt": "2025-02-15T08:30:00Z",
  "categoryId": "uuid",
  "account": "card"
}
```

- **Response Payload**:

```json
{
  "id": "uuid",
  "amount": 24.99,
  "name": "Coffee Shop",
  "description": "Latte and croissant",
  "occurredAt": "2025-02-15T08:30:00Z",
  "account": "card",
  "categoryId": "uuid",
  "deleted": false,
  "createdAt": "2025-02-15T08:30:05Z",
  "updatedAt": "2025-02-15T08:30:05Z"
}
```

- **Success Codes**: `201 Created`
- **Error Codes**: `400 Bad Request` (validation failure), `401 Unauthorized`, `403 Forbidden`, `409 Conflict` (duplicate request detected), `500 Internal Server Error`

- **HTTP Method**: GET
  - **URL Path**: `/expenses/{id}`
  - **Description**: Fetch a single expense by ID.
  - **Query Parameters**: None
  - **Request Payload**: _None_
  - **Response Payload**: Same shape as POST response.
  - **Success Codes**: `200 OK`
  - **Error Codes**: `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `500 Internal Server Error`

- **HTTP Method**: PATCH
  - **URL Path**: `/expenses/{id}`
  - **Description**: Update editable fields; preserves soft-delete flag unless explicitly restored.
  - **Query Parameters**: None
  - **Request Payload**:

```json
{
  "amount": 29.99,
  "name": "Coffee Shop",
  "description": "Two lattes",
  "occurredAt": "2025-02-15T08:45:00Z",
  "categoryId": "uuid",
  "account": "card"
}
```

- **Response Payload**: Same shape as GET `/expenses/{id}`.
- **Success Codes**: `200 OK`
- **Error Codes**: `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict` (stale update), `500 Internal Server Error`

- **HTTP Method**: DELETE
  - **URL Path**: `/expenses/{id}`
  - **Description**: Soft-delete an expense; records `deleted_at` and exposes undo window.
  - **Query Parameters**: None
  - **Request Payload**: _None_
  - **Response Payload**:

```json
{
  "id": "uuid",
  "deleted": true,
  "deletedAt": "2025-02-15T09:00:00Z"
}
```

- **Success Codes**: `200 OK`
- **Error Codes**: `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict` (already deleted), `500 Internal Server Error`

- **HTTP Method**: POST
  - **URL Path**: `/expenses/{id}/restore`
  - **Description**: Restore a soft-deleted expense within the 7-day retention window.
  - **Query Parameters**: None
  - **Request Payload**: _None_
  - **Response Payload**:

```json
{
  "id": "uuid",
  "deleted": false,
  "restoredAt": "2025-02-16T09:00:00Z"
}
```

- **Success Codes**: `200 OK`
- **Error Codes**: `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict` (retention window expired), `500 Internal Server Error`

### Merchant Mappings

- **HTTP Method**: GET
  - **URL Path**: `/merchant-mappings`
  - **Description**: List user-specific merchant overrides; used for settings UI and diagnostics.
  - **Query Parameters**:
    - `search` (string; filters by normalized merchant key with trigram)
    - `cursor` / `limit` (optional keyset pagination using `(merchant_key, id)`)
  - **Request Payload**: _None_
  - **Response Payload**:

```json
{
  "items": [
    {
      "id": "uuid",
      "merchantKey": "coffeeshop",
      "categoryId": "uuid",
      "updatedAt": "2025-02-15T08:00:00Z"
    }
  ],
  "nextCursor": "coffeeshop|uuid",
  "hasMore": false
}
```

- **Success Codes**: `200 OK`
- **Error Codes**: `401 Unauthorized`, `403 Forbidden`, `500 Internal Server Error`

- **HTTP Method**: GET
  - **URL Path**: `/merchant-mappings/resolve`
  - **Description**: Resolve a merchant name to a mapped category if an exact or trigram (≥ 0.8) match exists.
  - **Query Parameters**:
    - `name` (string; required raw merchant label input)
  - **Request Payload**: _None_
  - **Response Payload**:

```json
{
  "match": {
    "categoryId": "uuid",
    "confidence": 1,
    "matchType": "exact",
    "merchantKey": "coffeeshop"
  }
}
```

- **Success Codes**: `200 OK` (with `match` or `null`)
- **Error Codes**: `400 Bad Request` (missing name), `401 Unauthorized`, `403 Forbidden`, `500 Internal Server Error`

- **HTTP Method**: POST
  - **URL Path**: `/merchant-mappings`
  - **Description**: Create or update a merchant mapping manually; server enforces uniqueness and normalization.
  - **Query Parameters**: None
  - **Request Payload**:

```json
{
  "merchantName": "Coffee Shop",
  "categoryId": "uuid"
}
```

- **Response Payload**:

```json
{
  "id": "uuid",
  "merchantKey": "coffeeshop",
  "categoryId": "uuid",
  "updatedAt": "2025-02-15T08:00:00Z"
}
```

- **Success Codes**: `201 Created`
- **Error Codes**: `400 Bad Request` (invalid category), `401 Unauthorized`, `403 Forbidden`, `409 Conflict` (unique constraint), `500 Internal Server Error`

- **HTTP Method**: PATCH
  - **URL Path**: `/merchant-mappings/{id}`
  - **Description**: Update mapped category; merchant key is immutable.
  - **Query Parameters**: None
  - **Request Payload**:

```json
{
  "categoryId": "uuid"
}
```

- **Response Payload**: Same as POST response.
- **Success Codes**: `200 OK`
- **Error Codes**: `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `500 Internal Server Error`

- **HTTP Method**: DELETE
  - **URL Path**: `/merchant-mappings/{id}`
  - **Description**: Remove a manual mapping; future categorization falls back to AI.
  - **Query Parameters**: None
  - **Request Payload**: _None_
  - **Response Payload**:

```json
{
  "id": "uuid",
  "deleted": true
}
```

- **Success Codes**: `200 OK`
- **Error Codes**: `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `500 Internal Server Error`

### AI Categorization

- **HTTP Method**: POST
  - **URL Path**: `/ai/categorize`
  - **Description**: Invoke AI categorization after the client confirms no merchant mapping exists; enforces 400 ms timeout and logs results in `ai_logs`.
  - **Query Parameters**: None
  - **Request Payload**:

```json
{
  "amount": 24.99,
  "name": "Coffee Shop",
  "description": "Latte and croissant",
  "occurredAt": "2025-02-15T08:30:00Z",
  "account": "card"
}
```

- **Response Payload**:

```json
{
  "autoAppliedCategoryId": "uuid", // present when confidence >= 0.75
  "confidence": 0.82,
  "suggestions": [
    { "categoryId": "uuid", "confidence": 0.82 },
    { "categoryId": "uuid", "confidence": 0.64 },
    { "categoryId": "uuid", "confidence": 0.55 }
  ],
  "timedOut": false,
  "latencyMs": 180,
  "provider": "openrouter:gpt-4o-mini"
}
```

- **Success Codes**: `200 OK`
- **Error Codes**: `400 Bad Request` (missing fields), `401 Unauthorized`, `403 Forbidden`, `408 Request Timeout` (client cancel), `429 Too Many Requests` (rate limit), `500 Internal Server Error`

### Dashboard

- **HTTP Method**: GET
  - **URL Path**: `/dashboard`
  - **Description**: Returns aggregated metrics for the current user’s selected month, including totals, daily bars, MoM delta, and category breakdown.
  - **Query Parameters**:
    - `month` (string `YYYY-MM`; defaults to current month in user timezone)
    - `account` (enum `cash`, `card`, `all`)
    - `categoryIds` (comma-separated UUID list to focus on subset)
  - **Request Payload**: _None_
  - **Response Payload**:

```json
{
  "month": "2025-02",
  "timezone": "Europe/Warsaw",
  "total": 1240.56,
  "monthOverMonth": {
    "absolute": 120.1,
    "percent": 10.7
  },
  "daily": [
    { "date": "2025-02-01", "total": 45.1 },
    { "date": "2025-02-02", "total": 0 }
  ],
  "topCategories": [{ "categoryId": "uuid", "name": "Groceries", "total": 320.5, "percentage": 25.8 }]
}
```

- **Success Codes**: `200 OK`
- **Error Codes**: `400 Bad Request` (invalid month/account), `401 Unauthorized`, `403 Forbidden`, `500 Internal Server Error`

### Authentication (Supabase Proxy)

- **HTTP Method**: POST
  - **URL Path**: `/auth/magic-link`
  - **Description**: Proxy to Supabase magic-link endpoint with additional rate limiting and audit logging.
  - **Query Parameters**: None
  - **Request Payload**:

```json
{
  "email": "user@example.com",
  "redirectUrl": "https://app.oro.dev/auth/callback"
}
```

- **Response Payload**:

```json
{
  "status": "sent"
}
```

- **Success Codes**: `200 OK`
- **Error Codes**: `400 Bad Request`, `401 Unauthorized` (service role missing), `429 Too Many Requests`, `500 Internal Server Error`

- **HTTP Method**: POST
  - **URL Path**: `/auth/sign-out`
  - **Description**: Invalidate current session (if Supabase client SDK unavailable), revoking refresh token.
  - **Query Parameters**: None
  - **Request Payload**: _None_
  - **Response Payload**:

```json
{
  "status": "signed_out"
}
```

- **Success Codes**: `200 OK`
- **Error Codes**: `401 Unauthorized`, `500 Internal Server Error`

## 3. Authentication and Authorization

- Supabase issues JWT access tokens for authenticated users (magic link and Google OAuth). The API expects `Authorization: Bearer <access_token>` and verifies tokens via Supabase Admin API or middleware.
- Row-Level Security (RLS) remains enabled on all tables; API service runs with authenticated user context (`supabase.auth.getUser`) to ensure users only access their own rows.
- Service-role endpoints (`/auth/magic-link`, `/ai/logs`) require a service key or internal network access; enforced via scoped API keys and IP allow lists.
- Rate limiting: apply sliding-window counters per IP/email for `/auth/magic-link`; per user and global quotas for `/ai/categorize` to control spend.
- All requests logged with correlation IDs for observability (supports AI latency tracking and undo activity).

## 4. Validation and Business Logic

- **Profiles**: Validate `timezone` using `is_valid_iana_timezone`; `lastAccount` must be `cash` or `card`. Updates refresh `updated_at` trigger automatically.
- **Categories**: Read-only; API prevents mutating calls. Ensure `includeUncategorized` defaults correctly.
- **Expenses**:
  - Enforce `amount > 0` (with two decimal places); reject negative or zero values.
  - `name` max 64 chars, `description` max 200 chars; server applies `squeeze_whitespace` normalization.
  - Require `occurredAt` (UTC); convert device time to UTC client-side.
  - `account` optional enum (`cash`, `card`); default to `profiles.last_account` when absent and update profile.
  - `categoryId` required unless client keeps Uncategorized; clients must resolve merchant mapping (via `/merchant-mappings/resolve`) or AI categorization prior to submission.
  - Soft delete sets `deleted_at`; restore clears it. Hard delete handled by scheduled purge after 7 days (service role, not exposed here).
  - Response does not include AI telemetry; client supplies chosen category or leaves Uncategorized and may emit analytics events referencing AI results.
  - Keyset pagination uses index `(user_id, occurred_at DESC, id DESC)`; cursors encode those fields.
- **Merchant Mappings**: Normalize `merchantName` via `normalize_merchant`, enforce uniqueness on `(user_id, merchant_key)`, disallow modifying `merchantKey` after creation. `/merchant-mappings/resolve` returns exact match at confidence 1 or best trigram match ≥ 0.8 with corresponding confidence score.
- **AI Categorization**: Client first calls `/merchant-mappings/resolve`; if no match returned, it may call `/ai/categorize`. Apply category automatically on client when confidence ≥ 0.75; otherwise show top 3 suggestions. Enforce 400 ms timeout server-side; log `timed_out=true` on fallback. Allow saving expense as Uncategorized when AI unavailable.
- **Dashboard**: Aggregate expenses filtered by month, account, and categories; exclude soft-deleted rows; compute daily totals and month-over-month delta handling division by zero. Timezone conversions use `profiles.timezone`.
- **Authentication**: Emails validated; magic link requests throttled. Sign-out revokes refresh tokens and clears local session.
- **AI Logs**: Validate `confidence` range 0-1, ensure `latencyMs` non-negative, and sanitize `queryText` (trim length). Access restricted to service role for analytics.
- **Analytics & Instrumentation**: API emits PostHog events or internal metrics on expense create/update/delete, AI categorize requests/responses, undo actions, and dashboard views. Include `expense_add_started` timestamp from client to compute time-to-save.
