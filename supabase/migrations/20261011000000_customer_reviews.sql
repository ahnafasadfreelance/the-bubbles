begin;

create table public.customer_reviews (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null unique references public.orders(id) on delete restrict,
    customer_id uuid not null references auth.users(id) on delete restrict,
    rating smallint not null check (rating between 1 and 5),
    comment text check (
        comment is null
        or (
            char_length(comment) <= 2000
            and pg_catalog.replace(
                pg_catalog.replace(pg_catalog.replace(comment, E'\n', ''), E'\r', ''),
                E'\t',
                ''
            ) !~ '[[:cntrl:]]'
        )
    ),
    created_at timestamptz not null default pg_catalog.now()
);

create index customer_reviews_created_idx
    on public.customer_reviews (created_at desc, id desc);
create index customer_reviews_rating_created_idx
    on public.customer_reviews (rating, created_at desc, id desc);
create index customer_reviews_customer_created_idx
    on public.customer_reviews (customer_id, created_at desc);

create table public.customer_review_dismissals (
    order_id uuid primary key references public.orders(id) on delete restrict,
    customer_id uuid not null references auth.users(id) on delete restrict,
    dismissed_at timestamptz not null default pg_catalog.now()
);

alter table public.customer_reviews enable row level security;
alter table public.customer_review_dismissals enable row level security;
revoke all privileges on table public.customer_reviews, public.customer_review_dismissals
    from public, anon, authenticated;
grant select, insert on table public.customer_reviews to service_role;
grant select, insert on table public.customer_review_dismissals to service_role;

create function public.customer_review_prompt_state(
    p_customer_id uuid,
    p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    order_status text;
begin
    if p_customer_id is null or p_order_id is null then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid');
    end if;

    select customer_order.status into order_status
    from public.orders as customer_order
    where customer_order.id = p_order_id
      and customer_order.customer_id = p_customer_id;

    if not found then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found');
    end if;
    if order_status <> 'completed' then
        return pg_catalog.jsonb_build_object('ok', true, 'state', 'not_completed');
    end if;
    if exists (
        select 1 from public.customer_reviews as customer_review
        where customer_review.order_id = p_order_id
    ) then
        return pg_catalog.jsonb_build_object('ok', true, 'state', 'reviewed');
    end if;
    if exists (
        select 1 from public.customer_review_dismissals as dismissal
        where dismissal.order_id = p_order_id
          and dismissal.customer_id = p_customer_id
    ) then
        return pg_catalog.jsonb_build_object('ok', true, 'state', 'dismissed');
    end if;
    return pg_catalog.jsonb_build_object('ok', true, 'state', 'eligible');
end;
$$;

create function public.submit_customer_review(
    p_customer_id uuid,
    p_order_id uuid,
    p_rating integer,
    p_comment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    order_status text;
    inserted_review public.customer_reviews%rowtype;
    cleaned_comment text := nullif(pg_catalog.btrim(p_comment), '');
begin
    if p_customer_id is null or p_order_id is null
       or p_rating is null or p_rating not between 1 and 5
       or (p_comment is not null and (
           char_length(p_comment) > 2000
           or pg_catalog.replace(
               pg_catalog.replace(pg_catalog.replace(p_comment, E'\n', ''), E'\r', ''),
               E'\t',
               ''
           ) ~ '[[:cntrl:]]'
       )) then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid');
    end if;

    select customer_order.status into order_status
    from public.orders as customer_order
    where customer_order.id = p_order_id
      and customer_order.customer_id = p_customer_id
    for update;

    if not found then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found');
    end if;
    if order_status <> 'completed' then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_completed');
    end if;

    begin
        insert into public.customer_reviews (order_id, customer_id, rating, comment)
        values (p_order_id, p_customer_id, p_rating, cleaned_comment)
        returning * into inserted_review;
    exception when unique_violation then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'already_reviewed');
    end;

    return pg_catalog.jsonb_build_object(
        'ok', true,
        'review', pg_catalog.jsonb_build_object(
            'id', inserted_review.id,
            'order_id', inserted_review.order_id,
            'rating', inserted_review.rating,
            'created_at', inserted_review.created_at
        )
    );
end;
$$;

create function public.dismiss_customer_review_prompt(
    p_customer_id uuid,
    p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    order_status text;
begin
    if p_customer_id is null or p_order_id is null then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid');
    end if;

    select customer_order.status into order_status
    from public.orders as customer_order
    where customer_order.id = p_order_id
      and customer_order.customer_id = p_customer_id
    for update;

    if not found then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found');
    end if;
    if order_status <> 'completed' then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_completed');
    end if;
    if exists (
        select 1 from public.customer_reviews as customer_review
        where customer_review.order_id = p_order_id
    ) then
        return pg_catalog.jsonb_build_object('ok', true, 'state', 'reviewed');
    end if;

    insert into public.customer_review_dismissals (order_id, customer_id)
    values (p_order_id, p_customer_id)
    on conflict (order_id) do nothing;
    return pg_catalog.jsonb_build_object('ok', true, 'state', 'dismissed');
end;
$$;

create function public.admin_customer_reviews(
    p_search text default null,
    p_rating integer default null,
    p_sort text default 'newest',
    p_offset integer default 0,
    p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    requested_search text := nullif(pg_catalog.btrim(p_search), '');
    bounded_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
    bounded_offset integer := least(greatest(coalesce(p_offset, 0), 0), 100000);
    result jsonb;
begin
    if requested_search is not null and (
        char_length(requested_search) > 80
        or requested_search ~ '[[:cntrl:]]'
    ) then
        raise exception 'Invalid review search.' using errcode = '22023';
    end if;
    if p_rating is not null and p_rating not between 1 and 5 then
        raise exception 'Invalid review rating.' using errcode = '22023';
    end if;
    if p_sort is null or p_sort not in ('newest', 'oldest', 'highest', 'lowest') then
        raise exception 'Invalid review sort.' using errcode = '22023';
    end if;

    with all_reviews as (
        select customer_review.id, customer_review.order_id, customer_review.customer_id,
            customer_review.rating, customer_review.comment, customer_review.created_at
        from public.customer_reviews as customer_review
    ),
    metrics as (
        select count(*)::integer as total_reviews,
            coalesce(round(avg(rating)::numeric, 1), 0) as average_rating,
            count(*) filter (where rating = 5)::integer as five_star_reviews,
            count(*) filter (where created_at >= pg_catalog.now() - interval '30 days')::integer as recent_reviews
        from all_reviews
    ),
    distribution as (
        select stars.rating,
            count(all_reviews.id)::integer as review_count,
            case when (select total_reviews from metrics) = 0 then 0
                else round(100.0 * count(all_reviews.id) / (select total_reviews from metrics), 1)
            end as percentage
        from generate_series(1, 5) as stars(rating)
        left join all_reviews on all_reviews.rating = stars.rating
        group by stars.rating
    ),
    filtered as (
        select customer_review.*, customer_order.order_number,
            customer_order.table_number_snapshot, customer_order.table_name_snapshot,
            customer_order.total, customer_order.currency,
            customer_profile.display_name
        from all_reviews as customer_review
        join public.orders as customer_order on customer_order.id = customer_review.order_id
        left join public.customer_profiles as customer_profile
            on customer_profile.id = customer_review.customer_id
        where (p_rating is null or customer_review.rating = p_rating)
          and (
              requested_search is null
              or pg_catalog.strpos(pg_catalog.lower(customer_order.order_number), pg_catalog.lower(requested_search)) > 0
              or pg_catalog.strpos(pg_catalog.lower(customer_review.customer_id::text), pg_catalog.lower(requested_search)) > 0
          )
    ),
    review_page as (
        select filtered.*
        from filtered
        order by
            case when p_sort = 'newest' then filtered.created_at end desc,
            case when p_sort = 'oldest' then filtered.created_at end asc,
            case when p_sort = 'highest' then filtered.rating end desc,
            case when p_sort = 'lowest' then filtered.rating end asc,
            filtered.created_at desc,
            filtered.id desc
        limit bounded_limit offset bounded_offset
    )
    select pg_catalog.jsonb_build_object(
        'metrics', (select pg_catalog.to_jsonb(metrics) from metrics),
        'distribution', coalesce((
            select pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                    'rating', distribution.rating,
                    'count', distribution.review_count,
                    'percentage', distribution.percentage
                ) order by distribution.rating desc
            )
            from distribution
        ), '[]'::jsonb),
        'total_filtered', (select count(*)::integer from filtered),
        'reviews', coalesce((
            select pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                    'id', review_page.id,
                    'order_id', review_page.order_id,
                    'order_number', review_page.order_number,
                    'customer_id', review_page.customer_id,
                    'customer_name', coalesce(
                        nullif(pg_catalog.btrim(review_page.display_name), ''),
                        'Customer ' || pg_catalog.left(review_page.customer_id::text, 8)
                    ),
                    'rating', review_page.rating,
                    'comment', review_page.comment,
                    'created_at', review_page.created_at,
                    'table_number', review_page.table_number_snapshot,
                    'table_name', review_page.table_name_snapshot,
                    'order_total', review_page.total,
                    'currency', review_page.currency
                ) order by
                    case when p_sort = 'newest' then review_page.created_at end desc,
                    case when p_sort = 'oldest' then review_page.created_at end asc,
                    case when p_sort = 'highest' then review_page.rating end desc,
                    case when p_sort = 'lowest' then review_page.rating end asc,
                    review_page.created_at desc,
                    review_page.id desc
            )
            from review_page
        ), '[]'::jsonb)
    ) into result;

    return result;
end;
$$;

revoke all on function public.customer_review_prompt_state(uuid, uuid)
    from public, anon, authenticated;
revoke all on function public.submit_customer_review(uuid, uuid, integer, text)
    from public, anon, authenticated;
revoke all on function public.dismiss_customer_review_prompt(uuid, uuid)
    from public, anon, authenticated;
revoke all on function public.admin_customer_reviews(text, integer, text, integer, integer)
    from public, anon, authenticated;
grant execute on function public.customer_review_prompt_state(uuid, uuid) to service_role;
grant execute on function public.submit_customer_review(uuid, uuid, integer, text) to service_role;
grant execute on function public.dismiss_customer_review_prompt(uuid, uuid) to service_role;
grant execute on function public.admin_customer_reviews(text, integer, text, integer, integer) to service_role;

comment on table public.customer_reviews is
    'One customer rating per completed order. Inserts are restricted to server-validated review RPCs.';
comment on table public.customer_review_dismissals is
    'Persists a customer dismissal so the completed-order review prompt does not reopen.';
comment on function public.admin_customer_reviews(text, integer, text, integer, integer) is
    'Returns review analytics and a bounded filtered page. Application code must authorize the configured admin before calling with service_role.';

commit;
