begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = pg_catalog.now();
    return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create table public.restaurant_settings (
    id smallint primary key default 1 check (id = 1),
    name text not null check (char_length(btrim(name)) > 0),
    logo_url text,
    cover_image_url text,
    description text,
    address text,
    phone text,
    email text,
    opening_hours jsonb not null default '{}'::jsonb
        check (jsonb_typeof(opening_hours) = 'object'),
    social_links jsonb not null default '{}'::jsonb
        check (jsonb_typeof(social_links) = 'object'),
    currency text not null default 'BDT'
        check (currency ~ '^[A-Z]{3}$'),
    is_published boolean not null default false,
    created_at timestamptz not null default pg_catalog.now(),
    updated_at timestamptz not null default pg_catalog.now()
);

create table public.menu_categories (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(btrim(name)) > 0),
    slug text not null unique
        check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    description text,
    image_url text,
    display_order integer not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default pg_catalog.now(),
    updated_at timestamptz not null default pg_catalog.now()
);

create table public.menu_items (
    id uuid primary key default gen_random_uuid(),
    category_id uuid not null
        references public.menu_categories(id) on delete restrict,
    name text not null check (char_length(btrim(name)) > 0),
    slug text not null unique
        check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    description text,
    image_url text,
    price numeric(10, 2) not null
        check (price >= 0 and price <> 'NaN'::numeric),
    discount_price numeric(10, 2)
        check (discount_price is null or (discount_price >= 0 and discount_price < price)),
    preparation_time_minutes integer not null default 0
        check (preparation_time_minutes >= 0),
    is_available boolean not null default true,
    is_featured boolean not null default false,
    display_order integer not null default 0,
    created_at timestamptz not null default pg_catalog.now(),
    updated_at timestamptz not null default pg_catalog.now()
);

create index menu_categories_active_order_idx
    on public.menu_categories (display_order, name)
    where is_active;

create index menu_items_available_category_order_idx
    on public.menu_items (category_id, display_order, name);

create trigger restaurant_settings_set_updated_at
before update on public.restaurant_settings
for each row execute function private.set_updated_at();

create trigger menu_categories_set_updated_at
before update on public.menu_categories
for each row execute function private.set_updated_at();

create trigger menu_items_set_updated_at
before update on public.menu_items
for each row execute function private.set_updated_at();

alter table public.restaurant_settings enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;

create policy "Public can read published restaurant settings"
    on public.restaurant_settings
    for select
    to anon, authenticated
    using (is_published);

create policy "Public can read active menu categories"
    on public.menu_categories
    for select
    to anon, authenticated
    using (is_active);

create policy "Public can read available items in active categories"
    on public.menu_items
    for select
    to anon, authenticated
    using (
        is_available
        and exists (
            select 1
            from public.menu_categories as category
            where category.id = menu_items.category_id
              and category.is_active
        )
    );

revoke all privileges on table
    public.restaurant_settings,
    public.menu_categories,
    public.menu_items
from public, anon, authenticated;

grant select on table
    public.restaurant_settings,
    public.menu_categories,
    public.menu_items
to anon, authenticated;

commit;
