-- Replace this clearly identified prototype data before publishing a restaurant menu.
begin;

insert into public.restaurant_settings (
    id,
    name,
    description,
    address,
    phone,
    email,
    opening_hours,
    social_links,
    currency,
    is_published
)
values (
    1,
    'Blue Table',
    'Sample restaurant profile for the Blue Table prototype. Replace before publishing.',
    null,
    null,
    null,
    '{}'::jsonb,
    '{}'::jsonb,
    'BDT',
    false
)
on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    address = excluded.address,
    phone = excluded.phone,
    email = excluded.email,
    opening_hours = excluded.opening_hours,
    social_links = excluded.social_links,
    currency = excluded.currency,
    is_published = excluded.is_published;

insert into public.menu_categories (
    id, name, slug, description, image_url, display_order, is_active
)
values
    (
        '10000000-0000-4000-8000-000000000001',
        'Burgers',
        'burgers',
        'Sample category for the Blue Table prototype.',
        'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=900&q=80',
        1,
        true
    ),
    (
        '10000000-0000-4000-8000-000000000002',
        'Pizza',
        'pizza',
        'Sample category for the Blue Table prototype.',
        'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=80',
        2,
        true
    ),
    (
        '10000000-0000-4000-8000-000000000003',
        'Pasta',
        'pasta',
        'Sample category for the Blue Table prototype.',
        'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=900&q=80',
        3,
        true
    ),
    (
        '10000000-0000-4000-8000-000000000004',
        'Drinks',
        'drinks',
        'Sample category for the Blue Table prototype.',
        'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=900&q=80',
        4,
        true
    ),
    (
        '10000000-0000-4000-8000-000000000005',
        'Desserts',
        'desserts',
        'Sample category for the Blue Table prototype.',
        'https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=900&q=80',
        5,
        true
    )
on conflict (id) do update set
    name = excluded.name,
    slug = excluded.slug,
    description = excluded.description,
    image_url = excluded.image_url,
    display_order = excluded.display_order,
    is_active = excluded.is_active;

insert into public.menu_items (
    id,
    category_id,
    name,
    slug,
    description,
    image_url,
    price,
    preparation_time_minutes,
    is_available,
    is_featured,
    display_order
)
values
    (
        '20000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        'Classic Beef Burger',
        'classic-beef-burger',
        'Juicy grilled beef, fresh lettuce, tomato, onion, and signature house sauce.',
        'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80',
        320.00,
        20,
        true,
        true,
        1
    ),
    (
        '20000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000002',
        'Margherita Pizza',
        'margherita-pizza',
        'Mozzarella, basil, and ripe tomatoes on a hand-stretched crust.',
        'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=80',
        450.00,
        25,
        true,
        true,
        1
    ),
    (
        '20000000-0000-4000-8000-000000000003',
        '10000000-0000-4000-8000-000000000003',
        'Creamy Alfredo Pasta',
        'creamy-alfredo-pasta',
        'Creamy parmesan Alfredo sauce, tossed with pasta and finished with herbs.',
        'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=900&q=80',
        380.00,
        18,
        true,
        true,
        1
    ),
    (
        '20000000-0000-4000-8000-000000000004',
        '10000000-0000-4000-8000-000000000005',
        'Chocolate Lava Cake',
        'chocolate-lava-cake',
        'Warm chocolate cake with a molten center, served with vanilla cream.',
        'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=900&q=80',
        250.00,
        12,
        true,
        true,
        1
    ),
    (
        '20000000-0000-4000-8000-000000000005',
        '10000000-0000-4000-8000-000000000004',
        'Citrus Mint Cooler',
        'citrus-mint-cooler',
        'Sample sparkling citrus drink with mint and fresh lime.',
        'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=900&q=80',
        180.00,
        5,
        true,
        false,
        1
    )
on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    slug = excluded.slug,
    description = excluded.description,
    image_url = excluded.image_url,
    price = excluded.price,
    preparation_time_minutes = excluded.preparation_time_minutes,
    is_available = excluded.is_available,
    is_featured = excluded.is_featured,
    display_order = excluded.display_order;

commit;
