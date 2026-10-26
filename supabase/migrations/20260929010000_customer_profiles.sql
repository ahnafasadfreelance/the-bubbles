begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.customer_profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text check (display_name is null or char_length(display_name) <= 200),
    avatar_url text check (
        avatar_url is null
        or (char_length(avatar_url) <= 2048 and avatar_url ~ '^https://')
    ),
    created_at timestamptz not null default pg_catalog.now(),
    updated_at timestamptz not null default pg_catalog.now()
);

create trigger customer_profiles_set_updated_at
before update on public.customer_profiles
for each row execute function private.set_updated_at();

create or replace function private.create_customer_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    profile_name text;
    profile_avatar text;
begin
    profile_name := nullif(pg_catalog.btrim(pg_catalog.left(
        coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
        200
    )), '');

    profile_avatar := coalesce(
        new.raw_user_meta_data ->> 'avatar_url',
        new.raw_user_meta_data ->> 'picture'
    );

    if profile_avatar is not null and profile_avatar !~ '^https://' then
        profile_avatar := null;
    end if;

    insert into public.customer_profiles (id, display_name, avatar_url)
    values (new.id, profile_name, pg_catalog.left(profile_avatar, 2048))
    on conflict (id) do nothing;

    return new;
end;
$$;

revoke all on function private.create_customer_profile() from public, anon, authenticated;

insert into public.customer_profiles (id, display_name, avatar_url)
select
    users.id,
    nullif(pg_catalog.btrim(pg_catalog.left(
        coalesce(users.raw_user_meta_data ->> 'full_name', users.raw_user_meta_data ->> 'name'),
        200
    )), ''),
    case
        when coalesce(users.raw_user_meta_data ->> 'avatar_url', users.raw_user_meta_data ->> 'picture') ~ '^https://'
        then pg_catalog.left(coalesce(users.raw_user_meta_data ->> 'avatar_url', users.raw_user_meta_data ->> 'picture'), 2048)
        else null
    end
from auth.users as users
on conflict (id) do nothing;

create trigger auth_user_create_customer_profile
after insert on auth.users
for each row execute function private.create_customer_profile();

alter table public.customer_profiles enable row level security;

revoke all privileges on table public.customer_profiles from public, anon, authenticated;
grant select on table public.customer_profiles to authenticated;
grant update (display_name, avatar_url) on table public.customer_profiles to authenticated;

create policy "Customers can read their own profile"
    on public.customer_profiles
    for select
    to authenticated
    using ((select auth.uid()) = id);

create policy "Customers can update their own profile"
    on public.customer_profiles
    for update
    to authenticated
    using ((select auth.uid()) = id)
    with check ((select auth.uid()) = id);

commit;