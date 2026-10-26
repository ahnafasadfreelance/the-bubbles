begin;

create table private.order_realtime_admins (
    user_id uuid primary key references auth.users(id) on delete cascade
);

alter table private.order_realtime_admins enable row level security;
revoke all on table private.order_realtime_admins from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;

create or replace function private.is_order_realtime_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from private.order_realtime_admins as realtime_admin
        where realtime_admin.user_id = (select auth.uid())
    );
$$;

revoke all on function private.is_order_realtime_admin() from public, anon;
grant execute on function private.is_order_realtime_admin() to authenticated;

create or replace function public.admin_order_realtime_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select private.is_order_realtime_admin();
$$;

revoke all on function public.admin_order_realtime_enabled() from public, anon;
grant execute on function public.admin_order_realtime_enabled() to authenticated;

comment on table private.order_realtime_admins is
    'Read-only Realtime audience. Keep this UUID list synchronized with the server-only ADMIN_USER_IDS configuration.';
comment on function public.admin_order_realtime_enabled() is
    'Returns whether the authenticated user is individually allowlisted for read-only admin order Realtime; it does not authorize admin operations.';

alter table public.orders
    add column preparation_started_at timestamptz,
    add column estimated_ready_at timestamptz;

comment on column public.orders.estimated_preparation_minutes is
    'Estimated minutes: before preparation this is the duration from preparation_started_at; when adjusted during preparation it is remaining minutes from that database update time. estimated_ready_at is authoritative.';
comment on column public.orders.preparation_started_at is
    'Database timestamp recorded atomically when staff transition the order to preparing.';
comment on column public.orders.estimated_ready_at is
    'Authoritative database timestamp estimate set at preparation start or reset from the database clock when staff adjust remaining minutes.';

alter table public.order_items
    add column preparation_time_minutes_snapshot integer
        check (preparation_time_minutes_snapshot is null or preparation_time_minutes_snapshot between 0 and 1440);

comment on column public.order_items.preparation_time_minutes_snapshot is
    'Menu preparation duration copied from the trusted menu row when the order item is created.';

update public.order_items as order_item
set preparation_time_minutes_snapshot = menu_item.preparation_time_minutes
from public.menu_items as menu_item
where menu_item.id = order_item.menu_item_id
  and order_item.preparation_time_minutes_snapshot is null;

create or replace function private.snapshot_order_item_preparation_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.menu_item_id is null then
        new.preparation_time_minutes_snapshot := null;
    else
        select menu_item.preparation_time_minutes
        into new.preparation_time_minutes_snapshot
        from public.menu_items as menu_item
        where menu_item.id = new.menu_item_id;
    end if;
    return new;
end;
$$;

revoke all on function private.snapshot_order_item_preparation_time() from public, anon, authenticated;

create trigger order_items_snapshot_preparation_time
before insert or update of menu_item_id on public.order_items
for each row execute function private.snapshot_order_item_preparation_time();

create or replace function private.order_preparation_estimate_minutes(
    p_order_id uuid,
    p_min_minutes integer,
    p_max_minutes integer
)
returns integer
language sql
stable
set search_path = ''
as $$
    select case
        when max(order_item.preparation_time_minutes_snapshot) filter (
            where order_item.preparation_time_minutes_snapshot > 0
        ) is null then null
        else greatest(p_min_minutes, least(
            max(order_item.preparation_time_minutes_snapshot) filter (
                where order_item.preparation_time_minutes_snapshot > 0
            ),
            p_max_minutes
        ))
    end
    from public.order_items as order_item
    where order_item.order_id = p_order_id;
$$;

revoke all on function private.order_preparation_estimate_minutes(uuid, integer, integer) from public, anon, authenticated;
comment on function private.order_preparation_estimate_minutes(uuid, integer, integer) is
    'Uses the longest positive dish preparation snapshot (parallel preparation, not a sum), bounded by the server-configured estimate range. Returns null when no dish has a reliable estimate.';

grant select (
    rejection_reason,
    preparation_started_at,
    estimated_ready_at
) on table public.orders to authenticated;

grant select on table public.orders to authenticated;

create policy "Configured admins can read orders for realtime"
    on public.orders
    for select
    to authenticated
    using (private.is_order_realtime_admin());

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
                        'preparation_started_at', customer_order.preparation_started_at,
                        'estimated_ready_at', customer_order.estimated_ready_at,
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

drop function public.admin_transition_order(uuid, text, text, text);

create function public.admin_transition_order(
    p_order_id uuid,
    p_expected_status text,
    p_next_status text,
    p_rejection_reason text,
    p_min_minutes integer,
    p_max_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    locked_order public.orders%rowtype;
    automatic_estimate integer;
    timer_started_at timestamptz;
begin
    if p_order_id is null
        or p_expected_status is null
        or p_next_status is null
        or p_min_minutes is null
        or p_max_minutes is null
        or p_min_minutes not between 1 and 1440
        or p_max_minutes <= p_min_minutes
        or p_max_minutes > 1440 then
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

    automatic_estimate := private.order_preparation_estimate_minutes(p_order_id, p_min_minutes, p_max_minutes);
    if p_next_status = 'preparing' then
        timer_started_at := pg_catalog.clock_timestamp();
    end if;
    update public.orders as customer_order
    set status = p_next_status,
        rejection_reason = case
            when p_next_status = 'rejected' then nullif(pg_catalog.btrim(p_rejection_reason), '')
            else null
        end,
        estimated_preparation_minutes = case
            when p_next_status = 'preparing' then coalesce(locked_order.estimated_preparation_minutes, automatic_estimate)
            else locked_order.estimated_preparation_minutes
        end,
        preparation_started_at = case
            when p_next_status = 'preparing' then timer_started_at
            else locked_order.preparation_started_at
        end,
        estimated_ready_at = case
            when p_next_status = 'preparing'
                and coalesce(locked_order.estimated_preparation_minutes, automatic_estimate) is not null
            then timer_started_at + make_interval(
                mins => coalesce(locked_order.estimated_preparation_minutes, automatic_estimate)
            )
            when p_next_status in ('rejected', 'cancelled') then null
            else locked_order.estimated_ready_at
        end
    where customer_order.id = p_order_id
    returning customer_order.* into locked_order;

    return pg_catalog.jsonb_build_object(
        'ok', true,
        'order', pg_catalog.to_jsonb(locked_order)
    );
end;
$$;

drop function public.admin_set_preparation_estimate(uuid, text, integer);

create function public.admin_set_preparation_estimate(
    p_order_id uuid,
    p_expected_status text,
    p_minutes integer,
    p_min_minutes integer,
    p_max_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    locked_order public.orders%rowtype;
    timer_updated_at timestamptz;
begin
    if p_order_id is null
        or p_expected_status is null
        or p_minutes is null
        or p_min_minutes is null
        or p_max_minutes is null
        or p_min_minutes not between 1 and 1440
        or p_max_minutes <= p_min_minutes
        or p_max_minutes > 1440
        or p_minutes not between p_min_minutes and p_max_minutes then
        raise exception 'Preparation estimate or configured bounds are invalid.' using errcode = '22023';
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

    if locked_order.status = 'preparing' then
        timer_updated_at := pg_catalog.clock_timestamp();
    end if;
    update public.orders as customer_order
    set estimated_preparation_minutes = p_minutes,
        estimated_ready_at = case
            when locked_order.status = 'preparing'
                then timer_updated_at + make_interval(mins => p_minutes)
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

revoke all on function public.admin_order_dashboard(text, text, integer, integer)
    from public, anon, authenticated;
revoke all on function public.admin_transition_order(uuid, text, text, text, integer, integer)
    from public, anon, authenticated;
revoke all on function public.admin_set_preparation_estimate(uuid, text, integer, integer, integer)
    from public, anon, authenticated;
grant execute on function public.admin_order_dashboard(text, text, integer, integer) to service_role;
grant execute on function public.admin_transition_order(uuid, text, text, text, integer, integer) to service_role;
grant execute on function public.admin_set_preparation_estimate(uuid, text, integer, integer, integer) to service_role;

do $$
begin
    if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
       and not exists (
            select 1 from pg_catalog.pg_publication_tables
            where pubname = 'supabase_realtime'
              and schemaname = 'public'
              and tablename = 'orders'
       ) then
        execute 'alter publication supabase_realtime add table public.orders';
    end if;
end;
$$;

comment on function public.admin_order_dashboard(text, text, integer, integer) is
    'Returns bounded restaurant operations data. Execution is restricted to the server service role; application code must verify the configured admin user ID before calling.';
comment on function public.admin_transition_order(uuid, text, text, text, integer, integer) is
    'Atomically locks and transitions an order after checking its expected status. Starting preparation records the database start time and persists the estimated ready time.';
comment on function public.admin_set_preparation_estimate(uuid, text, integer, integer, integer) is
    'Atomically updates an estimate only for confirmed or preparing orders; preparing-order changes reset estimated_ready_at from the database clock.';

commit;