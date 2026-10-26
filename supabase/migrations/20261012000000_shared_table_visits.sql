begin;

create table public.table_visits (
    id uuid primary key default gen_random_uuid(),
    table_id uuid not null references public.restaurant_tables(id) on delete cascade,
    started_at timestamptz not null default pg_catalog.clock_timestamp(),
    order_window_expires_at timestamptz not null,
    last_activity_at timestamptz not null default pg_catalog.clock_timestamp(),
    support_cooldown_until timestamptz,
    closed_at timestamptz,
    closure_reason text check (closure_reason is null or closure_reason in ('staff', 'inactivity')),
    constraint table_visits_order_window_check check (order_window_expires_at > started_at),
    constraint table_visits_closed_reason_check check ((closed_at is null) = (closure_reason is null))
);

create unique index table_visits_one_open_per_table_idx
    on public.table_visits (table_id) where closed_at is null;
create index table_visits_last_activity_idx
    on public.table_visits (last_activity_at) where closed_at is null;

alter table public.ordering_sessions
    add column visit_id uuid references public.table_visits(id) on delete cascade;
create index ordering_sessions_visit_idx on public.ordering_sessions (visit_id);

create table public.table_visit_support_requests (
    id uuid primary key default gen_random_uuid(),
    visit_id uuid not null references public.table_visits(id) on delete cascade,
    request_type text not null check (request_type in ('waiter', 'bill', 'water_cutlery')),
    customer_message text check (customer_message is null or char_length(customer_message) <= 500),
    status text not null default 'pending' check (status in ('pending', 'acknowledged', 'resolved')),
    created_at timestamptz not null default pg_catalog.clock_timestamp(),
    updated_at timestamptz not null default pg_catalog.clock_timestamp()
);

create index table_visit_support_requests_visit_created_idx
    on public.table_visit_support_requests (visit_id, created_at desc);
create index table_visit_support_requests_open_idx
    on public.table_visit_support_requests (created_at desc) where status <> 'resolved';

create trigger table_visit_support_requests_set_updated_at
before update on public.table_visit_support_requests
for each row execute function private.set_updated_at();

create table public.table_visit_messages (
    id uuid primary key default gen_random_uuid(),
    visit_id uuid not null references public.table_visits(id) on delete cascade,
    sender_type text not null check (sender_type in ('customer', 'staff')),
    sender_id uuid references auth.users(id) on delete set null,
    sender_name text not null check (char_length(sender_name) between 1 and 80),
    body text not null check (char_length(body) between 1 and 1000),
    created_at timestamptz not null default pg_catalog.clock_timestamp()
);

create index table_visit_messages_visit_created_idx
    on public.table_visit_messages (visit_id, created_at desc);

alter table public.table_visits enable row level security;
alter table public.table_visit_support_requests enable row level security;
alter table public.table_visit_messages enable row level security;
revoke all privileges on table public.table_visits, public.table_visit_support_requests, public.table_visit_messages
    from public, anon, authenticated;
grant select, insert, update, delete on table public.table_visits, public.table_visit_support_requests, public.table_visit_messages
    to service_role;
grant select, insert, update, delete on table public.ordering_sessions to service_role;

create or replace function private.expire_stale_table_visits()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    expired_count integer;
begin
    update public.table_visits
    set closed_at = pg_catalog.clock_timestamp(),
        closure_reason = 'inactivity'
    where closed_at is null
      and last_activity_at <= pg_catalog.clock_timestamp() - interval '90 minutes';
    get diagnostics expired_count = row_count;
    return expired_count;
end;
$$;

revoke all on function private.expire_stale_table_visits() from public, anon, authenticated;
grant execute on function private.expire_stale_table_visits() to service_role;

drop function public.create_qr_ordering_session(uuid, text);

create function public.create_qr_ordering_session(
    p_table_id uuid,
    p_token_hash text
)
returns table (
    id uuid,
    created_at timestamptz,
    expires_at timestamptz,
    visit_id uuid,
    visit_started_at timestamptz,
    order_window_expires_at timestamptz,
    last_activity_at timestamptz,
    support_cooldown_until timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_now timestamptz := pg_catalog.clock_timestamp();
    current_visit public.table_visits%rowtype;
    access_session public.ordering_sessions%rowtype;
begin
    if p_table_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'Invalid ordering session.' using errcode = '22023';
    end if;

    perform private.expire_stale_table_visits();
    delete from public.ordering_sessions as expired_session
    where expired_session.expires_at <= v_now or expired_session.revoked_at is not null;

    perform 1
    from public.restaurant_tables as restaurant_table
    where restaurant_table.id = p_table_id
      and restaurant_table.is_active
    for update;

    if not found then
        raise exception 'TABLE_UNAVAILABLE' using errcode = 'P0001';
    end if;

    select table_visit.*
    into current_visit
    from public.table_visits as table_visit
    where table_visit.table_id = p_table_id
      and table_visit.closed_at is null
    for update;

    if not found then
        insert into public.table_visits (table_id, order_window_expires_at)
        values (p_table_id, v_now + interval '10 minutes')
        returning * into current_visit;
    elsif current_visit.order_window_expires_at <= v_now then
        update public.table_visits
        set order_window_expires_at = v_now + interval '10 minutes'
        where table_visits.id = current_visit.id
        returning * into current_visit;
    end if;

    insert into public.ordering_sessions (
        table_id, token_hash, created_at, expires_at, revoked_at, visit_id
    ) values (
        p_table_id, p_token_hash, v_now, v_now + interval '24 hours', null, current_visit.id
    )
    returning * into access_session;

    return query select
        access_session.id,
        access_session.created_at,
        access_session.expires_at,
        current_visit.id,
        current_visit.started_at,
        current_visit.order_window_expires_at,
        current_visit.last_activity_at,
        current_visit.support_cooldown_until;
end;
$$;

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
    matching_visit public.table_visits%rowtype;
    created_result jsonb;
    v_now timestamptz := pg_catalog.clock_timestamp();
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

    perform private.expire_stale_table_visits();

    select ordering_session.*
    into matching_session
    from public.ordering_sessions as ordering_session
    where ordering_session.id = p_session_id
      and ordering_session.table_id = p_table_id
      and ordering_session.token_hash = p_session_token_hash
      and ordering_session.revoked_at is null
      and ordering_session.expires_at > v_now
      and ordering_session.visit_id is not null
    for share;
    if not found then
        raise exception 'ORDERING_SESSION_EXPIRED' using errcode = 'P0001';
    end if;

    select table_visit.*
    into matching_visit
    from public.table_visits as table_visit
    where table_visit.id = matching_session.visit_id
      and table_visit.table_id = p_table_id
      and table_visit.closed_at is null
      and table_visit.last_activity_at > v_now - interval '90 minutes'
      and table_visit.order_window_expires_at > v_now
    for update;
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

    update public.table_visits
    set last_activity_at = v_now
    where id = matching_visit.id
      and closed_at is null;

    return created_result;
end;
$$;

create or replace function public.get_table_visit_state(
    p_session_id uuid,
    p_session_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    matching_session public.ordering_sessions%rowtype;
    matching_visit public.table_visits%rowtype;
    v_now timestamptz := pg_catalog.clock_timestamp();
begin
    perform private.expire_stale_table_visits();
    select ordering_session.*
    into matching_session
    from public.ordering_sessions as ordering_session
    where ordering_session.id = p_session_id
      and ordering_session.token_hash = p_session_token_hash
      and ordering_session.revoked_at is null
      and ordering_session.expires_at > v_now
      and ordering_session.visit_id is not null;
    if not found then
        return pg_catalog.jsonb_build_object('active', false);
    end if;
    select table_visit.*
    into matching_visit
    from public.table_visits as table_visit
    where table_visit.id = matching_session.visit_id
      and table_visit.closed_at is null
      and table_visit.last_activity_at > v_now - interval '90 minutes';
    if not found then
        return pg_catalog.jsonb_build_object('active', false);
    end if;
    return pg_catalog.jsonb_build_object(
        'active', true,
        'visitId', matching_visit.id,
        'startedAt', matching_visit.started_at,
        'orderWindowExpiresAt', matching_visit.order_window_expires_at,
        'lastActivityAt', matching_visit.last_activity_at,
        'visitExpiresAt', matching_visit.last_activity_at + interval '90 minutes',
        'supportCooldownUntil', matching_visit.support_cooldown_until,
        'serverNow', v_now
    );
end;
$$;

create or replace function public.create_table_visit_support_request(
    p_session_id uuid,
    p_session_token_hash text,
    p_request_type text,
    p_customer_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    matching_session public.ordering_sessions%rowtype;
    matching_visit public.table_visits%rowtype;
    created_request public.table_visit_support_requests%rowtype;
    v_now timestamptz := pg_catalog.clock_timestamp();
begin
    if p_request_type is null or p_request_type not in ('waiter', 'bill', 'water_cutlery')
        or (p_customer_message is not null and char_length(p_customer_message) > 500) then
        raise exception 'INVALID_SUPPORT_REQUEST' using errcode = '22023';
    end if;
    perform private.expire_stale_table_visits();
    select ordering_session.* into matching_session
    from public.ordering_sessions as ordering_session
    where ordering_session.id = p_session_id and ordering_session.token_hash = p_session_token_hash
      and ordering_session.revoked_at is null and ordering_session.expires_at > v_now
      and ordering_session.visit_id is not null;
    if not found then raise exception 'TABLE_VISIT_CLOSED' using errcode = 'P0001'; end if;
    select table_visit.* into matching_visit
    from public.table_visits as table_visit
    where table_visit.id = matching_session.visit_id and table_visit.closed_at is null
      and table_visit.last_activity_at > v_now - interval '90 minutes'
    for update;
    if not found then raise exception 'TABLE_VISIT_CLOSED' using errcode = 'P0001'; end if;
    if matching_visit.support_cooldown_until is not null and matching_visit.support_cooldown_until > v_now then
        return pg_catalog.jsonb_build_object(
            'ok', false, 'reason', 'cooldown',
            'cooldownUntil', matching_visit.support_cooldown_until
        );
    end if;
    insert into public.table_visit_support_requests (visit_id, request_type, customer_message)
    values (matching_visit.id, p_request_type, nullif(pg_catalog.btrim(p_customer_message), ''))
    returning * into created_request;
    update public.table_visits
    set last_activity_at = v_now, support_cooldown_until = v_now + interval '90 seconds'
    where id = matching_visit.id;
    return pg_catalog.jsonb_build_object('ok', true, 'requestId', created_request.id);
end;
$$;

create or replace function public.send_table_visit_message(
    p_session_id uuid,
    p_session_token_hash text,
    p_sender_name text,
    p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    matching_session public.ordering_sessions%rowtype;
    matching_visit public.table_visits%rowtype;
    created_message public.table_visit_messages%rowtype;
    v_now timestamptz := pg_catalog.clock_timestamp();
begin
    if p_sender_name is null or char_length(pg_catalog.btrim(p_sender_name)) not between 1 and 80
        or p_body is null or char_length(pg_catalog.btrim(p_body)) not between 1 and 1000 then
        raise exception 'INVALID_MESSAGE' using errcode = '22023';
    end if;
    perform private.expire_stale_table_visits();
    select ordering_session.* into matching_session
    from public.ordering_sessions as ordering_session
    where ordering_session.id = p_session_id and ordering_session.token_hash = p_session_token_hash
      and ordering_session.revoked_at is null and ordering_session.expires_at > v_now
      and ordering_session.visit_id is not null;
    if not found then raise exception 'TABLE_VISIT_CLOSED' using errcode = 'P0001'; end if;
    select table_visit.* into matching_visit
    from public.table_visits as table_visit
    where table_visit.id = matching_session.visit_id and table_visit.closed_at is null
      and table_visit.last_activity_at > v_now - interval '90 minutes'
    for update;
    if not found then raise exception 'TABLE_VISIT_CLOSED' using errcode = 'P0001'; end if;
    if matching_visit.support_cooldown_until is not null and matching_visit.support_cooldown_until > v_now then
        return pg_catalog.jsonb_build_object(
            'ok', false, 'reason', 'cooldown',
            'cooldownUntil', matching_visit.support_cooldown_until
        );
    end if;
    insert into public.table_visit_messages (visit_id, sender_type, sender_name, body)
    values (matching_visit.id, 'customer', pg_catalog.btrim(p_sender_name), pg_catalog.btrim(p_body))
    returning * into created_message;
    update public.table_visits
    set last_activity_at = v_now, support_cooldown_until = v_now + interval '90 seconds'
    where id = matching_visit.id;
    return pg_catalog.jsonb_build_object('ok', true, 'messageId', created_message.id);
end;
$$;

create or replace function public.admin_reply_to_table_visit(
    p_visit_id uuid,
    p_staff_id uuid,
    p_staff_name text,
    p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    active_visit public.table_visits%rowtype;
    v_now timestamptz := pg_catalog.clock_timestamp();
    created_message public.table_visit_messages%rowtype;
begin
    if p_staff_id is null or p_staff_name is null
        or char_length(pg_catalog.btrim(p_staff_name)) not between 1 and 80
        or p_body is null or char_length(pg_catalog.btrim(p_body)) not between 1 and 1000 then
        raise exception 'INVALID_MESSAGE' using errcode = '22023';
    end if;
    select table_visit.* into active_visit
    from public.table_visits as table_visit
    where table_visit.id = p_visit_id and table_visit.closed_at is null
      and table_visit.last_activity_at > v_now - interval '90 minutes'
    for update;
    if not found then return pg_catalog.jsonb_build_object('ok', false, 'reason', 'visit_closed'); end if;
    insert into public.table_visit_messages (visit_id, sender_type, sender_id, sender_name, body)
    values (p_visit_id, 'staff', p_staff_id, pg_catalog.btrim(p_staff_name), pg_catalog.btrim(p_body))
    returning * into created_message;
    update public.table_visits set last_activity_at = v_now where id = p_visit_id;
    return pg_catalog.jsonb_build_object('ok', true, 'messageId', created_message.id);
end;
$$;

create or replace function public.admin_update_table_support_request(
    p_request_id uuid,
    p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    support_request public.table_visit_support_requests%rowtype;
    active_visit public.table_visits%rowtype;
    v_now timestamptz := pg_catalog.clock_timestamp();
begin
    if p_status is null or p_status not in ('acknowledged', 'resolved') then
        raise exception 'INVALID_SUPPORT_STATUS' using errcode = '22023';
    end if;
    select request.* into support_request
    from public.table_visit_support_requests as request
    where request.id = p_request_id
    for update;
    if not found then return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
    select table_visit.* into active_visit
    from public.table_visits as table_visit
    where table_visit.id = support_request.visit_id and table_visit.closed_at is null
      and table_visit.last_activity_at > v_now - interval '90 minutes'
    for update;
    if not found then return pg_catalog.jsonb_build_object('ok', false, 'reason', 'visit_closed'); end if;
    update public.table_visit_support_requests
    set status = p_status
    where id = p_request_id;
    update public.table_visits set last_activity_at = v_now where id = active_visit.id;
    return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_close_table_visit(p_visit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    closed_count integer;
begin
    update public.table_visits
    set closed_at = pg_catalog.clock_timestamp(), closure_reason = 'staff'
    where id = p_visit_id and closed_at is null;
    get diagnostics closed_count = row_count;
    return pg_catalog.jsonb_build_object('ok', closed_count = 1);
end;
$$;

revoke all on function public.get_table_visit_state(uuid, text)
    from public, anon, authenticated;
revoke all on function public.create_qr_ordering_session(uuid, text)
    from public, anon, authenticated;
revoke all on function public.create_table_visit_support_request(uuid, text, text, text)
    from public, anon, authenticated;
revoke all on function public.send_table_visit_message(uuid, text, text, text)
    from public, anon, authenticated;
revoke all on function public.admin_reply_to_table_visit(uuid, uuid, text, text)
    from public, anon, authenticated;
revoke all on function public.admin_update_table_support_request(uuid, text)
    from public, anon, authenticated;
revoke all on function public.admin_close_table_visit(uuid)
    from public, anon, authenticated;
revoke all on function public.create_dine_in_order_with_payment(uuid, uuid, uuid, jsonb, text, uuid, text, text)
    from public, anon, authenticated;
grant execute on function public.create_qr_ordering_session(uuid, text) to service_role;
grant execute on function public.get_table_visit_state(uuid, text) to service_role;
grant execute on function public.create_table_visit_support_request(uuid, text, text, text) to service_role;
grant execute on function public.send_table_visit_message(uuid, text, text, text) to service_role;
grant execute on function public.admin_reply_to_table_visit(uuid, uuid, text, text) to service_role;
grant execute on function public.admin_update_table_support_request(uuid, text) to service_role;
grant execute on function public.admin_close_table_visit(uuid) to service_role;
grant execute on function public.create_dine_in_order_with_payment(uuid, uuid, uuid, jsonb, text, uuid, text, text)
    to service_role;
revoke execute on function public.create_dine_in_order_with_session(uuid, uuid, uuid, jsonb, text, uuid, text)
    from service_role;

comment on table public.table_visits is
    'Shared per-table dining visit. Ordering windows can be renewed by a later QR scan; visit inactivity expires after 90 minutes.';
comment on table public.table_visit_support_requests is
    'Customer help requests shared between the customer table view and staff support inbox.';
comment on table public.table_visit_messages is
    'Customer and staff message history for a shared table visit.';
comment on function private.expire_stale_table_visits() is
    'Closes stale open visits. Called during every visit scan, state read, and customer action; meaningful orders and support activity extend the timeout.';

commit;
