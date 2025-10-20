-- migration: 20251020000000_add_merchant_mappings_pagination_index.sql
-- purpose: add composite index for efficient merchant_mappings pagination
--
-- contents:
--   - composite index on (user_id, merchant_key, id) for keyset pagination
--
-- notes:
--   - the trigram GIN index already exists from the initial migration
--   - this composite index supports filtering by user_id, ordering by merchant_key,
--     and keyset pagination using the (merchant_key, id) tuple

-- =====================================================================================
-- indexes
-- =====================================================================================

-- merchant_mappings: composite index for keyset pagination
-- supports: WHERE user_id = ? ORDER BY merchant_key ASC, id ASC
-- also supports cursor-based pagination: WHERE (merchant_key, id) > (?, ?)
create index if not exists merchant_mappings_user_merchant_id_idx
  on public.merchant_mappings (user_id, merchant_key, id);

-- end of migration

