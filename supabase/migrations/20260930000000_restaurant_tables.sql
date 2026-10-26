begin;

create table public.restaurant_tables (
    id uuid primary key default gen_random_uuid(),
    table_number text not null unique
        check (
            char_length(table_number) between 1 and 64
            and table_number = btrim(table_number)
        ),
    table_name text
        check (table_name is null or char_length(table_name) <= 120),
    qr_token text not null unique
        check (qr_token ~ '^[A-Za-z0-9_-]{43}$'),
    is_active boolean not null default true,
    created_at timestamptz not null default pg_catalog.now(),
    updated_at timestamptz not null default pg_catalog.now()
);

create trigger restaurant_tables_set_updated_at
before update on public.restaurant_tables
for each row execute function private.set_updated_at();

alter table public.restaurant_tables enable row level security;

revoke all privileges on table public.restaurant_tables
from public, anon, authenticated;

grant select, insert, update, delete on table public.restaurant_tables
to service_role;

commit;