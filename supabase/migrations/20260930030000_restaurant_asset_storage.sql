begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'restaurant-assets',
    'restaurant-assets',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
    if not exists (
        select 1
        from pg_catalog.pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'Public can read restaurant assets'
    ) then
        create policy "Public can read restaurant assets"
            on storage.objects
            for select
            to anon, authenticated
            using (bucket_id = 'restaurant-assets');
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'Customers cannot insert restaurant assets'
    ) then
        create policy "Customers cannot insert restaurant assets"
            on storage.objects as restrictive
            for insert
            to anon, authenticated
            with check (bucket_id <> 'restaurant-assets');
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'Customers cannot update restaurant assets'
    ) then
        create policy "Customers cannot update restaurant assets"
            on storage.objects as restrictive
            for update
            to anon, authenticated
            using (bucket_id <> 'restaurant-assets')
            with check (bucket_id <> 'restaurant-assets');
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'Customers cannot delete restaurant assets'
    ) then
        create policy "Customers cannot delete restaurant assets"
            on storage.objects as restrictive
            for delete
            to anon, authenticated
            using (bucket_id <> 'restaurant-assets');
    end if;
end;
$$;

comment on policy "Public can read restaurant assets" on storage.objects is
    'Restaurant photos are public. Restrictive policies prevent anon/authenticated insert, update, or delete even if another permissive policy exists; uploads use the server-only administrator endpoint.';

commit;