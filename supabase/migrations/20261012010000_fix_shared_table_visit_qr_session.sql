begin;

create or replace function public.create_qr_ordering_session(
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
    where expired_session.expires_at <= v_now
       or expired_session.revoked_at is not null;

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

revoke all on function public.create_qr_ordering_session(uuid, text)
    from public, anon, authenticated;
grant execute on function public.create_qr_ordering_session(uuid, text)
    to service_role;

comment on function public.create_qr_ordering_session(uuid, text) is
    'Creates a per-browser access session for the shared table visit. The table visit owns the 10-minute ordering window.';

commit;
