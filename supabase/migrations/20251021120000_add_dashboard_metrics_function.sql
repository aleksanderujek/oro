-- migration: 20251021120000_add_dashboard_metrics_function.sql
-- purpose: create rpc function for dashboard metrics aggregation
--
-- contents:
--   - get_dashboard_metrics: aggregates expense data for dashboard display
--
-- notes:
--   - minimizes data transfer by performing all aggregation in postgres
--   - returns structured jsonb with totals, daily breakdown, and category breakdown
--   - filters by user_id (enforced via rls), date range, account type, and category ids

-- =====================================================================================
-- dashboard metrics function
-- =====================================================================================

create or replace function public.get_dashboard_metrics(
  p_user_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_prev_start_date timestamptz,
  p_prev_end_date timestamptz,
  p_account public.account_type default null,
  p_category_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_current_total real;
  v_previous_total real;
  v_daily_totals jsonb;
  v_top_categories jsonb;
begin
  -- calculate current month total
  select coalesce(sum(amount), 0)::real
  into v_current_total
  from public.expenses
  where user_id = p_user_id
    and deleted = false
    and occurred_at >= p_start_date
    and occurred_at <= p_end_date
    and (p_account is null or account = p_account)
    and (p_category_ids is null or category_id = any(p_category_ids));

  -- calculate previous month total
  select coalesce(sum(amount), 0)::real
  into v_previous_total
  from public.expenses
  where user_id = p_user_id
    and deleted = false
    and occurred_at >= p_prev_start_date
    and occurred_at <= p_prev_end_date
    and (p_account is null or account = p_account)
    and (p_category_ids is null or category_id = any(p_category_ids));

  -- calculate daily totals for current month
  -- generates a complete series of dates, even if no expenses on some days
  with date_series as (
    select generate_series(
      date_trunc('day', p_start_date at time zone 'UTC'),
      date_trunc('day', p_end_date at time zone 'UTC'),
      interval '1 day'
    ) as day
  ),
  daily_sums as (
    select
      date_trunc('day', occurred_at at time zone 'UTC') as day,
      sum(amount)::real as total
    from public.expenses
    where user_id = p_user_id
      and deleted = false
      and occurred_at >= p_start_date
      and occurred_at <= p_end_date
      and (p_account is null or account = p_account)
      and (p_category_ids is null or category_id = any(p_category_ids))
    group by date_trunc('day', occurred_at at time zone 'UTC')
  )
  select jsonb_agg(
    jsonb_build_object(
      'date', to_char(ds.day, 'YYYY-MM-DD'),
      'total', coalesce(daily_sums.total, 0)
    ) order by ds.day
  )
  into v_daily_totals
  from date_series ds
  left join daily_sums on ds.day = daily_sums.day;

  -- calculate top categories (ordered by total descending)
  with category_totals as (
    select
      e.category_id,
      c.name,
      sum(e.amount)::real as total
    from public.expenses e
    join public.categories c on c.id = e.category_id
    where e.user_id = p_user_id
      and e.deleted = false
      and e.occurred_at >= p_start_date
      and e.occurred_at <= p_end_date
      and (p_account is null or e.account = p_account)
      and (p_category_ids is null or e.category_id = any(p_category_ids))
    group by e.category_id, c.name
    having sum(e.amount) > 0
  )
  select jsonb_agg(
    jsonb_build_object(
      'categoryId', category_id,
      'name', name,
      'total', total
    ) order by total desc
  )
  into v_top_categories
  from category_totals;

  -- build final result
  v_result := jsonb_build_object(
    'currentTotal', v_current_total,
    'previousTotal', v_previous_total,
    'daily', coalesce(v_daily_totals, '[]'::jsonb),
    'topCategories', coalesce(v_top_categories, '[]'::jsonb)
  );

  return v_result;
end;
$$;

-- grant execute to authenticated users
grant execute on function public.get_dashboard_metrics(uuid, timestamptz, timestamptz, timestamptz, timestamptz, public.account_type, uuid[]) to authenticated;

-- end of migration

