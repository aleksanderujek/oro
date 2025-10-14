-- migration: 20251014175636_create_core_schema.sql
-- purpose: initial database schema for oro mvp
--
-- contents:
--   - enable required extensions
--   - define enum type account_type
--   - helper functions: is_valid_iana_timezone, normalize_merchant
--   - trigger functions: set_updated_at, set_user_id_on_insert, prevent_user_id_update,
--                        squeeze_whitespace, block_category_delete
--   - tables: profiles, categories, expenses, merchant_mappings, ai_logs
--   - generated columns and constraints
--   - row level security (rls) enablement and granular policies
--   - indexes for pagination and search
--   - views: expenses_active, expenses_deleted
--   - seed: insert uncategorized category and set default for expenses.category_id
--
-- notes:
--   - all sql is written in lowercase as per conventions
--   - destructive operations are avoided in this initial migration

-- =====================================================================================
-- extensions
-- =====================================================================================

-- cryptographic functions incl. gen_random_uuid
create extension if not exists "pgcrypto";

-- trigram indexing and similarity search
create extension if not exists pg_trgm;

-- accent-insensitive text normalization
create extension if not exists unaccent;

-- =====================================================================================
-- types
-- =====================================================================================

-- enum for account type on expenses/profiles
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'account_type' and n.nspname = 'public'
  ) then
    create type public.account_type as enum ('cash', 'card');
  end if;
end$$;

-- =====================================================================================
-- helper functions
-- =====================================================================================

-- validates that provided text is a valid iana timezone name
create or replace function public.is_valid_iana_timezone(tz text)
returns boolean
language sql
stable
as $$
  select tz is not null and exists (
    select 1
    from pg_timezone_names
    where name = tz
      and name like '%/%' -- iana tz names contain a region separator
  );
$$;

-- normalizes merchant names for consistent matching and keys
-- lowercases, removes diacritics, trims, collapses to alphanumerics, and removes separators
create or replace function public.normalize_merchant(input text)
returns text
language sql
immutable
as $$
  select case when input is null then null else
    regexp_replace(
      unaccent(lower(trim(input))),
      '[^a-z0-9]+',
      '',
      'g'
    )
  end;
$$;

-- =====================================================================================
-- trigger functions
-- =====================================================================================

-- updates updated_at to now() on each row update
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- sets user_id to auth.uid() on insert when not provided
create or replace function public.set_user_id_on_insert()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

-- prevents changing user_id after insert
create or replace function public.prevent_user_id_update()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'updating user_id is not allowed';
  end if;
  return new;
end;
$$;

-- trims and collapses whitespace in name/description fields
create or replace function public.squeeze_whitespace()
returns trigger
language plpgsql
as $$
begin
  if new.name is not null then
    new.name := regexp_replace(trim(new.name), '\s+', ' ', 'g');
  end if;
  if new.description is not null then
    new.description := regexp_replace(trim(new.description), '\s+', ' ', 'g');
  end if;
  return new;
end;
$$;

-- sets search_text for expenses using accent-insensitive lower-cased concatenation
create or replace function public.set_expenses_search_text()
returns trigger
language plpgsql
as $$
begin
  new.search_text := unaccent(lower(coalesce(new.name, '') || ' ' || coalesce(new.description, '')));
  return new;
end;
$$;

-- blocks delete operations on categories to maintain referential integrity
create or replace function public.block_category_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'deletes are not allowed on categories';
end;
$$;

-- =====================================================================================
-- constants (seed uuids)
-- =====================================================================================

-- deterministic uuid for the 'uncategorized' category
-- note: this value is referenced as the default for expenses.category_id
--       ensure the seeded row uses the same value.
-- you may change this to a different deterministic value if preferred.
-- using all-zero uuid for clarity.
create or replace function public.uncategorized_uuid()
returns uuid
language sql
immutable
as $$
  select '00000000-0000-0000-0000-000000000000'::uuid;
$$;

-- =====================================================================================
-- tables
-- =====================================================================================

-- categories: reference data, client read-only
create table if not exists public.categories (
  id uuid primary key not null,
  key text not null unique,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- audit/consistency triggers for categories
drop trigger if exists trg_categories_set_updated_at on public.categories;
create trigger trg_categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

drop trigger if exists trg_categories_block_delete on public.categories;
create trigger trg_categories_block_delete
before delete on public.categories
for each row execute function public.block_category_delete();

-- profiles: per-user profile row
create table if not exists public.profiles (
  id uuid primary key not null references auth.users(id) on delete cascade,
  last_account public.account_type null,
  timezone text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_timezone_valid check (
    timezone is null or public.is_valid_iana_timezone(timezone)
  )
);

drop trigger if exists trg_profiles_set_updated_at on public.profiles;
create trigger trg_profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- expenses: main fact table
create table if not exists public.expenses (
  id uuid primary key not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount real not null check (amount > 0),
  name varchar(64) not null,
  description varchar(200) null,
  occurred_at timestamptz not null,
  account public.account_type null,
  category_id uuid not null default public.uncategorized_uuid() references public.categories(id),
  merchant_key varchar(128) generated always as (
    left(public.normalize_merchant(name), 128)
  ) stored not null,
  search_text text null,
  deleted_at timestamptz null,
  deleted boolean generated always as (deleted_at is not null) stored not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_name_len check (char_length(name) <= 64),
  constraint expenses_desc_len check (description is null or char_length(description) <= 200)
);

-- triggers for expenses
drop trigger if exists trg_expenses_set_updated_at on public.expenses;
create trigger trg_expenses_set_updated_at
before update on public.expenses
for each row execute function public.set_updated_at();

drop trigger if exists trg_expenses_set_user_id on public.expenses;
create trigger trg_expenses_set_user_id
before insert on public.expenses
for each row execute function public.set_user_id_on_insert();

drop trigger if exists trg_expenses_prevent_user_id_update on public.expenses;
create trigger trg_expenses_prevent_user_id_update
before update on public.expenses
for each row execute function public.prevent_user_id_update();

drop trigger if exists trg_expenses_squeeze_whitespace on public.expenses;
create trigger trg_expenses_squeeze_whitespace
before insert or update on public.expenses
for each row execute function public.squeeze_whitespace();

drop trigger if exists trg_expenses_zz_set_search_text on public.expenses;
create trigger trg_expenses_zz_set_search_text
before insert or update on public.expenses
for each row execute function public.set_expenses_search_text();

-- merchant_mappings: per-user preferred category per merchant key
create table if not exists public.merchant_mappings (
  id uuid primary key not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_key varchar(128) not null,
  category_id uuid not null references public.categories(id),
  updated_at timestamptz not null default now(),
  constraint merchant_mappings_user_merchant_unique unique (user_id, merchant_key)
);

drop trigger if exists trg_merchant_mappings_set_updated_at on public.merchant_mappings;
create trigger trg_merchant_mappings_set_updated_at
before update on public.merchant_mappings
for each row execute function public.set_updated_at();

-- ai_logs: telemetry of ai categorization attempts
create table if not exists public.ai_logs (
  id uuid primary key not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expense_id uuid null references public.expenses(id),
  query_text text null,
  ai_category_id uuid null references public.categories(id),
  confidence numeric(3,2) null check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  ),
  suggestions jsonb null,
  provider text null,
  model text null,
  latency_ms integer null,
  timed_out boolean not null default false,
  error_code text null,
  created_at timestamptz not null default now()
);

-- =====================================================================================
-- row level security (rls)
-- =====================================================================================

-- enable rls on all tables
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.expenses enable row level security;
alter table public.merchant_mappings enable row level security;
alter table public.ai_logs enable row level security;

-- profiles policies (owner-only)
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists profiles_insert_authenticated on public.profiles;
create policy profiles_insert_authenticated on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update_authenticated on public.profiles;
create policy profiles_update_authenticated on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_delete_authenticated on public.profiles;
create policy profiles_delete_authenticated on public.profiles
  for delete to authenticated
  using (id = auth.uid());

-- categories policies (client read-only; scope to authenticated users)
drop policy if exists categories_select_authenticated on public.categories;
create policy categories_select_authenticated on public.categories
  for select to authenticated
  using (true);

-- expenses policies (per-user)
drop policy if exists expenses_select_authenticated on public.expenses;
create policy expenses_select_authenticated on public.expenses
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists expenses_insert_authenticated on public.expenses;
create policy expenses_insert_authenticated on public.expenses
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists expenses_update_authenticated on public.expenses;
create policy expenses_update_authenticated on public.expenses
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists expenses_delete_authenticated on public.expenses;
create policy expenses_delete_authenticated on public.expenses
  for delete to authenticated
  using (user_id = auth.uid());

-- merchant_mappings policies (per-user)
drop policy if exists merchant_mappings_select_authenticated on public.merchant_mappings;
create policy merchant_mappings_select_authenticated on public.merchant_mappings
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists merchant_mappings_insert_authenticated on public.merchant_mappings;
create policy merchant_mappings_insert_authenticated on public.merchant_mappings
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists merchant_mappings_update_authenticated on public.merchant_mappings;
create policy merchant_mappings_update_authenticated on public.merchant_mappings
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists merchant_mappings_delete_authenticated on public.merchant_mappings;
create policy merchant_mappings_delete_authenticated on public.merchant_mappings
  for delete to authenticated
  using (user_id = auth.uid());

-- ai_logs policies (per-user; no update/delete for mvp)
drop policy if exists ai_logs_select_authenticated on public.ai_logs;
create policy ai_logs_select_authenticated on public.ai_logs
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists ai_logs_insert_authenticated on public.ai_logs;
create policy ai_logs_insert_authenticated on public.ai_logs
  for insert to authenticated
  with check (user_id = auth.uid());

-- =====================================================================================
-- indexes
-- =====================================================================================

-- expenses: keyset pagination (partial) for active (not deleted) rows
create index if not exists expenses_user_occurred_amount_id_not_deleted_idx
  on public.expenses (user_id, occurred_at desc, amount desc, id desc)
  where deleted_at is null;

-- expenses: trigram search over prepared search_text
create index if not exists expenses_search_text_trgm_idx
  on public.expenses using gin (search_text gin_trgm_ops);

-- merchant_mappings: trigram for fuzzy merchant lookups
create index if not exists merchant_mappings_merchant_key_trgm_idx
  on public.merchant_mappings using gin (merchant_key gin_trgm_ops);

-- categories: stable ordering by sort_order
create index if not exists categories_sort_order_idx
  on public.categories (sort_order);

-- ai_logs: optional investigative query accelerator
create index if not exists ai_logs_user_created_idx
  on public.ai_logs (user_id, created_at desc);

-- =====================================================================================
-- views (inherit rls from base tables)
-- =====================================================================================

create or replace view public.expenses_active as
  select * from public.expenses where deleted_at is null;

create or replace view public.expenses_deleted as
  select * from public.expenses where deleted_at is not null;

-- =====================================================================================
-- seed data
-- =====================================================================================

-- ensure the uncategorized category exists with deterministic id/key
insert into public.categories (id, key, name, sort_order)
values (public.uncategorized_uuid(), 'uncategorized', 'Uncategorized', 0)
on conflict (id) do nothing;

-- also guard against a conflict on the key if a different id was used earlier
insert into public.categories (id, key, name, sort_order)
select public.uncategorized_uuid(), 'uncategorized', 'Uncategorized', 0
where not exists (select 1 from public.categories where key = 'uncategorized')
on conflict do nothing;

-- end of migration


