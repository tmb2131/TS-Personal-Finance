-- Returns distinct categories from budgets and transactions for the current user
create or replace function distinct_categories()
returns setof text
language sql
security definer
as $$
  select distinct category from (
    select category, user_id from budget_targets
    union all
    select category, user_id from transaction_log
  ) t
  where t.user_id = auth.uid()
  and t.category is not null
  order by category;
$$;

grant execute on function distinct_categories() to authenticated;
