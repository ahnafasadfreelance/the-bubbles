begin;

create table public.ordering_sessions (
    id uuid primary key default gen_random_uuid(),
    table_id uuid not null references public.restaurant_tables(id) on delete cascade,
    token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
    created_at timestamptz not null,
    expires_at timestamptz not null,
    revoked_at timestamptz,
    constraint ordering_sessions_expiry_after_creation check (expires_at > created_at)
);

create index ordering_sessions_table_expiry_idx
    on public.ordering_sessions (table_id, expires_at desc);
create index ordering_sessions_expiry_idx
    on public.ordering_sessions (expires_at);

alter table public.ordering_sessions enable row level security;
revoke all privileges on table public.ordering_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.ordering_sessions to service_role;

create or replace function public.create_qr_ordering_session(
    p_table_id uuid,
    p_token_hash text
)
returns table (
    id uuid,
    created_at timestamptz,
    expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    session_start timestamptz := pg_catalog.clock_timestamp();
begin
    if p_table_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'Invalid ordering session.' using errcode = '22023';
    end if;

    delete from public.ordering_sessions as ordering_session
    where ordering_session.expires_at <= session_start
       or ordering_session.revoked_at is not null;

    perform 1
    from public.restaurant_tables as restaurant_table
    where restaurant_table.id = p_table_id
      and restaurant_table.is_active
    for share;

    if not found then
        raise exception 'TABLE_UNAVAILABLE' using errcode = 'P0001';
    end if;

    return query
    insert into public.ordering_sessions as ordering_session (
        table_id,
        token_hash,
        created_at,
        expires_at
    ) values (
        p_table_id,
        p_token_hash,
        session_start,
        session_start + interval '10 minutes'
    )
    returning ordering_session.id, ordering_session.created_at, ordering_session.expires_at;
end;
$$;

create or replace function public.create_dine_in_order_with_session(
    p_customer_id uuid,
    p_table_id uuid,
    p_idempotency_key uuid,
    p_items jsonb,
    p_customer_note text,
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
begin
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

    return public.create_dine_in_order(
        p_customer_id,
        p_table_id,
        p_idempotency_key,
        p_items,
        p_customer_note
    );
end;
$$;

revoke all on function public.create_qr_ordering_session(uuid, text)
    from public, anon, authenticated;
revoke all on function public.create_dine_in_order_with_session(uuid, uuid, uuid, jsonb, text, uuid, text)
    from public, anon, authenticated;
revoke all on function public.create_dine_in_order(uuid, uuid, uuid, jsonb, text)
    from public, anon, authenticated, service_role;
grant execute on function public.create_qr_ordering_session(uuid, text) to service_role;
grant execute on function public.create_dine_in_order_with_session(uuid, uuid, uuid, jsonb, text, uuid, text)
    to service_role;

comment on table public.ordering_sessions is
    'Short-lived server-validated dine-in ordering sessions created from an active permanent table QR code. Only the server service role can access these records.';
comment on function public.create_qr_ordering_session(uuid, text) is
    'Creates a 10-minute ordering session only for an active restaurant table. Execution is restricted to the server service role.';
comment on function public.create_dine_in_order_with_session(uuid, uuid, uuid, jsonb, text, uuid, text) is
    'Validates a matching, unrevoked, unexpired table ordering session in the same transaction before delegating secure order creation.';

commit;
