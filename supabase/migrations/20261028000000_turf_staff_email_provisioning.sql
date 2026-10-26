begin;

create or replace function public.turf_assign_staff_by_email(
    p_target_email text,
    p_role text,
    p_active boolean,
    p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    actor_role text;
    target_user_id uuid;
    target_email text;
    matching_accounts integer;
    previous_membership jsonb;
begin
    if actor_id is null or auth.role() <> 'authenticated'
       or p_target_email is null
       or char_length(pg_catalog.btrim(p_target_email)) not between 3 and 254
       or p_target_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
       or p_role is null or p_role not in ('full_admin', 'turf_manager')
       or p_active is null
       or p_reason is null or char_length(pg_catalog.btrim(p_reason)) not between 3 and 500 then
        raise exception 'Staff assignment details are invalid.' using errcode = '22023';
    end if;

    select membership.role into actor_role
      from public.restaurant_staff_memberships as membership
     where membership.restaurant_id = 1
       and membership.user_id = actor_id
       and membership.status = 'active';
    if actor_role is null or actor_role not in ('owner', 'full_admin')
       or (p_role = 'full_admin' and actor_role <> 'owner') then
        raise exception 'Only an authorized existing restaurant administrator can provision turf staff.'
            using errcode = '42501';
    end if;

    select count(*)::integer,
           (pg_catalog.array_agg(auth_user.id order by auth_user.id))[1],
           (pg_catalog.array_agg(auth_user.email order by auth_user.id))[1]
      into matching_accounts, target_user_id, target_email
      from auth.users as auth_user
     where pg_catalog.lower(auth_user.email) = pg_catalog.lower(pg_catalog.btrim(p_target_email))
       and auth_user.email_confirmed_at is not null
       and auth_user.raw_app_meta_data ->> 'provider' = 'google';
    if matching_accounts <> 1 or target_user_id is null or target_user_id = actor_id then
        raise exception 'A unique, existing verified Google-authenticated account is required.'
            using errcode = '22023';
    end if;

    select pg_catalog.to_jsonb(membership) into previous_membership
      from public.turf_staff_memberships as membership
     where membership.user_id = target_user_id;
    insert into public.turf_staff_memberships (user_id, role, status, assigned_by)
    values (target_user_id, p_role, case when p_active then 'active' else 'deactivated' end, actor_id)
    on conflict (user_id) do update
       set role = excluded.role, status = excluded.status,
           assigned_by = actor_id, assigned_at = pg_catalog.now(), updated_at = pg_catalog.now();

    insert into public.turf_audit_logs (actor_id, action, entity_type, entity_id, reason, details)
    values (
        actor_id, case when p_active then 'staff_assigned' else 'staff_deactivated' end,
        'staff_membership', target_user_id::text,
        pg_catalog.btrim(p_reason),
        pg_catalog.jsonb_build_object(
            'before', previous_membership,
            'after', pg_catalog.jsonb_build_object(
                'role', p_role,
                'status', case when p_active then 'active' else 'deactivated' end,
                'email', target_email
            )
        )
    );
    return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.turf_assign_staff_by_email(text, text, boolean, text) from public, anon;
grant execute on function public.turf_assign_staff_by_email(text, text, boolean, text) to authenticated;

notify pgrst, 'reload schema';

commit;
