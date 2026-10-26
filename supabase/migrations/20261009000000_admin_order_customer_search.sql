begin;

create or replace function public.admin_order_dashboard_filtered(
    p_status text default 'all',
    p_search text default null,
    p_table text default null,
    p_from_date date default null,
    p_to_date date default null,
    p_payment_status text default 'all',
    p_offset integer default 0,
    p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    requested_status text := coalesce(nullif(pg_catalog.btrim(p_status), ''), 'all');
    requested_search text := nullif(pg_catalog.btrim(p_search), '');
    requested_table text := nullif(pg_catalog.btrim(p_table), '');
    requested_payment text := coalesce(nullif(pg_catalog.btrim(p_payment_status), ''), 'all');
    bounded_offset integer := least(greatest(coalesce(p_offset, 0), 0), 100000);
    bounded_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
    summary_result jsonb;
    orders_result jsonb;
    result_total bigint;
begin
    if requested_status <> 'all' and requested_status not in ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'rejected', 'cancelled') then
        raise exception 'Invalid order status filter.' using errcode = '22023';
    end if;
    if requested_payment <> 'all' and requested_payment not in ('unpaid', 'paid', 'refunded') then
        raise exception 'Invalid payment status filter.' using errcode = '22023';
    end if;
    if (requested_search is not null and char_length(requested_search) > 80)
        or (requested_table is not null and char_length(requested_table) > 80)
        or (p_from_date is not null and p_to_date is not null and p_from_date > p_to_date) then
        raise exception 'Invalid order filters.' using errcode = '22023';
    end if;

    select dashboard -> 'summary'
    into summary_result
    from (select public.admin_order_dashboard('all', null, 0, 1) as dashboard) as base;

    select count(*)
    into result_total
    from public.orders as customer_order
    where (requested_status = 'all' or customer_order.status = requested_status)
      and (
          requested_search is null
          or pg_catalog.strpos(pg_catalog.lower(customer_order.order_number), pg_catalog.lower(requested_search)) > 0
          or pg_catalog.strpos(pg_catalog.lower(customer_order.id::text), pg_catalog.lower(requested_search)) > 0
          or exists (
              select 1
              from auth.users as search_user
              left join public.customer_profiles as search_profile on search_profile.id = search_user.id
              where search_user.id = customer_order.customer_id
                and (
                    pg_catalog.strpos(pg_catalog.lower(coalesce(search_profile.display_name, '')), pg_catalog.lower(requested_search)) > 0
                    or pg_catalog.strpos(pg_catalog.lower(coalesce(search_user.email, '')), pg_catalog.lower(requested_search)) > 0
                    or pg_catalog.strpos(pg_catalog.lower(coalesce(search_user.raw_user_meta_data ->> 'full_name', '')), pg_catalog.lower(requested_search)) > 0
                    or pg_catalog.strpos(pg_catalog.lower(coalesce(search_user.raw_user_meta_data ->> 'name', '')), pg_catalog.lower(requested_search)) > 0
                )
          )
      )
      and (requested_table is null or pg_catalog.strpos(pg_catalog.lower(customer_order.table_number_snapshot || ' ' || coalesce(customer_order.table_name_snapshot, '')), pg_catalog.lower(requested_table)) > 0)
      and (p_from_date is null or (customer_order.created_at at time zone coalesce((select settings.time_zone from public.restaurant_settings as settings where settings.id = 1), 'UTC')) >= p_from_date::timestamp)
      and (p_to_date is null or (customer_order.created_at at time zone coalesce((select settings.time_zone from public.restaurant_settings as settings where settings.id = 1), 'UTC')) < (p_to_date + 1)::timestamp)
      and (requested_payment = 'all' or customer_order.payment_status = requested_payment);

    select coalesce(pg_catalog.jsonb_agg(order_page.order_json order by order_page.created_at desc, order_page.id desc), '[]'::jsonb)
    into orders_result
    from (
        select
            customer_order.created_at,
            customer_order.id,
            pg_catalog.jsonb_build_object(
                'id', customer_order.id,
                'order_number', customer_order.order_number,
                'customer_id', customer_order.customer_id,
                'customer_name', coalesce(nullif(pg_catalog.btrim(profile.display_name), ''), nullif(pg_catalog.btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''), nullif(pg_catalog.btrim(auth_user.raw_user_meta_data ->> 'name'), ''), 'Customer'),
                'customer_email', auth_user.email,
                'table_number_snapshot', customer_order.table_number_snapshot,
                'table_name_snapshot', customer_order.table_name_snapshot,
                'status', customer_order.status,
                'subtotal', customer_order.subtotal,
                'discount_total', customer_order.discount_total,
                'total', customer_order.total,
                'currency', customer_order.currency,
                'payment_method', customer_order.payment_method,
                'payment_status', customer_order.payment_status,
                'customer_note', customer_order.customer_note,
                'rejection_reason', customer_order.rejection_reason,
                'estimated_preparation_minutes', customer_order.estimated_preparation_minutes,
                'preparation_started_at', customer_order.preparation_started_at,
                'estimated_ready_at', customer_order.estimated_ready_at,
                'created_at', customer_order.created_at,
                'updated_at', customer_order.updated_at,
                'items', coalesce((
                    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                        'id', order_item.id,
                        'item_name', order_item.item_name,
                        'unit_price', order_item.unit_price,
                        'quantity', order_item.quantity,
                        'line_total', order_item.line_total,
                        'special_instructions', order_item.special_instructions
                    ) order by order_item.created_at)
                    from public.order_items as order_item
                    where order_item.order_id = customer_order.id
                ), '[]'::jsonb)
            ) as order_json
        from public.orders as customer_order
        left join public.customer_profiles as profile on profile.id = customer_order.customer_id
        left join auth.users as auth_user on auth_user.id = customer_order.customer_id
        where (requested_status = 'all' or customer_order.status = requested_status)
          and (
              requested_search is null
              or pg_catalog.strpos(pg_catalog.lower(customer_order.order_number), pg_catalog.lower(requested_search)) > 0
              or pg_catalog.strpos(pg_catalog.lower(customer_order.id::text), pg_catalog.lower(requested_search)) > 0
              or pg_catalog.strpos(pg_catalog.lower(coalesce(profile.display_name, '')), pg_catalog.lower(requested_search)) > 0
              or pg_catalog.strpos(pg_catalog.lower(coalesce(auth_user.email, '')), pg_catalog.lower(requested_search)) > 0
              or pg_catalog.strpos(pg_catalog.lower(coalesce(auth_user.raw_user_meta_data ->> 'full_name', '')), pg_catalog.lower(requested_search)) > 0
              or pg_catalog.strpos(pg_catalog.lower(coalesce(auth_user.raw_user_meta_data ->> 'name', '')), pg_catalog.lower(requested_search)) > 0
          )
          and (requested_table is null or pg_catalog.strpos(pg_catalog.lower(customer_order.table_number_snapshot || ' ' || coalesce(customer_order.table_name_snapshot, '')), pg_catalog.lower(requested_table)) > 0)
          and (p_from_date is null or (customer_order.created_at at time zone coalesce((select settings.time_zone from public.restaurant_settings as settings where settings.id = 1), 'UTC')) >= p_from_date::timestamp)
          and (p_to_date is null or (customer_order.created_at at time zone coalesce((select settings.time_zone from public.restaurant_settings as settings where settings.id = 1), 'UTC')) < (p_to_date + 1)::timestamp)
          and (requested_payment = 'all' or customer_order.payment_status = requested_payment)
        order by customer_order.created_at desc, customer_order.id desc
        limit bounded_limit offset bounded_offset
    ) as order_page;

    return pg_catalog.jsonb_build_object(
        'summary', coalesce(summary_result, '{}'::jsonb),
        'total', result_total,
        'orders', orders_result
    );
end;
$$;

revoke all on function public.admin_order_dashboard_filtered(text, text, text, date, date, text, integer, integer)
    from public, anon, authenticated;
grant execute on function public.admin_order_dashboard_filtered(text, text, text, date, date, text, integer, integer)
    to service_role;

comment on function public.admin_order_dashboard_filtered(text, text, text, date, date, text, integer, integer) is
    'Returns bounded order results for validated admin filters. Callers must verify the configured admin UUID.';

commit;
