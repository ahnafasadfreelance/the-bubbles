begin;

alter table public.orders
    add column rejection_reason text
        check (rejection_reason is null or char_length(rejection_reason) <= 300);

create index orders_admin_created_idx on public.orders (created_at desc, id desc);

create or replace function private.enforce_order_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.status is distinct from old.status and not (
        (old.status = 'pending' and new.status in ('confirmed', 'rejected', 'cancelled'))
        or (old.status = 'confirmed' and new.status = 'preparing')
        or (old.status = 'preparing' and new.status = 'ready')
        or (old.status = 'ready' and new.status = 'completed')
    ) then
        raise exception 'Invalid order status transition.' using errcode = '23514';
    end if;
    return new;
end;
$$;

comment on function private.enforce_order_status_transition() is
    'Permits pending to confirmed, rejected, or cancelled; confirmed to preparing; preparing to ready; and ready to completed.';

create or replace function public.admin_order_dashboard(
    p_status text default null,
    p_search text default null,
    p_offset integer default 0,
    p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    dashboard_result jsonb;
    requested_status text := nullif(pg_catalog.btrim(p_status), '');
    requested_search text := nullif(pg_catalog.btrim(p_search), '');
    bounded_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
    bounded_offset integer := least(greatest(coalesce(p_offset, 0), 0), 100000);
begin
    if requested_status = 'all' then
        requested_status := null;
    end if;
    if requested_status is not null and requested_status not in (
        'pending', 'confirmed', 'preparing', 'ready', 'completed', 'rejected', 'cancelled'
    ) then
        raise exception 'Invalid order status filter.' using errcode = '22023';
    end if;
    if requested_search is not null and char_length(requested_search) > 80 then
        raise exception 'Search text is too long.' using errcode = '22023';
    end if;

    select pg_catalog.jsonb_build_object(
        'summary', pg_catalog.jsonb_build_object(
            'pending', count(*) filter (where customer_order.status = 'pending'),
            'confirmed', count(*) filter (where customer_order.status = 'confirmed'),
            'preparing', count(*) filter (where customer_order.status = 'preparing'),
            'ready', count(*) filter (where customer_order.status = 'ready'),
            'completed', count(*) filter (where customer_order.status = 'completed'),
            'today_count', count(*) filter (
                where customer_order.created_at >= (
                    pg_catalog.date_trunc('day', pg_catalog.now() at time zone 'UTC') at time zone 'UTC'
                )
            ),
            'today_recorded_revenue_by_currency', coalesce((
                select pg_catalog.jsonb_object_agg(currency_totals.currency, currency_totals.amount)
                from (
                    select customer_order.currency, sum(customer_order.total) as amount
                    from public.orders as customer_order
                    where customer_order.created_at >= (
                        pg_catalog.date_trunc('day', pg_catalog.now() at time zone 'UTC') at time zone 'UTC'
                    )
                      and customer_order.status not in ('rejected', 'cancelled')
                    group by customer_order.currency
                ) as currency_totals
            ), '{}'::jsonb)
        )
    )
    into dashboard_result
    from public.orders as customer_order;

    return dashboard_result || pg_catalog.jsonb_build_object(
        'total', (
            select count(*)
            from public.orders as customer_order
            where (requested_status is null or customer_order.status = requested_status)
              and (requested_search is null or pg_catalog.strpos(
                    pg_catalog.lower(customer_order.order_number),
                    pg_catalog.lower(requested_search)
                ) > 0)
        ),
        'orders', coalesce((
            select pg_catalog.jsonb_agg(order_page.order_json order by order_page.created_at desc, order_page.id desc)
            from (
                select
                    customer_order.created_at,
                    customer_order.id,
                    pg_catalog.jsonb_build_object(
                        'id', customer_order.id,
                        'order_number', customer_order.order_number,
                        'customer_id', customer_order.customer_id,
                        'customer_name', coalesce(
                            nullif(pg_catalog.btrim(customer_profile.display_name), ''),
                            nullif(pg_catalog.btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
                            nullif(pg_catalog.btrim(auth_user.raw_user_meta_data ->> 'name'), ''),
                            'Customer'
                        ),
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
                        'created_at', customer_order.created_at,
                        'updated_at', customer_order.updated_at,
                        'items', coalesce((
                            select pg_catalog.jsonb_agg(
                                pg_catalog.jsonb_build_object(
                                    'id', order_item.id,
                                    'item_name', order_item.item_name,
                                    'unit_price', order_item.unit_price,
                                    'quantity', order_item.quantity,
                                    'line_total', order_item.line_total,
                                    'special_instructions', order_item.special_instructions
                                ) order by order_item.created_at asc
                            )
                            from public.order_items as order_item
                            where order_item.order_id = customer_order.id
                        ), '[]'::jsonb)
                    ) as order_json
                from public.orders as customer_order
                left join public.customer_profiles as customer_profile
                    on customer_profile.id = customer_order.customer_id
                left join auth.users as auth_user
                    on auth_user.id = customer_order.customer_id
                where (requested_status is null or customer_order.status = requested_status)
                  and (requested_search is null or pg_catalog.strpos(
                        pg_catalog.lower(customer_order.order_number),
                        pg_catalog.lower(requested_search)
                    ) > 0)
                order by customer_order.created_at desc, customer_order.id desc
                limit bounded_limit offset bounded_offset
            ) as order_page
        ), '[]'::jsonb)
    );
end;
$$;

create or replace function public.admin_transition_order(
    p_order_id uuid,
    p_expected_status text,
    p_next_status text,
    p_rejection_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    locked_order public.orders%rowtype;
begin
    if p_order_id is null or p_expected_status is null or p_next_status is null then
        raise exception 'Invalid order transition.' using errcode = '22023';
    end if;
    if p_rejection_reason is not null and char_length(p_rejection_reason) > 300 then
        raise exception 'Rejection reason is too long.' using errcode = '22023';
    end if;

    select customer_order.* into locked_order
    from public.orders as customer_order
    where customer_order.id = p_order_id
    for update;

    if not found then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found');
    end if;
    if locked_order.status <> p_expected_status then
        return pg_catalog.jsonb_build_object(
            'ok', false,
            'reason', 'stale',
            'current_status', locked_order.status,
            'order', pg_catalog.to_jsonb(locked_order)
        );
    end if;
    if not (
        (locked_order.status = 'pending' and p_next_status in ('confirmed', 'rejected'))
        or (locked_order.status = 'confirmed' and p_next_status = 'preparing')
        or (locked_order.status = 'preparing' and p_next_status = 'ready')
        or (locked_order.status = 'ready' and p_next_status = 'completed')
    ) then
        return pg_catalog.jsonb_build_object(
            'ok', false,
            'reason', 'invalid_transition',
            'current_status', locked_order.status,
            'order', pg_catalog.to_jsonb(locked_order)
        );
    end if;

    update public.orders as customer_order
    set status = p_next_status,
        rejection_reason = case
            when p_next_status = 'rejected' then nullif(pg_catalog.btrim(p_rejection_reason), '')
            else null
        end
    where customer_order.id = p_order_id
    returning customer_order.* into locked_order;

    return pg_catalog.jsonb_build_object(
        'ok', true,
        'order', pg_catalog.to_jsonb(locked_order)
    );
end;
$$;

create or replace function public.admin_set_preparation_estimate(
    p_order_id uuid,
    p_expected_status text,
    p_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    locked_order public.orders%rowtype;
begin
    if p_order_id is null or p_expected_status is null or p_minutes not between 5 and 240 then
        raise exception 'Preparation estimate must be between 5 and 240 minutes.' using errcode = '22023';
    end if;

    select customer_order.* into locked_order
    from public.orders as customer_order
    where customer_order.id = p_order_id
    for update;

    if not found then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found');
    end if;
    if locked_order.status <> p_expected_status then
        return pg_catalog.jsonb_build_object(
            'ok', false,
            'reason', 'stale',
            'current_status', locked_order.status,
            'order', pg_catalog.to_jsonb(locked_order)
        );
    end if;
    if locked_order.status not in ('confirmed', 'preparing') then
        return pg_catalog.jsonb_build_object(
            'ok', false,
            'reason', 'invalid_status',
            'current_status', locked_order.status,
            'order', pg_catalog.to_jsonb(locked_order)
        );
    end if;

    update public.orders as customer_order
    set estimated_preparation_minutes = p_minutes
    where customer_order.id = p_order_id
    returning customer_order.* into locked_order;

    return pg_catalog.jsonb_build_object(
        'ok', true,
        'order', pg_catalog.to_jsonb(locked_order)
    );
end;
$$;

revoke all on function public.admin_order_dashboard(text, text, integer, integer)
    from public, anon, authenticated;
revoke all on function public.admin_transition_order(uuid, text, text, text)
    from public, anon, authenticated;
revoke all on function public.admin_set_preparation_estimate(uuid, text, integer)
    from public, anon, authenticated;
grant execute on function public.admin_order_dashboard(text, text, integer, integer) to service_role;
grant execute on function public.admin_transition_order(uuid, text, text, text) to service_role;
grant execute on function public.admin_set_preparation_estimate(uuid, text, integer) to service_role;

comment on function public.admin_order_dashboard(text, text, integer, integer) is
    'Returns bounded restaurant operations data. Execution is restricted to the server service role; application code must verify the configured admin user ID before calling.';
comment on function public.admin_transition_order(uuid, text, text, text) is
    'Atomically locks and transitions an order after checking its expected status. Execution is restricted to the server service role.';
comment on function public.admin_set_preparation_estimate(uuid, text, integer) is
    'Atomically updates an estimate only for confirmed or preparing orders. Execution is restricted to the server service role.';

commit;