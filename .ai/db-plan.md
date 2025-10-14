## 1. List of tables with their columns, data types, and constraints

### public.profiles
- **id** — uuid, primary key, references `auth.users(id)` on delete cascade, not null
- **last_account** — `account_type` enum, null
- **timezone** — text, null (IANA TZ identifier, e.g., `Europe/Warsaw`)
- **created_at** — timestamptz, not null, default `now()`
- **updated_at** — timestamptz, not null, default `now()`

Constraints/notes:
- RLS restricted to the owner (see section 4)
- `updated_at` auto-managed via shared trigger
 - IANA timezone enforced via `CHECK (timezone IS NULL OR is_valid_iana_timezone(timezone))`

---

### public.categories
- **id** — uuid, primary key, not null (deterministic UUIDs for seeds)
- **key** — text, unique, not null (stable programmatic identifier)
- **name** — text, not null (display name)
- **sort_order** — integer, not null, default 0
- **created_at** — timestamptz, not null, default `now()`
- **updated_at** — timestamptz, not null, default `now()`

Constraints/notes:
- Client read-only; deletes disallowed (see section 4)
- Pre-seed `Uncategorized` with deterministic UUID and `key = 'uncategorized'`

---

### public.expenses
- **id** — uuid, primary key, not null, default `gen_random_uuid()`
- **user_id** — uuid, not null, references `auth.users(id)` on delete cascade (auto-set on insert; updates blocked)
- **amount** — real, not null, check `(amount > 0)`
- **name** — varchar(64), not null
- **description** — varchar(200), null
- **occurred_at** — timestamptz, not null (UTC; no DB default)
- **account** — `account_type` enum, null
- **category_id** — uuid, not null, references `public.categories(id)`, default `UNCATEGORIZED_UUID`
- **merchant_key** — varchar(128), generated always as `(left(normalize_merchant(name), 128))` stored, not null
- **search_text** — text, generated always as `(unaccent(lower(name || ' ' || coalesce(description, ''))))` stored
- **deleted_at** — timestamptz, null
- **deleted** — boolean, generated always as `(deleted_at IS NOT NULL)` stored, not null
- **created_at** — timestamptz, not null, default `now()`
- **updated_at** — timestamptz, not null, default `now()`

Constraints/notes:
- Trim/collapse whitespace on `name`/`description` via trigger
- `user_id` set to `auth.uid()` on insert and immutable thereafter

---

### public.merchant_mappings
- **id** — uuid, primary key, not null, default `gen_random_uuid()`
- **user_id** — uuid, not null, references `auth.users(id)` on delete cascade
- **merchant_key** — varchar(128), not null
- **category_id** — uuid, not null, references `public.categories(id)`
- **updated_at** — timestamptz, not null, default `now()`

Constraints/notes:
- Unique `(user_id, merchant_key)`
- Used for exact first, then trigram similarity lookups (≥ 0.8)

---

### public.ai_logs
- **id** — uuid, primary key, not null, default `gen_random_uuid()`
- **user_id** — uuid, not null, references `auth.users(id)` on delete cascade
- **expense_id** — uuid, null, references `public.expenses(id)`
- **query_text** — text, null
- **ai_category_id** — uuid, null, references `public.categories(id)`
- **confidence** — numeric(3,2), null, check `(confidence IS NULL OR (confidence >= 0 AND confidence <= 1))`
- **suggestions** — jsonb, null (top-3 suggestions payload)
- **provider** — text, null
- **model** — text, null
- **latency_ms** — integer, null
- **timed_out** — boolean, not null, default false
- **error_code** — text, null
- **created_at** — timestamptz, not null, default `now()`

Constraints/notes:
- Retained indefinitely for MVP

---

### Views
- **public.expenses_active** — `select * from public.expenses where deleted_at IS NULL`
- **public.expenses_deleted** — `select * from public.expenses where deleted_at IS NOT NULL`


## 2. Relationships between tables
- **auth.users (1) → public.profiles (1)**: `profiles.id` FK to `auth.users.id`; cascade on delete
- **auth.users (1) → public.expenses (many)**: `expenses.user_id` FK; cascade on delete
- **public.categories (1) → public.expenses (many)**: `expenses.category_id` FK
- **auth.users (1) → public.merchant_mappings (many)**: `merchant_mappings.user_id` FK; cascade on delete
- **public.categories (1) → public.merchant_mappings (many)**: `merchant_mappings.category_id` FK
- **auth.users (1) → public.ai_logs (many)**: `ai_logs.user_id` FK; cascade on delete
- **public.expenses (1) → public.ai_logs (many)**: optional `ai_logs.expense_id` FK

Cardinality summary:
- User 1—1 Profile
- User 1—N Expenses
- Category 1—N Expenses
- User 1—N Merchant mappings
- Category 1—N Merchant mappings
- User 1—N AI logs; Expense 1—N AI logs (optional)


## 3. Indexes
- public.expenses
  - Primary key on `(id)`
  - Partial composite btree for list and keyset pagination:
    - `(user_id, occurred_at DESC, amount DESC, id DESC) WHERE deleted_at IS NULL`
  - GIN trigram on `search_text` with `gin_trgm_ops`
  - (Deferred until needed) Additional partial indexes for frequent filters like `category_id` or `account`
  - (Deferred) `(user_id, deleted_at)` to accelerate recently deleted lookups
- public.merchant_mappings
  - Unique btree on `(user_id, merchant_key)`
  - GIN trigram on `(merchant_key)` for fuzzy lookups
- public.categories
  - Unique btree on `(key)`
  - btree on `(sort_order)` (optional for stable ordering)
- public.profiles
  - Primary key on `(id)`
- public.ai_logs
  - Primary key on `(id)`
  - (Optional) btree on `(user_id, created_at DESC)` for investigative queries


## 4. PostgreSQL policies (RLS)
Enable RLS on all tables below unless noted.

- public.profiles
  - SELECT: `using (id = auth.uid())`
  - INSERT: `with check (id = auth.uid())`
  - UPDATE: `using (id = auth.uid()) with check (id = auth.uid())`
  - DELETE: `using (id = auth.uid())`

- public.expenses
  - SELECT: `using (user_id = auth.uid())`
  - INSERT: `with check (user_id = auth.uid())`
  - UPDATE: `using (user_id = auth.uid()) with check (user_id = auth.uid())`
  - DELETE: `using (user_id = auth.uid())`

- public.merchant_mappings
  - SELECT: `using (user_id = auth.uid())`
  - INSERT: `with check (user_id = auth.uid())`
  - UPDATE: `using (user_id = auth.uid()) with check (user_id = auth.uid())`
  - DELETE: `using (user_id = auth.uid())`

- public.ai_logs
  - SELECT: `using (user_id = auth.uid())`
  - INSERT: `with check (user_id = auth.uid())`
  - (No UPDATE/DELETE policies for MVP)

- public.categories
  - Read-only to clients. Enable RLS with a SELECT-only policy:
    - SELECT: `using (true)` (scope to authenticated role in deployment)
  - No INSERT/UPDATE/DELETE policies (writes denied by absence of policies)

- Views `expenses_active` / `expenses_deleted`
  - Inherit RLS from `public.expenses`


## 5. Additional notes and design decisions
- Extensions to enable: `pgcrypto` (for `gen_random_uuid()`), `pg_trgm`, `unaccent`
- Enum type: `account_type AS ENUM ('cash', 'card')`
- Generated columns:
  - `expenses.merchant_key` from `normalize_merchant(name)`, stored
  - `expenses.search_text` from `unaccent(lower(name || ' ' || coalesce(description, '')))`, stored
  - `expenses.deleted` from `(deleted_at IS NOT NULL)`, stored
- Functions & triggers (shared across tables as applicable):
  - `is_valid_iana_timezone(text) RETURNS boolean` — STABLE; validates timezone against `pg_timezone_names` (`name = tz` and `name LIKE '%/%'`); used by `profiles.timezone` CHECK
  - `normalize_merchant(text) RETURNS text` — lowercases, `unaccent`, trims, removes separators/non-alphanumerics; marked `IMMUTABLE`
  - `set_updated_at()` — BEFORE UPDATE trigger to set `updated_at = now()`
  - `set_user_id_on_insert()` — BEFORE INSERT on `expenses` to set `user_id = auth.uid()` if null
  - `prevent_user_id_update()` — BEFORE UPDATE on `expenses` to prevent changing `user_id`
  - `squeeze_whitespace()` — BEFORE INSERT/UPDATE on `expenses` to trim and collapse spaces in `name`/`description`
  - `block_category_delete()` — BEFORE DELETE on `categories` to `RAISE EXCEPTION` (disallow deletes)
- Soft delete:
  - `expenses.deleted_at` marks soft-deleted; `deleted` reflects state
  - Scheduled purge (service role) hard-deletes rows where `deleted_at < now() - interval '7 days'`
- Seed data:
  - Pre-seed categories with deterministic UUIDs and stable `key` values
  - `Uncategorized` must exist; set `UNCATEGORIZED_UUID` as default for `expenses.category_id`
- Data integrity checks:
  - `char_length(name) <= 64`, `char_length(description) <= 200`
  - `amount > 0`
  - `profiles.timezone` is IANA TZ; validated via DB CHECK
- Pagination strategy:
  - Keyset pagination on `(occurred_at DESC, amount DESC, id DESC)` using the composite partial index
- Search:
  - Free-text search via `ILIKE`/trigram against `expenses.search_text`
  - Merchant mapping lookup: exact `(user_id, merchant_key)` first; fallback to trigram similarity ≥ 0.8 ordered by similarity (top 3)
- Timezone handling:
  - `profiles.timezone` stores IANA identifier (validated via DB CHECK) for UI/server bucketing; `occurred_at` stored as UTC `timestamptz`
