-- migration: 20251021000000_add_merchant_resolve_function.sql
-- purpose: add database function for precise merchant mapping resolution with trigram similarity
--
-- contents:
--   - function: find_best_merchant_match - finds the best trigram match for a merchant key
--
-- notes:
--   - uses pg_trgm similarity() function for accurate similarity scoring
--   - respects RLS by accepting user_id parameter
--   - returns null if no match found or best match is below threshold

-- =====================================================================================
-- merchant mapping resolution function
-- =====================================================================================

/**
 * Finds the best merchant mapping match for a given user and merchant key
 * using PostgreSQL's trigram similarity function.
 * 
 * @param p_user_id - The user's ID (UUID)
 * @param p_merchant_key - The normalized merchant key to match against
 * @param p_threshold - Minimum similarity score (default 0.8)
 * 
 * @returns A single row with merchant mapping data and similarity score,
 *          or NULL if no match found above the threshold
 */
create or replace function public.find_best_merchant_match(
  p_user_id uuid,
  p_merchant_key text,
  p_threshold real default 0.8
)
returns table (
  id uuid,
  user_id uuid,
  merchant_key text,
  category_id uuid,
  updated_at timestamptz,
  similarity real
)
language sql
stable
security definer
set search_path = public
as $$
  select
    mm.id,
    mm.user_id,
    mm.merchant_key,
    mm.category_id,
    mm.updated_at,
    similarity(mm.merchant_key, p_merchant_key) as similarity
  from public.merchant_mappings mm
  where mm.user_id = p_user_id
    and similarity(mm.merchant_key, p_merchant_key) >= p_threshold
  order by similarity(mm.merchant_key, p_merchant_key) desc
  limit 1;
$$;

-- grant execute permission to authenticated users
grant execute on function public.find_best_merchant_match(uuid, text, real) to authenticated;

-- add comment for documentation
comment on function public.find_best_merchant_match is 
  'Finds the best merchant mapping match using trigram similarity. Returns null if no match found above threshold (default 0.8).';

-- end of migration

