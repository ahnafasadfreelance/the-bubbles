begin;

alter table public.restaurant_settings
    add column about_text text
        check (about_text is null or char_length(about_text) <= 4000),
    add column is_ordering_enabled boolean not null default true,
    add column ordering_disabled_message text
        check (ordering_disabled_message is null or char_length(ordering_disabled_message) <= 300),
    add column dine_in_enabled boolean not null default true,
    add column allow_customer_cancellation boolean not null default true,
    add column default_preparation_minutes integer not null default 30
        check (default_preparation_minutes between 1 and 1440),
    add column time_zone text not null default 'UTC';

create index orders_status_created_idx on public.orders (status, created_at desc);
create index orders_payment_created_idx on public.orders (payment_status, created_at desc);
create index orders_table_snapshot_created_idx on public.orders (table_number_snapshot, created_at desc);

create or replace function private.validate_restaurant_time_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if not exists (
        select 1
        from pg_catalog.pg_timezone_names as known_zone
        where known_zone.name = new.time_zone
    ) then
        raise exception 'Invalid restaurant time zone.' using errcode = '22023';
    end if;
    return new;
end;
$$;

revoke all on function private.validate_restaurant_time_zone() from public, anon, authenticated;

create trigger restaurant_settings_validate_time_zone
before insert or update of time_zone on public.restaurant_settings
for each row execute function private.validate_restaurant_time_zone();

create or replace function private.enforce_restaurant_ordering_availability()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    restaurant_settings public.restaurant_settings%rowtype;
    current_local timestamp without time zone;
    today_key text;
    yesterday_key text;
    today_schedule jsonb;
    yesterday_schedule jsonb;
    local_time time without time zone;
    open_time time without time zone;
    close_time time without time zone;
    is_open boolean := true;
begin
    select settings.*
    into restaurant_settings
    from public.restaurant_settings as settings
    where settings.id = 1
    for share;

    if not found or not restaurant_settings.is_published then
        raise exception 'MENU_UNAVAILABLE' using errcode = 'P0001';
    end if;
    if not restaurant_settings.dine_in_enabled then
        raise exception 'DINE_IN_UNAVAILABLE' using errcode = 'P0001';
    end if;
    if new.estimated_preparation_minutes is null then
        new.estimated_preparation_minutes := restaurant_settings.default_preparation_minutes;
    end if;
    if not restaurant_settings.is_ordering_enabled then
        raise exception 'ORDERING_UNAVAILABLE' using errcode = 'P0001';
    end if;
    if exists (
        select 1
        from pg_catalog.jsonb_each(restaurant_settings.opening_hours) as daily_hours(day_name, schedule)
        where pg_catalog.jsonb_typeof(daily_hours.schedule) = 'object'
    ) then
        current_local := pg_catalog.timezone(restaurant_settings.time_zone, pg_catalog.now());
        today_key := (array['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
            [extract(isodow from current_local)::integer];
        yesterday_key := (array['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
            [case when extract(isodow from current_local)::integer = 1 then 7 else extract(isodow from current_local)::integer - 1 end];
        today_schedule := restaurant_settings.opening_hours -> today_key;
        yesterday_schedule := restaurant_settings.opening_hours -> yesterday_key;
        local_time := current_local::time;
        is_open := false;

        if coalesce((today_schedule ->> 'closed')::boolean, true) = false then
            open_time := (today_schedule ->> 'open')::time;
            close_time := (today_schedule ->> 'close')::time;
            if (open_time < close_time and local_time >= open_time and local_time < close_time)
                or (open_time >= close_time and local_time >= open_time) then
                is_open := true;
            end if;
        end if;
        if not is_open and coalesce((yesterday_schedule ->> 'closed')::boolean, true) = false then
            open_time := (yesterday_schedule ->> 'open')::time;
            close_time := (yesterday_schedule ->> 'close')::time;
            if open_time >= close_time and local_time < close_time then
                is_open := true;
            end if;
        end if;
        if not is_open then
            raise exception 'RESTAURANT_CLOSED' using errcode = 'P0001';
        end if;
    end if;
    return new;
end;
$$;

revoke all on function private.enforce_restaurant_ordering_availability() from public, anon, authenticated;

create trigger orders_enforce_restaurant_ordering_availability
before insert on public.orders
for each row execute function private.enforce_restaurant_ordering_availability();

create or replace function public.cancel_customer_order(p_customer_id uuid, p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    cancelled_id uuid;
begin
    if p_customer_id is null or p_order_id is null then
        return 'not_found';
    end if;

    update public.orders as customer_order
    set status = 'cancelled'
    where customer_order.id = p_order_id
      and customer_order.customer_id = p_customer_id
      and customer_order.status = 'pending'
      and exists (
          select 1
          from public.restaurant_settings as settings
          where settings.id = 1 and settings.allow_customer_cancellation
      )
    returning customer_order.id into cancelled_id;

    if cancelled_id is not null then
        return 'cancelled';
    end if;
    if exists (
        select 1 from public.orders as customer_order
        where customer_order.id = p_order_id and customer_order.customer_id = p_customer_id
    ) then
        return 'not_cancellable';
    end if;
    return 'not_found';
end;
$$;

revoke all on function public.cancel_customer_order(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_customer_order(uuid, uuid) to service_role;

create or replace function public.admin_customer_directory(
    p_search text default null,
    p_sort text default 'newest',
    p_offset integer default 0,
    p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    requested_search text := nullif(pg_catalog.btrim(p_search), '');
    requested_sort text := coalesce(p_sort, 'newest');
    bounded_offset integer := least(greatest(coalesce(p_offset, 0), 0), 100000);
    bounded_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
begin
    if requested_search is not null and char_length(requested_search) > 80 then
        raise exception 'Search text is too long.' using errcode = '22023';
    end if;
    if requested_sort not in ('newest', 'oldest', 'most_orders', 'highest_spending', 'recent_activity') then
        raise exception 'Invalid customer sort.' using errcode = '22023';
    end if;

    return pg_catalog.jsonb_build_object(
        'total', (
            select count(distinct customer_order.customer_id)
            from public.orders as customer_order
            join auth.users as auth_user on auth_user.id = customer_order.customer_id
            left join public.customer_profiles as profile on profile.id = customer_order.customer_id
            where requested_search is null
                or pg_catalog.strpos(pg_catalog.lower(coalesce(profile.display_name, auth_user.raw_user_meta_data ->> 'full_name', auth_user.raw_user_meta_data ->> 'name', '')), pg_catalog.lower(requested_search)) > 0
                or pg_catalog.strpos(pg_catalog.lower(coalesce(auth_user.email, '')), pg_catalog.lower(requested_search)) > 0
        ),
        'customers', coalesce((
            select pg_catalog.jsonb_agg(customer_page.customer_json order by customer_page.sort_rank, customer_page.customer_id)
            from (
                select
                    auth_user.id as customer_id,
                    row_number() over (
                        order by
                            case when requested_sort = 'newest' then extract(epoch from auth_user.created_at) end desc,
                            case when requested_sort = 'oldest' then extract(epoch from auth_user.created_at) end asc,
                            case when requested_sort = 'most_orders' then order_totals.total_orders end desc,
                            case when requested_sort = 'highest_spending' then order_totals.total_spending end desc,
                            case when requested_sort = 'recent_activity' then extract(epoch from order_totals.last_order_at) end desc,
                            auth_user.id
                    ) as sort_rank,
                    pg_catalog.jsonb_build_object(
                        'id', auth_user.id,
                        'name', coalesce(nullif(pg_catalog.btrim(profile.display_name), ''), nullif(pg_catalog.btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''), nullif(pg_catalog.btrim(auth_user.raw_user_meta_data ->> 'name'), ''), 'Customer'),
                        'email', auth_user.email,
                        'avatar_url', profile.avatar_url,
                        'created_at', auth_user.created_at,
                        'total_orders', order_totals.total_orders,
                        'total_spending_by_currency', order_totals.total_spending_by_currency,
                        'spending_orders_by_currency', order_totals.spending_orders_by_currency,
                        'last_order_at', order_totals.last_order_at,
                        'status_summary', order_totals.status_summary
                    ) as customer_json
                from auth.users as auth_user
                join lateral (
                    select
                        count(*)::integer as total_orders,
                        coalesce(sum(customer_order.total) filter (where customer_order.status not in ('rejected', 'cancelled')), 0) as total_spending,
                        coalesce((
                            select pg_catalog.jsonb_object_agg(currency_totals.currency, currency_totals.amount)
                            from (
                                select currency_order.currency, sum(currency_order.total) as amount
                                from public.orders as currency_order
                                where currency_order.customer_id = auth_user.id
                                  and currency_order.status not in ('rejected', 'cancelled')
                                group by currency_order.currency
                            ) as currency_totals
                        ), '{}'::jsonb) as total_spending_by_currency,
                        coalesce((
                            select pg_catalog.jsonb_object_agg(currency_counts.currency, currency_counts.order_count)
                            from (
                                select currency_order.currency, count(*)::integer as order_count
                                from public.orders as currency_order
                                where currency_order.customer_id = auth_user.id
                                  and currency_order.status not in ('rejected', 'cancelled')
                                group by currency_order.currency
                            ) as currency_counts
                        ), '{}'::jsonb) as spending_orders_by_currency,
                        max(customer_order.created_at) as last_order_at,
                        (
                            select pg_catalog.jsonb_object_agg(status_totals.status, status_totals.order_count)
                            from (
                                select customer_order_status.status, count(*)::integer as order_count
                                from public.orders as customer_order_status
                                where customer_order_status.customer_id = auth_user.id
                                group by customer_order_status.status
                            ) as status_totals
                        ) as status_summary
                    from public.orders as customer_order
                    where customer_order.customer_id = auth_user.id
                ) as order_totals on true
                left join public.customer_profiles as profile on profile.id = auth_user.id
                where order_totals.total_orders > 0
                    and (
                        requested_search is null
                        or pg_catalog.strpos(pg_catalog.lower(coalesce(profile.display_name, auth_user.raw_user_meta_data ->> 'full_name', auth_user.raw_user_meta_data ->> 'name', '')), pg_catalog.lower(requested_search)) > 0
                        or pg_catalog.strpos(pg_catalog.lower(coalesce(auth_user.email, '')), pg_catalog.lower(requested_search)) > 0
                    )
                limit bounded_limit offset bounded_offset
            ) as customer_page
        ), '[]'::jsonb)
    );
end;
$$;

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
      and (requested_search is null or pg_catalog.strpos(pg_catalog.lower(customer_order.order_number), pg_catalog.lower(requested_search)) > 0
           or pg_catalog.strpos(pg_catalog.lower(customer_order.id::text), pg_catalog.lower(requested_search)) > 0)
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
          and (requested_search is null or pg_catalog.strpos(pg_catalog.lower(customer_order.order_number), pg_catalog.lower(requested_search)) > 0
               or pg_catalog.strpos(pg_catalog.lower(customer_order.id::text), pg_catalog.lower(requested_search)) > 0)
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

create or replace function public.admin_customer_order_history(p_customer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
            'id', customer_order.id,
            'order_number', customer_order.order_number,
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
        ) order by customer_order.created_at desc
    ), '[]'::jsonb)
    from public.orders as customer_order
    where customer_order.customer_id = p_customer_id;
$$;

create or replace function public.admin_customer_details(p_customer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select pg_catalog.jsonb_build_object(
        'id', auth_user.id,
        'name', coalesce(nullif(pg_catalog.btrim(profile.display_name), ''), nullif(pg_catalog.btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''), nullif(pg_catalog.btrim(auth_user.raw_user_meta_data ->> 'name'), ''), 'Customer'),
        'email', auth_user.email,
        'avatar_url', profile.avatar_url,
        'created_at', auth_user.created_at,
        'total_orders', order_totals.total_orders,
        'total_spending_by_currency', order_totals.total_spending_by_currency,
        'spending_orders_by_currency', order_totals.spending_orders_by_currency,
        'last_order_at', order_totals.last_order_at
    )
    from auth.users as auth_user
    left join public.customer_profiles as profile on profile.id = auth_user.id
    cross join lateral (
        select
            count(*)::integer as total_orders,
            coalesce(sum(customer_order.total) filter (where customer_order.status not in ('rejected', 'cancelled')), 0) as total_spending,
            coalesce((
                select pg_catalog.jsonb_object_agg(currency_totals.currency, currency_totals.amount)
                from (
                    select currency_order.currency, sum(currency_order.total) as amount
                    from public.orders as currency_order
                    where currency_order.customer_id = auth_user.id
                      and currency_order.status not in ('rejected', 'cancelled')
                    group by currency_order.currency
                ) as currency_totals
            ), '{}'::jsonb) as total_spending_by_currency,
            coalesce((
                select pg_catalog.jsonb_object_agg(currency_counts.currency, currency_counts.order_count)
                from (
                    select currency_order.currency, count(*)::integer as order_count
                    from public.orders as currency_order
                    where currency_order.customer_id = auth_user.id
                      and currency_order.status not in ('rejected', 'cancelled')
                    group by currency_order.currency
                ) as currency_counts
            ), '{}'::jsonb) as spending_orders_by_currency,
            max(customer_order.created_at) as last_order_at
        from public.orders as customer_order
        where customer_order.customer_id = auth_user.id
    ) as order_totals
    where auth_user.id = p_customer_id
      and order_totals.total_orders > 0;
$$;

create or replace function public.admin_customer_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
    select count(distinct customer_order.customer_id)
    from public.orders as customer_order;
$$;

revoke all on function public.admin_customer_directory(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_order_dashboard_filtered(text, text, text, date, date, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_customer_order_history(uuid) from public, anon, authenticated;
revoke all on function public.admin_customer_details(uuid) from public, anon, authenticated;
revoke all on function public.admin_customer_count() from public, anon, authenticated;
grant execute on function public.admin_customer_directory(text, text, integer, integer) to service_role;
grant execute on function public.admin_order_dashboard_filtered(text, text, text, date, date, text, integer, integer) to service_role;
grant execute on function public.admin_customer_order_history(uuid) to service_role;
grant execute on function public.admin_customer_details(uuid) to service_role;
grant execute on function public.admin_customer_count() to service_role;

comment on function public.admin_customer_directory(text, text, integer, integer) is
    'Returns paginated customer profile and order aggregates without exposing auth credentials. Callers must verify the configured admin UUID.';
comment on function public.admin_order_dashboard_filtered(text, text, text, date, date, text, integer, integer) is
    'Returns bounded order results for validated admin filters. Callers must verify the configured admin UUID.';
comment on function public.admin_customer_order_history(uuid) is
    'Returns safe order history for a customer. Execution is service-role only; callers must verify the configured admin UUID.';

commit;
