begin;

create or replace function public.admin_dashboard_order_buckets()
returns table(bucket_label text, order_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
    with bounds as (
        select pg_catalog.date_trunc('day', pg_catalog.now() at time zone 'UTC') at time zone 'UTC' as day_start
    )
    select
        pg_catalog.to_char(bucket.slot at time zone 'UTC', 'HH12 AM') as bucket_label,
        pg_catalog.count(customer_order.id) as order_count
    from bounds
    cross join lateral pg_catalog.generate_series(
        bounds.day_start,
        bounds.day_start + interval '22 hours',
        interval '2 hours'
    ) as bucket(slot)
    left join public.orders as customer_order
        on customer_order.created_at >= bucket.slot
       and customer_order.created_at < bucket.slot + interval '2 hours'
       and customer_order.status not in ('rejected', 'cancelled')
    group by bucket.slot
    order by bucket.slot;
$$;

create or replace function public.admin_order_status_counts()
returns table(status text, order_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
    select customer_order.status, pg_catalog.count(*)
    from public.orders as customer_order
    group by customer_order.status;
$$;

revoke all on function public.admin_dashboard_order_buckets() from public, anon, authenticated;
grant execute on function public.admin_dashboard_order_buckets() to service_role;
revoke all on function public.admin_order_status_counts() from public, anon, authenticated;
grant execute on function public.admin_order_status_counts() to service_role;

comment on function public.admin_dashboard_order_buckets() is
    'Returns actual current UTC-day two-hour order buckets for the admin dashboard. Execution is restricted to service_role; callers must verify the configured admin UUID server-side.';
comment on function public.admin_order_status_counts() is
    'Returns actual order counts by status for admin filter tabs. Execution is restricted to service_role; callers must verify the configured admin UUID server-side.';

commit;