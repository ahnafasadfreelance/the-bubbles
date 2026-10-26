begin;

alter table public.orders
    add column preferred_payment_method text
        check (preferred_payment_method in ('card', 'bkash', 'cash')),
    add column amount_paid numeric(12, 2) not null default 0
        check (amount_paid >= 0 and amount_paid <> 'NaN'::numeric and amount_paid <= total),
    drop constraint orders_payment_status_check,
    add constraint orders_payment_status_check
        check (payment_status in ('unpaid', 'partially_paid', 'paid', 'refunded'));

update public.orders
set amount_paid = case when payment_status = 'paid' then total else 0 end,
    payment_status = case when payment_status = 'paid' and total = 0 then 'unpaid' else payment_status end;

alter table public.orders
    add constraint orders_payment_amount_status_check check (
        (payment_status = 'unpaid' and amount_paid = 0)
        or (payment_status = 'partially_paid' and amount_paid > 0 and amount_paid < total)
        or (payment_status = 'paid' and amount_paid = total and total > 0)
        or (payment_status = 'refunded' and amount_paid = 0)
        or (payment_status = 'unpaid' and total = 0 and amount_paid = 0)
    );

create index orders_preferred_payment_created_idx
    on public.orders (preferred_payment_method, created_at desc);

create table public.order_payment_collections (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete restrict,
    idempotency_key uuid not null unique,
    amount numeric(12, 2) not null check (amount > 0 and amount <> 'NaN'::numeric),
    payment_method text not null check (payment_method in ('card', 'bkash', 'cash')),
    collected_by uuid not null references auth.users(id) on delete restrict,
    collected_at timestamptz not null default pg_catalog.clock_timestamp(),
    verification_status text not null default 'staff_verified'
        check (verification_status = 'staff_verified'),
    notes text check (notes is null or char_length(notes) <= 300),
    created_at timestamptz not null default pg_catalog.clock_timestamp()
);

create index order_payment_collections_order_created_idx
    on public.order_payment_collections (order_id, collected_at desc);
create index order_payment_collections_collector_created_idx
    on public.order_payment_collections (collected_by, collected_at desc);
create index order_payment_collections_created_method_idx
    on public.order_payment_collections (collected_at desc, payment_method);

alter table public.order_payment_collections enable row level security;
revoke all privileges on table public.order_payment_collections from public, anon, authenticated;
grant select, insert, update, delete on table public.order_payment_collections to service_role;

grant select (preferred_payment_method, amount_paid) on table public.orders to authenticated;
grant select (preferred_payment_method, amount_paid) on table public.orders to service_role;

create or replace function public.create_dine_in_order_with_payment(
    p_customer_id uuid,
    p_table_id uuid,
    p_idempotency_key uuid,
    p_items jsonb,
    p_customer_note text,
    p_session_id uuid,
    p_session_token_hash text,
    p_preferred_payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    matching_session public.ordering_sessions%rowtype;
    created_result jsonb;
begin
    if p_preferred_payment_method is null
        or p_preferred_payment_method not in ('card', 'bkash', 'cash') then
        raise exception 'INVALID_PAYMENT_METHOD' using errcode = '22023';
    end if;

    if p_session_id is null
        or p_session_token_hash is null
        or p_session_token_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'ORDERING_SESSION_EXPIRED' using errcode = 'P0001';
    end if;

    select ordering_session.*
    into matching_session
    from public.ordering_sessions as ordering_session
    where ordering_session.id = p_session_id
      and ordering_session.table_id = p_table_id
      and ordering_session.token_hash = p_session_token_hash
      and ordering_session.revoked_at is null
      and ordering_session.expires_at > pg_catalog.clock_timestamp()
    for share;

    if not found then
        raise exception 'ORDERING_SESSION_EXPIRED' using errcode = 'P0001';
    end if;

    created_result := public.create_dine_in_order(
        p_customer_id,
        p_table_id,
        p_idempotency_key,
        p_items,
        p_customer_note
    );

    update public.orders
    set preferred_payment_method = p_preferred_payment_method
    where id = (created_result ->> 'id')::uuid
      and customer_id = p_customer_id
      and idempotency_key = p_idempotency_key
      and preferred_payment_method is null;

    return created_result;
end;
$$;

revoke all on function public.create_dine_in_order_with_payment(uuid, uuid, uuid, jsonb, text, uuid, text, text)
    from public, anon, authenticated;
grant execute on function public.create_dine_in_order_with_payment(uuid, uuid, uuid, jsonb, text, uuid, text, text)
    to service_role;

create or replace function public.admin_record_order_payment(
    p_order_id uuid,
    p_staff_id uuid,
    p_amount numeric,
    p_payment_method text,
    p_notes text,
    p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    locked_order public.orders%rowtype;
    existing_payment public.order_payment_collections%rowtype;
    new_payment public.order_payment_collections%rowtype;
    new_amount_paid numeric(12, 2);
    new_payment_status text;
begin
    if p_order_id is null or p_staff_id is null or p_idempotency_key is null
        or p_amount is null or p_amount <= 0 or p_amount = 'NaN'::numeric
        or p_amount <> pg_catalog.round(p_amount, 2)
        or p_payment_method is null
        or p_payment_method not in ('card', 'bkash', 'cash')
        or (p_notes is not null and char_length(p_notes) > 300) then
        raise exception 'INVALID_PAYMENT' using errcode = '22023';
    end if;

    select customer_order.*
    into locked_order
    from public.orders as customer_order
    where customer_order.id = p_order_id
    for update;

    if not found then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found');
    end if;

    select payment.*
    into existing_payment
    from public.order_payment_collections as payment
    where payment.idempotency_key = p_idempotency_key;

    if found then
        if existing_payment.order_id = p_order_id
            and existing_payment.collected_by = p_staff_id
            and existing_payment.amount = p_amount
            and existing_payment.payment_method = p_payment_method
            and existing_payment.notes is not distinct from nullif(pg_catalog.btrim(p_notes), '') then
            return pg_catalog.jsonb_build_object(
                'ok', true,
                'duplicate', true,
                'payment_id', existing_payment.id,
                'amount', existing_payment.amount,
                'collected_at', existing_payment.collected_at
            );
        end if;
        raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
    end if;

    if locked_order.status in ('rejected', 'cancelled') or locked_order.payment_status = 'refunded' then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_collectable');
    end if;

    if p_amount > locked_order.total - locked_order.amount_paid then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'amount_exceeds_balance');
    end if;

    new_amount_paid := locked_order.amount_paid + p_amount;
    new_payment_status := case
        when new_amount_paid = locked_order.total then 'paid'
        else 'partially_paid'
    end;

    insert into public.order_payment_collections (
        order_id, idempotency_key, amount, payment_method, collected_by, notes
    ) values (
        p_order_id, p_idempotency_key, p_amount, p_payment_method, p_staff_id,
        nullif(pg_catalog.btrim(p_notes), '')
    )
    returning * into new_payment;

    update public.orders
    set amount_paid = new_amount_paid,
        payment_status = new_payment_status
    where id = p_order_id;

    return pg_catalog.jsonb_build_object(
        'ok', true,
        'duplicate', false,
        'payment_id', new_payment.id,
        'amount', new_payment.amount,
        'amount_paid', new_amount_paid,
        'outstanding', locked_order.total - new_amount_paid,
        'payment_status', new_payment_status,
        'collected_at', new_payment.collected_at
    );
end;
$$;

revoke all on function public.admin_record_order_payment(uuid, uuid, numeric, text, text, uuid)
    from public, anon, authenticated;
grant execute on function public.admin_record_order_payment(uuid, uuid, numeric, text, text, uuid)
    to service_role;

create or replace function public.admin_payment_overview(p_from_date date default null, p_to_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    restaurant_zone text := coalesce(
        (select settings.time_zone from public.restaurant_settings as settings where settings.id = 1),
        'UTC'
    );
    start_at timestamptz;
    end_at timestamptz;
    result jsonb;
begin
    if p_from_date is not null and p_to_date is not null and p_from_date > p_to_date then
        raise exception 'Invalid payment date range.' using errcode = '22023';
    end if;

    if p_from_date is null and p_to_date is null then
        start_at := (pg_catalog.now() at time zone restaurant_zone)::date::timestamp
            at time zone restaurant_zone;
        end_at := ((pg_catalog.now() at time zone restaurant_zone)::date + 1)::timestamp
            at time zone restaurant_zone;
    else
        start_at := case when p_from_date is null then '-infinity'::timestamptz
            else p_from_date::timestamp at time zone restaurant_zone end;
        end_at := case when p_to_date is null then 'infinity'::timestamptz
            else (p_to_date + 1)::timestamp at time zone restaurant_zone end;
    end if;

    select pg_catalog.jsonb_build_object(
        'collected_by_currency', coalesce((
            select pg_catalog.jsonb_object_agg(collections.currency, collections.total)
            from (
                select order_row.currency, sum(payment.amount) as total
                from public.order_payment_collections as payment
                join public.orders as order_row on order_row.id = payment.order_id
                where payment.collected_at >= start_at and payment.collected_at < end_at
                group by order_row.currency
            ) as collections
        ), '{}'::jsonb),
        'collected_by_method', coalesce((
            select pg_catalog.jsonb_object_agg(collections.payment_method, collections.currency_totals)
            from (
                select method_totals.payment_method,
                    pg_catalog.jsonb_object_agg(method_totals.currency, method_totals.total) as currency_totals
                from (
                    select payment.payment_method, order_row.currency, sum(payment.amount) as total
                    from public.order_payment_collections as payment
                    join public.orders as order_row on order_row.id = payment.order_id
                    where payment.collected_at >= start_at and payment.collected_at < end_at
                    group by payment.payment_method, order_row.currency
                ) as method_totals
                group by method_totals.payment_method
            ) as collections
        ), '{}'::jsonb),
        'outstanding_by_currency', coalesce((
            select pg_catalog.jsonb_object_agg(balances.currency, balances.total)
            from (
                select order_row.currency, sum(order_row.total - order_row.amount_paid) as total
                from public.orders as order_row
                where order_row.status not in ('rejected', 'cancelled')
                  and order_row.payment_status in ('unpaid', 'partially_paid')
                group by order_row.currency
            ) as balances
        ), '{}'::jsonb),
        'unpaid_orders', (
            select count(*) from public.orders as order_row
            where order_row.status not in ('rejected', 'cancelled')
              and order_row.payment_status = 'unpaid'
        ),
        'partially_paid_orders', (
            select count(*) from public.orders as order_row
            where order_row.status not in ('rejected', 'cancelled')
              and order_row.payment_status = 'partially_paid'
        ),
        'paid_orders', (
            select count(*) from public.orders as order_row
            where order_row.status not in ('rejected', 'cancelled')
              and order_row.payment_status = 'paid'
        )
    ) into result;

    return result;
end;
$$;

revoke all on function public.admin_payment_overview(date, date) from public, anon, authenticated;
grant execute on function public.admin_payment_overview(date, date) to service_role;

create or replace function public.admin_order_dashboard_with_payments(
    p_status text default 'all',
    p_search text default null,
    p_table text default null,
    p_from_date date default null,
    p_to_date date default null,
    p_payment_status text default 'all',
    p_payment_method text default 'all',
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
    requested_method text := coalesce(nullif(pg_catalog.btrim(p_payment_method), ''), 'all');
    bounded_offset integer := least(greatest(coalesce(p_offset, 0), 0), 100000);
    bounded_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
    summary_result jsonb;
    orders_result jsonb;
    result_total bigint;
begin
    if requested_status <> 'all' and requested_status not in ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'rejected', 'cancelled') then
        raise exception 'Invalid order status filter.' using errcode = '22023';
    end if;
    if requested_payment <> 'all' and requested_payment not in ('unpaid', 'partially_paid', 'paid', 'refunded') then
        raise exception 'Invalid payment status filter.' using errcode = '22023';
    end if;
    if requested_method <> 'all' and requested_method not in ('card', 'bkash', 'cash') then
        raise exception 'Invalid payment method filter.' using errcode = '22023';
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
    left join public.customer_profiles as profile on profile.id = customer_order.customer_id
    left join auth.users as auth_user on auth_user.id = customer_order.customer_id
    where (requested_status = 'all' or customer_order.status = requested_status)
      and (requested_payment = 'all' or customer_order.payment_status = requested_payment)
      and (requested_method = 'all' or customer_order.preferred_payment_method = requested_method)
      and (requested_table is null or pg_catalog.strpos(pg_catalog.lower(customer_order.table_number_snapshot || ' ' || coalesce(customer_order.table_name_snapshot, '')), pg_catalog.lower(requested_table)) > 0)
      and (p_from_date is null or (customer_order.created_at at time zone coalesce((select settings.time_zone from public.restaurant_settings as settings where settings.id = 1), 'UTC')) >= p_from_date::timestamp)
      and (p_to_date is null or (customer_order.created_at at time zone coalesce((select settings.time_zone from public.restaurant_settings as settings where settings.id = 1), 'UTC')) < (p_to_date + 1)::timestamp)
      and (
          requested_search is null
          or pg_catalog.strpos(pg_catalog.lower(customer_order.order_number), pg_catalog.lower(requested_search)) > 0
          or pg_catalog.strpos(pg_catalog.lower(customer_order.id::text), pg_catalog.lower(requested_search)) > 0
          or pg_catalog.strpos(pg_catalog.lower(coalesce(profile.display_name, '')), pg_catalog.lower(requested_search)) > 0
          or pg_catalog.strpos(pg_catalog.lower(coalesce(auth_user.email, '')), pg_catalog.lower(requested_search)) > 0
          or pg_catalog.strpos(pg_catalog.lower(coalesce(auth_user.raw_user_meta_data ->> 'full_name', '')), pg_catalog.lower(requested_search)) > 0
          or pg_catalog.strpos(pg_catalog.lower(coalesce(auth_user.raw_user_meta_data ->> 'name', '')), pg_catalog.lower(requested_search)) > 0
      );

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
                'preferred_payment_method', customer_order.preferred_payment_method,
                'amount_paid', customer_order.amount_paid,
                'payment_status', customer_order.payment_status,
                'payment_collections', coalesce((
                    select pg_catalog.jsonb_agg(
                        pg_catalog.jsonb_build_object(
                            'id', payment.id,
                            'amount', payment.amount,
                            'payment_method', payment.payment_method,
                            'collected_by', payment.collected_by,
                            'collected_by_name', coalesce(
                                nullif(pg_catalog.btrim(staff_profile.display_name), ''),
                                nullif(pg_catalog.btrim(staff.raw_user_meta_data ->> 'full_name'), ''),
                                nullif(pg_catalog.btrim(staff.raw_user_meta_data ->> 'name'), ''),
                                'Authorized staff'
                            ),
                            'collected_at', payment.collected_at,
                            'verification_status', payment.verification_status,
                            'notes', payment.notes
                        ) order by payment.collected_at desc, payment.id desc
                    )
                    from public.order_payment_collections as payment
                    left join public.customer_profiles as staff_profile on staff_profile.id = payment.collected_by
                    left join auth.users as staff on staff.id = payment.collected_by
                    where payment.order_id = customer_order.id
                ), '[]'::jsonb),
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
          and (requested_payment = 'all' or customer_order.payment_status = requested_payment)
          and (requested_method = 'all' or customer_order.preferred_payment_method = requested_method)
          and (requested_table is null or pg_catalog.strpos(pg_catalog.lower(customer_order.table_number_snapshot || ' ' || coalesce(customer_order.table_name_snapshot, '')), pg_catalog.lower(requested_table)) > 0)
          and (p_from_date is null or (customer_order.created_at at time zone coalesce((select settings.time_zone from public.restaurant_settings as settings where settings.id = 1), 'UTC')) >= p_from_date::timestamp)
          and (p_to_date is null or (customer_order.created_at at time zone coalesce((select settings.time_zone from public.restaurant_settings as settings where settings.id = 1), 'UTC')) < (p_to_date + 1)::timestamp)
          and (
              requested_search is null
              or pg_catalog.strpos(pg_catalog.lower(customer_order.order_number), pg_catalog.lower(requested_search)) > 0
              or pg_catalog.strpos(pg_catalog.lower(customer_order.id::text), pg_catalog.lower(requested_search)) > 0
              or pg_catalog.strpos(pg_catalog.lower(coalesce(profile.display_name, '')), pg_catalog.lower(requested_search)) > 0
              or pg_catalog.strpos(pg_catalog.lower(coalesce(auth_user.email, '')), pg_catalog.lower(requested_search)) > 0
              or pg_catalog.strpos(pg_catalog.lower(coalesce(auth_user.raw_user_meta_data ->> 'full_name', '')), pg_catalog.lower(requested_search)) > 0
              or pg_catalog.strpos(pg_catalog.lower(coalesce(auth_user.raw_user_meta_data ->> 'name', '')), pg_catalog.lower(requested_search)) > 0
          )
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

revoke all on function public.admin_order_dashboard_with_payments(text, text, text, date, date, text, text, integer, integer)
    from public, anon, authenticated;
grant execute on function public.admin_order_dashboard_with_payments(text, text, text, date, date, text, text, integer, integer)
    to service_role;

commit;
