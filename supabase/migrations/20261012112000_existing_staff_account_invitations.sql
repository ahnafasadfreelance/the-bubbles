begin;

create or replace function public.admin_invite_existing_staff_account(
    p_actor_id uuid,
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
    target_user_id uuid;
    target_email text;
begin
    if auth.role() <> 'service_role'
       or p_actor_id is null
       or p_email is null
       or p_email <> pg_catalog.lower(pg_catalog.btrim(p_email))
       or p_role is null
       or p_role not in ('full_admin', 'order_management') then
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

    select auth_user.id, pg_catalog.lower(auth_user.email)
    into target_user_id, target_email
    from auth.users as auth_user
    where pg_catalog.lower(auth_user.email) = p_email
    order by auth_user.created_at
    limit 1;

    if target_user_id is null then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'no_account');
    end if;

    if not exists (
        select 1
        from auth.users as auth_user
        where auth_user.id = target_user_id
          and auth_user.email_confirmed_at is not null
    ) then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'unconfirmed');
    end if;

    if exists (
        select 1
        from public.restaurant_staff_memberships as membership
        where membership.restaurant_id = 1
          and (membership.user_id = target_user_id or membership.email = target_email)
    ) then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'duplicate');
    end if;

    insert into public.restaurant_staff_memberships (
        restaurant_id, user_id, email, role, status, invited_at, created_by, updated_by
    ) values (
        1, target_user_id, target_email, p_role, 'invited', pg_catalog.now(), p_actor_id, p_actor_id
    );
    insert into public.restaurant_admin_audit_log (
        restaurant_id, actor_id, action, target_user_id, target_email, metadata
    ) values (
        1, p_actor_id, 'staff_invited', target_user_id, target_email,
        pg_catalog.jsonb_build_object('role', p_role, 'existing_auth_account', true)
    );

    return pg_catalog.jsonb_build_object('ok', true);
exception
    when unique_violation then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'duplicate');
end;
$$;

revoke all on function public.admin_invite_existing_staff_account(uuid, text, text)
    from public, anon, authenticated;
grant execute on function public.admin_invite_existing_staff_account(uuid, text, text)
    to service_role;

notify pgrst, 'reload schema';

commit;
