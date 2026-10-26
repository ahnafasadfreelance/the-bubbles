begin;

create table public.restaurant_staff_memberships (
    id uuid primary key default gen_random_uuid(),
    restaurant_id smallint not null default 1
        references public.restaurant_settings(id) on delete restrict,
    user_id uuid not null references auth.users(id) on delete restrict,
    email text not null check (
        char_length(email) <= 254
        and email = pg_catalog.lower(pg_catalog.btrim(email))
        and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
    role text not null check (role in ('owner', 'full_admin', 'order_management')),
    status text not null default 'invited'
        check (status in ('invited', 'active', 'deactivated')),
    invited_at timestamptz,
    activated_at timestamptz,
    deactivated_at timestamptz,
    created_by uuid references auth.users(id) on delete set null,
    updated_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default pg_catalog.now(),
    updated_at timestamptz not null default pg_catalog.now(),
    constraint restaurant_staff_memberships_restaurant_user_key unique (restaurant_id, user_id),
    constraint restaurant_staff_memberships_status_timestamps check (
        (status <> 'invited' or invited_at is not null)
        and (status <> 'active' or activated_at is not null)
        and (status <> 'deactivated' or deactivated_at is not null)
    )
);

create unique index restaurant_staff_one_active_owner_idx
    on public.restaurant_staff_memberships (restaurant_id)
    where role = 'owner' and status = 'active';
create index restaurant_staff_role_status_idx
    on public.restaurant_staff_memberships (restaurant_id, role, status);
create unique index restaurant_staff_unique_email_idx
    on public.restaurant_staff_memberships (restaurant_id, email);

create table public.restaurant_admin_audit_log (
    id bigint generated always as identity primary key,
    restaurant_id smallint not null default 1
        references public.restaurant_settings(id) on delete restrict,
    actor_id uuid references auth.users(id) on delete set null,
    action text not null check (action in (
        'owner_bootstrapped',
        'staff_invited',
        'staff_role_changed',
        'staff_deactivated',
        'staff_reactivated',
        'staff_activated',
        'restaurant_settings_changed'
    )),
    target_user_id uuid references auth.users(id) on delete set null,
    target_email text,
    metadata jsonb not null default '{}'::jsonb
        check (jsonb_typeof(metadata) = 'object'),
    created_at timestamptz not null default pg_catalog.now()
);

create index restaurant_admin_audit_log_created_idx
    on public.restaurant_admin_audit_log (restaurant_id, created_at desc, id desc);

create or replace function private.staff_has_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.restaurant_staff_memberships as membership
        where membership.restaurant_id = 1
          and membership.user_id = auth.uid()
          and membership.status = 'active'
          and membership.role = any(p_roles)
    );
$$;

revoke all on function private.staff_has_role(text[]) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.staff_has_role(text[]) to authenticated, service_role;

alter table public.restaurant_staff_memberships enable row level security;
alter table public.restaurant_admin_audit_log enable row level security;

revoke all privileges on table public.restaurant_staff_memberships,
    public.restaurant_admin_audit_log from public, anon, authenticated;
grant select on table public.restaurant_staff_memberships to authenticated;
grant select on table public.restaurant_staff_memberships to service_role;
grant select, insert on table public.restaurant_admin_audit_log to service_role;

create policy "Staff can read only their own membership"
    on public.restaurant_staff_memberships
    for select
    to authenticated
    using (user_id = (select auth.uid()));

create policy "Active staff can read restaurant tables"
    on public.restaurant_tables
    for select
    to authenticated
    using (private.staff_has_role(array['owner', 'full_admin', 'order_management']));

create policy "Active staff can read table visits"
    on public.table_visits
    for select
    to authenticated
    using (private.staff_has_role(array['owner', 'full_admin', 'order_management']));

create policy "Active staff can read support requests"
    on public.table_visit_support_requests
    for select
    to authenticated
    using (private.staff_has_role(array['owner', 'full_admin', 'order_management']));

create policy "Active staff can read support messages"
    on public.table_visit_messages
    for select
    to authenticated
    using (private.staff_has_role(array['owner', 'full_admin', 'order_management']));

revoke all privileges on table public.restaurant_admin_audit_log
    from public, anon, authenticated;

create or replace function private.prevent_admin_audit_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    raise exception 'Administrative audit records are immutable.'
        using errcode = '42501';
end;
$$;

revoke all on function private.prevent_admin_audit_log_mutation() from public, anon, authenticated;

create trigger restaurant_admin_audit_log_immutable
before update or delete on public.restaurant_admin_audit_log
for each row execute function private.prevent_admin_audit_log_mutation();

create trigger restaurant_staff_memberships_set_updated_at
before update on public.restaurant_staff_memberships
for each row execute function private.set_updated_at();

create or replace function public.admin_create_staff_invitation(
    p_actor_id uuid,
    p_user_id uuid,
    p_email text,
    p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_role text;
    auth_email text;
begin
    if auth.role() <> 'service_role' or p_actor_id is null or p_user_id is null
       or p_role is null or p_role not in ('full_admin', 'order_management')
       or p_email is null or p_email <> pg_catalog.lower(pg_catalog.btrim(p_email)) then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid');
    end if;

    select membership.role into actor_role
    from public.restaurant_staff_memberships as membership
    where membership.restaurant_id = 1
      and membership.user_id = p_actor_id
      and membership.status = 'active';
    if actor_role is null
       or (p_role = 'full_admin' and actor_role <> 'owner')
       or (p_role = 'order_management' and actor_role not in ('owner', 'full_admin')) then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthorized');
    end if;

    select pg_catalog.lower(auth_user.email) into auth_email
    from auth.users as auth_user
    where auth_user.id = p_user_id
      and auth_user.email is not null;
    if auth_email is null or auth_email <> p_email then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid');
    end if;
    if exists (
        select 1
        from public.restaurant_staff_memberships as membership
        where membership.restaurant_id = 1
          and (membership.user_id = p_user_id or membership.email = p_email)
    ) then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'duplicate');
    end if;

    insert into public.restaurant_staff_memberships (
        restaurant_id, user_id, email, role, status, invited_at, created_by, updated_by
    ) values (
        1, p_user_id, p_email, p_role, 'invited', pg_catalog.now(), p_actor_id, p_actor_id
    );
    insert into public.restaurant_admin_audit_log (
        restaurant_id, actor_id, action, target_user_id, target_email, metadata
    ) values (
        1, p_actor_id, 'staff_invited', p_user_id, p_email,
        pg_catalog.jsonb_build_object('role', p_role)
    );

    return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_update_staff_membership(
    p_actor_id uuid,
    p_target_user_id uuid,
    p_role text default null,
    p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_role text;
    target public.restaurant_staff_memberships%rowtype;
    next_role text;
    next_status text;
begin
    if auth.role() <> 'service_role' or p_actor_id is null or p_target_user_id is null
       or (p_role is not null and p_role not in ('full_admin', 'order_management'))
       or (p_status is not null and p_status not in ('deactivated', 'active')) then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid');
    end if;
    if p_actor_id = p_target_user_id then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'self_change');
    end if;

    select membership.role into actor_role
    from public.restaurant_staff_memberships as membership
    where membership.restaurant_id = 1
      and membership.user_id = p_actor_id
      and membership.status = 'active';
    if actor_role is null then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthorized');
    end if;

    select membership.* into target
    from public.restaurant_staff_memberships as membership
    where membership.restaurant_id = 1
      and membership.user_id = p_target_user_id
    for update;
    if not found then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found');
    end if;
    if target.role = 'owner'
       or (actor_role = 'full_admin' and target.role <> 'order_management')
       or (actor_role not in ('owner', 'full_admin')) then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthorized');
    end if;
    if p_role = 'full_admin' and actor_role <> 'owner' then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthorized');
    end if;

    next_role := coalesce(p_role, target.role);
    next_status := coalesce(p_status, target.status);
    if p_status = 'active' and target.status <> 'deactivated' then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid');
    end if;
    if p_status = 'deactivated' and target.status = 'deactivated' then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid');
    end if;

    update public.restaurant_staff_memberships as membership
    set role = next_role,
        status = next_status,
        activated_at = case when p_status = 'active' then pg_catalog.now() else membership.activated_at end,
        deactivated_at = case when p_status = 'deactivated' then pg_catalog.now()
                              when p_status = 'active' then null
                              else membership.deactivated_at end,
        updated_by = p_actor_id
    where membership.id = target.id;

    if p_role is not null and p_role <> target.role then
        insert into public.restaurant_admin_audit_log (
            restaurant_id, actor_id, action, target_user_id, target_email, metadata
        ) values (
            1, p_actor_id, 'staff_role_changed', target.user_id, target.email,
            pg_catalog.jsonb_build_object('previous_role', target.role, 'role', p_role)
        );
    end if;
    if p_status = 'deactivated' then
        insert into public.restaurant_admin_audit_log (
            restaurant_id, actor_id, action, target_user_id, target_email, metadata
        ) values (1, p_actor_id, 'staff_deactivated', target.user_id, target.email, '{}'::jsonb);
    elsif p_status = 'active' then
        insert into public.restaurant_admin_audit_log (
            restaurant_id, actor_id, action, target_user_id, target_email, metadata
        ) values (1, p_actor_id, 'staff_reactivated', target.user_id, target.email, '{}'::jsonb);
    end if;

    return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_activate_invited_staff(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    invited public.restaurant_staff_memberships%rowtype;
begin
    if auth.role() <> 'service_role' or p_user_id is null then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid');
    end if;
    update public.restaurant_staff_memberships as membership
    set status = 'active',
        activated_at = pg_catalog.now(),
        updated_by = p_user_id
    where membership.restaurant_id = 1
      and membership.user_id = p_user_id
      and membership.status = 'invited'
      and exists (
          select 1
          from auth.users as auth_user
          where auth_user.id = membership.user_id
            and auth_user.email_confirmed_at is not null
            and pg_catalog.lower(auth_user.email) = membership.email
      )
    returning membership.* into invited;
    if not found then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found');
    end if;
    insert into public.restaurant_admin_audit_log (
        restaurant_id, actor_id, action, target_user_id, target_email, metadata
    ) values (
        1, p_user_id, 'staff_activated', p_user_id, invited.email,
        pg_catalog.jsonb_build_object('role', invited.role)
    );
    return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_create_staff_invitation(uuid, uuid, text, text)
    from public, anon, authenticated;
grant execute on function public.admin_create_staff_invitation(uuid, uuid, text, text) to service_role;
revoke all on function public.admin_update_staff_membership(uuid, uuid, text, text)
    from public, anon, authenticated;
grant execute on function public.admin_update_staff_membership(uuid, uuid, text, text) to service_role;
revoke all on function public.admin_activate_invited_staff(uuid)
    from public, anon, authenticated;
grant execute on function public.admin_activate_invited_staff(uuid) to service_role;

commit;
