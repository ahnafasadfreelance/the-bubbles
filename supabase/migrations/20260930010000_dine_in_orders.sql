begin;

create sequence public.order_number_seq;

create table public.orders (
    id uuid primary key default gen_random_uuid(),
    order_number text not null unique,
    idempotency_key uuid not null,
    customer_id uuid not null references auth.users(id) on delete restrict,
    table_id uuid not null references public.restaurant_tables(id) on delete restrict,
    table_number_snapshot text not null,
    table_name_snapshot text,
    status text not null default 'pending'
        check (status in ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'rejected', 'cancelled')),
    subtotal numeric(12, 2) not null check (subtotal >= 0 and subtotal <> 'NaN'::numeric),
    discount_total numeric(12, 2) not null default 0
        check (discount_total >= 0 and discount_total <> 'NaN'::numeric),
    total numeric(12, 2) not null check (total >= 0 and total <> 'NaN'::numeric),
    currency text not null check (currency ~ '^[A-Z]{3}$'),
    payment_method text not null default 'counter' check (payment_method = 'counter'),
    payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded')),
    customer_note text check (customer_note is null or char_length(customer_note) <= 1000),
    estimated_preparation_minutes integer
        check (estimated_preparation_minutes is null or estimated_preparation_minutes >= 0),
    created_at timestamptz not null default pg_catalog.now(),
    updated_at timestamptz not null default pg_catalog.now(),
    constraint orders_total_breakdown_check check (total = subtotal - discount_total),
    constraint orders_customer_idempotency_key_unique unique (customer_id, idempotency_key)
);

create table public.order_items (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete restrict,
    menu_item_id uuid references public.menu_items(id) on delete set null,
    item_name text not null check (char_length(item_name) between 1 and 200),
    unit_price numeric(10, 2) not null check (unit_price >= 0 and unit_price <> 'NaN'::numeric),
    quantity integer not null check (quantity between 1 and 20),
    line_total numeric(12, 2) not null check (line_total >= 0 and line_total <> 'NaN'::numeric),
    special_instructions text check (special_instructions is null or char_length(special_instructions) <= 500),
    created_at timestamptz not null default pg_catalog.now(),
    constraint order_items_line_total_matches_price_check check (line_total = unit_price * quantity)
);

create index orders_customer_created_idx on public.orders (customer_id, created_at desc);
create index orders_table_created_idx on public.orders (table_id, created_at desc);
create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_menu_item_id_idx on public.order_items (menu_item_id);

create trigger orders_set_updated_at
before update on public.orders
for each row execute function private.set_updated_at();

create or replace function private.enforce_order_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.status is distinct from old.status and not (
        (old.status = 'pending' and new.status in ('confirmed', 'rejected', 'cancelled'))
        or (old.status = 'confirmed' and new.status in ('preparing', 'rejected'))
        or (old.status = 'preparing' and new.status = 'ready')
        or (old.status = 'ready' and new.status = 'completed')
    ) then
        raise exception 'Invalid order status transition.' using errcode = '23514';
    end if;
    return new;
end;
$$;

revoke all on function private.enforce_order_status_transition() from public, anon, authenticated;
comment on function private.enforce_order_status_transition() is
    'Permits pending to confirmed, rejected, or cancelled; confirmed to preparing or rejected; preparing to ready; and ready to completed. No other transitions are valid.';

create trigger orders_enforce_status_transition
before update of status on public.orders
for each row execute function private.enforce_order_status_transition();

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

revoke all privileges on table public.orders, public.order_items
from public, anon, authenticated;

grant select (
    id,
    order_number,
    customer_id,
    table_id,
    table_number_snapshot,
    table_name_snapshot,
    status,
    subtotal,
    discount_total,
    total,
    currency,
    payment_method,
    payment_status,
    customer_note,
    estimated_preparation_minutes,
    created_at,
    updated_at
) on table public.orders to authenticated;

grant select (
    id,
    order_id,
    menu_item_id,
    item_name,
    unit_price,
    quantity,
    line_total,
    special_instructions,
    created_at
) on table public.order_items to authenticated;

create policy "Customers can read their own orders"
    on public.orders
    for select
    to authenticated
    using ((select auth.uid()) = customer_id);

create policy "Customers can read items from their own orders"
    on public.order_items
    for select
    to authenticated
    using (
        exists (
            select 1
            from public.orders as customer_order
            where customer_order.id = order_items.order_id
              and customer_order.customer_id = (select auth.uid())
        )
    );

grant select, insert, update, delete on table public.orders, public.order_items to service_role;
grant usage, select on sequence public.order_number_seq to service_role;

create or replace function public.create_dine_in_order(
    p_customer_id uuid,
    p_table_id uuid,
    p_idempotency_key uuid,
    p_items jsonb,
    p_customer_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    input_item jsonb;
    menu_record record;
    item_quantity integer;
    expected_unit_price numeric(10, 2);
    actual_unit_price numeric(10, 2);
    item_instructions text;
    regular_subtotal numeric(18, 2) := 0;
    discount_amount numeric(18, 2) := 0;
    order_total numeric(18, 2) := 0;
    item_count integer;
    unique_item_count integer;
    order_currency text;
    created_order public.orders%rowtype;
    existing_order public.orders%rowtype;
    table_record public.restaurant_tables%rowtype;
begin
    if p_customer_id is null or p_table_id is null or p_idempotency_key is null then
        raise exception 'INVALID_ORDER' using errcode = '22023';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_customer_id::text || ':' || p_idempotency_key::text, 0)
    );

    select customer_order.*
    into existing_order
    from public.orders as customer_order
    where customer_order.customer_id = p_customer_id
      and customer_order.idempotency_key = p_idempotency_key;
    if found then
        return pg_catalog.jsonb_build_object(
            'id', existing_order.id,
            'order_number', existing_order.order_number,
            'subtotal', existing_order.subtotal,
            'discount_total', existing_order.discount_total,
            'total', existing_order.total,
            'currency', existing_order.currency,
            'duplicate', true
        );
    end if;

    if p_customer_note is not null and char_length(p_customer_note) > 1000 then
        raise exception 'INVALID_ORDER' using errcode = '22023';
    end if;
    if jsonb_typeof(p_items) is distinct from 'array' then
        raise exception 'INVALID_ORDER' using errcode = '22023';
    end if;
    if jsonb_array_length(p_items) not between 1 and 30 then
        raise exception 'INVALID_ORDER' using errcode = '22023';
    end if;

    if exists (
        select 1
        from jsonb_array_elements(p_items) as entries(value)
        where jsonb_typeof(entries.value) is distinct from 'object'
            or jsonb_typeof(entries.value -> 'menu_item_id') is distinct from 'string'
            or (entries.value ->> 'menu_item_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            or jsonb_typeof(entries.value -> 'quantity') is distinct from 'number'
            or (entries.value ->> 'quantity') !~ '^[1-9][0-9]?$'
            or (entries.value ->> 'quantity')::integer not between 1 and 20
            or jsonb_typeof(entries.value -> 'expected_unit_price') is distinct from 'number'
            or (entries.value ->> 'expected_unit_price') !~ '^[0-9]{1,8}(\.[0-9]{1,2})?$'
            or (
                entries.value -> 'special_instructions' is not null
                and jsonb_typeof(entries.value -> 'special_instructions') not in ('string', 'null')
            )
            or char_length(coalesce(entries.value ->> 'special_instructions', '')) > 500
    ) then
        raise exception 'INVALID_ORDER' using errcode = '22023';
    end if;

    select count(*), count(distinct (entries.value ->> 'menu_item_id')::uuid)
    into item_count, unique_item_count
    from jsonb_array_elements(p_items) as entries(value);
    if item_count <> unique_item_count then
        raise exception 'INVALID_ORDER' using errcode = '22023';
    end if;

        select restaurant_table.*
        into table_record
        from public.restaurant_tables as restaurant_table
        where restaurant_table.id = p_table_id
            and restaurant_table.is_active
    for share;
    if not found then
        raise exception 'TABLE_UNAVAILABLE' using errcode = 'P0001';
    end if;

    select restaurant_settings.currency
    into order_currency
    from public.restaurant_settings
    where restaurant_settings.id = 1
      and restaurant_settings.is_published
    for share;
    if not found then
        raise exception 'MENU_UNAVAILABLE' using errcode = 'P0001';
    end if;

    for input_item in select entries.value from jsonb_array_elements(p_items) as entries(value)
    loop
        item_quantity := (input_item ->> 'quantity')::integer;
        expected_unit_price := (input_item ->> 'expected_unit_price')::numeric(10, 2);
        item_instructions := nullif(pg_catalog.btrim(input_item ->> 'special_instructions'), '');

        select menu_item.id, menu_item.name, menu_item.price, menu_item.discount_price
        into menu_record
        from public.menu_items as menu_item
        join public.menu_categories as menu_category
          on menu_category.id = menu_item.category_id
        where menu_item.id = (input_item ->> 'menu_item_id')::uuid
          and menu_item.is_available
          and menu_category.is_active
        for share of menu_item, menu_category;

        if not found then
            raise exception 'ITEM_UNAVAILABLE' using errcode = 'P0001';
        end if;

        actual_unit_price := case
            when menu_record.discount_price is not null
                and menu_record.discount_price >= 0
                and menu_record.discount_price < menu_record.price
            then menu_record.discount_price
            else menu_record.price
        end;
        if expected_unit_price <> actual_unit_price then
            raise exception 'PRICE_CHANGED' using errcode = 'P0001';
        end if;

        regular_subtotal := regular_subtotal + menu_record.price * item_quantity;
        discount_amount := discount_amount + (menu_record.price - actual_unit_price) * item_quantity;
        order_total := order_total + actual_unit_price * item_quantity;
    end loop;

    if regular_subtotal > 9999999999.99 then
        raise exception 'INVALID_ORDER' using errcode = '22023';
    end if;

    insert into public.orders (
        order_number,
        idempotency_key,
        customer_id,
        table_id,
        table_number_snapshot,
        table_name_snapshot,
        subtotal,
        discount_total,
        total,
        currency,
        customer_note
    ) values (
        'BT-' || pg_catalog.to_char(pg_catalog.now(), 'YYMMDD') || '-'
            || pg_catalog.lpad(pg_catalog.nextval('public.order_number_seq')::text, 6, '0'),
        p_idempotency_key,
        p_customer_id,
        p_table_id,
        table_record.table_number,
        table_record.table_name,
        regular_subtotal,
        discount_amount,
        order_total,
        order_currency,
        nullif(pg_catalog.btrim(p_customer_note), '')
    )
    on conflict (customer_id, idempotency_key) do nothing
    returning * into created_order;

    if not found then
        select customer_order.*
        into existing_order
        from public.orders as customer_order
        where customer_order.customer_id = p_customer_id
          and customer_order.idempotency_key = p_idempotency_key;
        return pg_catalog.jsonb_build_object(
            'id', existing_order.id,
            'order_number', existing_order.order_number,
            'subtotal', existing_order.subtotal,
            'discount_total', existing_order.discount_total,
            'total', existing_order.total,
            'currency', existing_order.currency,
            'duplicate', true
        );
    end if;

    for input_item in select entries.value from jsonb_array_elements(p_items) as entries(value)
    loop
        item_quantity := (input_item ->> 'quantity')::integer;
        item_instructions := nullif(pg_catalog.btrim(input_item ->> 'special_instructions'), '');

        select menu_item.id, menu_item.name, menu_item.price, menu_item.discount_price
        into menu_record
        from public.menu_items as menu_item
        join public.menu_categories as menu_category
          on menu_category.id = menu_item.category_id
        where menu_item.id = (input_item ->> 'menu_item_id')::uuid;

        actual_unit_price := case
            when menu_record.discount_price is not null
                and menu_record.discount_price >= 0
                and menu_record.discount_price < menu_record.price
            then menu_record.discount_price
            else menu_record.price
        end;

        insert into public.order_items (
            order_id,
            menu_item_id,
            item_name,
            unit_price,
            quantity,
            line_total,
            special_instructions
        ) values (
            created_order.id,
            menu_record.id,
            menu_record.name,
            actual_unit_price,
            item_quantity,
            actual_unit_price * item_quantity,
            item_instructions
        );
    end loop;

    return pg_catalog.jsonb_build_object(
        'id', created_order.id,
        'order_number', created_order.order_number,
        'subtotal', created_order.subtotal,
        'discount_total', created_order.discount_total,
        'total', created_order.total,
        'currency', created_order.currency,
        'duplicate', false
    );
end;
$$;

revoke all on function public.create_dine_in_order(uuid, uuid, uuid, jsonb, text)
from public, anon, authenticated;
grant execute on function public.create_dine_in_order(uuid, uuid, uuid, jsonb, text)
to service_role;
comment on function public.create_dine_in_order(uuid, uuid, uuid, jsonb, text) is
    'Atomically creates a pending counter-payment order after verifying active table and available menu items. A valid discount_price (non-null, non-negative, and less than regular price) is charged; otherwise regular price applies. Expected prices only detect cart changes.';

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
    returning customer_order.id into cancelled_id;

    if cancelled_id is not null then
        return 'cancelled';
    end if;

    if exists (
        select 1 from public.orders as customer_order
        where customer_order.id = p_order_id
          and customer_order.customer_id = p_customer_id
    ) then
        return 'not_cancellable';
    end if;

    return 'not_found';
end;
$$;

revoke all on function public.cancel_customer_order(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.cancel_customer_order(uuid, uuid)
to service_role;

commit;