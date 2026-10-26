begin;

create or replace function public.turf_customer_bookings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    booking_list jsonb;
begin
    if actor_id is null or auth.role() <> 'authenticated' then
        raise exception 'Sign in to view your turf bookings.' using errcode = '42501';
    end if;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'reference', booking.reference,
        'starts_at', booking.starts_at,
        'ends_at', booking.ends_at,
        'booking_mode', booking.booking_mode,
        'status', booking.status,
        'price', booking.final_price,
        'required_advance', booking.required_advance,
        'currency', booking.currency,
        'payment_deadline', booking.payment_deadline,
        'is_past', booking.ends_at < pg_catalog.now(),
        'created_at', booking.created_at
    ) order by booking.starts_at desc), '[]'::jsonb)
      into booking_list
      from public.turf_bookings as booking
     where booking.customer_id = actor_id;
    return pg_catalog.jsonb_build_object('bookings', booking_list);
end;
$$;

revoke all on function public.turf_customer_bookings() from public, anon;
grant execute on function public.turf_customer_bookings() to authenticated;

notify pgrst, 'reload schema';

commit;
