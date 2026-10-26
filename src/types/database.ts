export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

import type { OrderStatus } from "@/lib/order-status";

export type Database = {
    public: {
        Tables: {
            ordering_sessions: {
                Row: {
                    id: string;
                    table_id: string;
                    token_hash: string;
                    created_at: string;
                    expires_at: string;
                    revoked_at: string | null;
                    visit_id: string | null;
                };
                Insert: {
                    id?: string;
                    table_id: string;
                    token_hash: string;
                    created_at: string;
                    expires_at: string;
                    revoked_at?: string | null;
                    visit_id?: string | null;
                };
                Update: {
                    id?: string;
                    table_id?: string;
                    token_hash?: string;
                    created_at?: string;
                    expires_at?: string;
                    revoked_at?: string | null;
                    visit_id?: string | null;
                };
                Relationships: [];
            };
            table_visits: {
                Row: {
                    id: string;
                    table_id: string;
                    started_at: string;
                    order_window_expires_at: string;
                    last_activity_at: string;
                    support_cooldown_until: string | null;
                    closed_at: string | null;
                    closure_reason: string | null;
                };
                Insert: {
                    id?: string;
                    table_id: string;
                    started_at?: string;
                    order_window_expires_at: string;
                    last_activity_at?: string;
                    support_cooldown_until?: string | null;
                    closed_at?: string | null;
                    closure_reason?: string | null;
                };
                Update: {
                    id?: string;
                    table_id?: string;
                    started_at?: string;
                    order_window_expires_at?: string;
                    last_activity_at?: string;
                    support_cooldown_until?: string | null;
                    closed_at?: string | null;
                    closure_reason?: string | null;
                };
                Relationships: [];
            };
            table_visit_support_requests: {
                Row: {
                    id: string;
                    visit_id: string;
                    request_type: string;
                    customer_message: string | null;
                    status: string;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    visit_id: string;
                    request_type: string;
                    customer_message?: string | null;
                    status?: string;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    visit_id?: string;
                    request_type?: string;
                    customer_message?: string | null;
                    status?: string;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };
            table_visit_messages: {
                Row: {
                    id: string;
                    visit_id: string;
                    sender_type: string;
                    sender_id: string | null;
                    sender_name: string;
                    body: string;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    visit_id: string;
                    sender_type: string;
                    sender_id?: string | null;
                    sender_name: string;
                    body: string;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    visit_id?: string;
                    sender_type?: string;
                    sender_id?: string | null;
                    sender_name?: string;
                    body?: string;
                    created_at?: string;
                };
                Relationships: [];
            };
            customer_profiles: {
                Row: {
                    id: string;
                    display_name: string | null;
                    avatar_url: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id: string;
                    display_name?: string | null;
                    avatar_url?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    display_name?: string | null;
                    avatar_url?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };
            restaurant_tables: {
                Row: {
                    id: string;
                    table_number: string;
                    table_name: string | null;
                    qr_token: string;
                    is_active: boolean;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    table_number: string;
                    table_name?: string | null;
                    qr_token: string;
                    is_active?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    table_number?: string;
                    table_name?: string | null;
                    qr_token?: string;
                    is_active?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };
            restaurant_settings: {
                Row: {
                    id: number;
                    name: string;
                    logo_url: string | null;
                    cover_image_url: string | null;
                    description: string | null;
                    about_text: string | null;
                    address: string | null;
                    phone: string | null;
                    email: string | null;
                    opening_hours: Json;
                    social_links: Json;
                    currency: string;
                    is_published: boolean;
                    is_ordering_enabled: boolean;
                    ordering_disabled_message: string | null;
                    dine_in_enabled: boolean;
                    allow_customer_cancellation: boolean;
                    default_preparation_minutes: number;
                    time_zone: string;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: number;
                    name: string;
                    logo_url?: string | null;
                    cover_image_url?: string | null;
                    description?: string | null;
                    about_text?: string | null;
                    address?: string | null;
                    phone?: string | null;
                    email?: string | null;
                    opening_hours?: Json;
                    social_links?: Json;
                    currency?: string;
                    is_published?: boolean;
                    is_ordering_enabled?: boolean;
                    ordering_disabled_message?: string | null;
                    dine_in_enabled?: boolean;
                    allow_customer_cancellation?: boolean;
                    default_preparation_minutes?: number;
                    time_zone?: string;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: number;
                    name?: string;
                    logo_url?: string | null;
                    cover_image_url?: string | null;
                    description?: string | null;
                    about_text?: string | null;
                    address?: string | null;
                    phone?: string | null;
                    email?: string | null;
                    opening_hours?: Json;
                    social_links?: Json;
                    currency?: string;
                    is_published?: boolean;
                    is_ordering_enabled?: boolean;
                    ordering_disabled_message?: string | null;
                    dine_in_enabled?: boolean;
                    allow_customer_cancellation?: boolean;
                    default_preparation_minutes?: number;
                    time_zone?: string;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };
            restaurant_staff_memberships: {
                Row: {
                    id: string;
                    restaurant_id: number;
                    user_id: string;
                    email: string;
                    role: string;
                    status: string;
                    invited_at: string | null;
                    activated_at: string | null;
                    deactivated_at: string | null;
                    created_by: string | null;
                    updated_by: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    restaurant_id?: number;
                    user_id: string;
                    email: string;
                    role: string;
                    status?: string;
                    invited_at?: string | null;
                    activated_at?: string | null;
                    deactivated_at?: string | null;
                    created_by?: string | null;
                    updated_by?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    restaurant_id?: number;
                    user_id?: string;
                    email?: string;
                    role?: string;
                    status?: string;
                    invited_at?: string | null;
                    activated_at?: string | null;
                    deactivated_at?: string | null;
                    created_by?: string | null;
                    updated_by?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };
            restaurant_admin_audit_log: {
                Row: {
                    id: number;
                    restaurant_id: number;
                    actor_id: string | null;
                    action: string;
                    target_user_id: string | null;
                    target_email: string | null;
                    metadata: Json;
                    created_at: string;
                };
                Insert: {
                    id?: number;
                    restaurant_id?: number;
                    actor_id?: string | null;
                    action: string;
                    target_user_id?: string | null;
                    target_email?: string | null;
                    metadata?: Json;
                    created_at?: string;
                };
                Update: {
                    id?: number;
                    restaurant_id?: number;
                    actor_id?: string | null;
                    action?: string;
                    target_user_id?: string | null;
                    target_email?: string | null;
                    metadata?: Json;
                    created_at?: string;
                };
                Relationships: [];
            };
            menu_categories: {
                Row: {
                    id: string;
                    name: string;
                    slug: string;
                    description: string | null;
                    image_url: string | null;
                    display_order: number;
                    is_active: boolean;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    name: string;
                    slug: string;
                    description?: string | null;
                    image_url?: string | null;
                    display_order?: number;
                    is_active?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    name?: string;
                    slug?: string;
                    description?: string | null;
                    image_url?: string | null;
                    display_order?: number;
                    is_active?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };
            menu_items: {
                Row: {
                    id: string;
                    category_id: string;
                    name: string;
                    slug: string;
                    description: string | null;
                    image_url: string | null;
                    price: number;
                    discount_price: number | null;
                    preparation_time_minutes: number;
                    is_available: boolean;
                    is_featured: boolean;
                    display_order: number;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    category_id: string;
                    name: string;
                    slug: string;
                    description?: string | null;
                    image_url?: string | null;
                    price: number;
                    discount_price?: number | null;
                    preparation_time_minutes?: number;
                    is_available?: boolean;
                    is_featured?: boolean;
                    display_order?: number;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    category_id?: string;
                    name?: string;
                    slug?: string;
                    description?: string | null;
                    image_url?: string | null;
                    price?: number;
                    discount_price?: number | null;
                    preparation_time_minutes?: number;
                    is_available?: boolean;
                    is_featured?: boolean;
                    display_order?: number;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "menu_items_category_id_fkey";
                        columns: ["category_id"];
                        isOneToOne: false;
                        referencedRelation: "menu_categories";
                        referencedColumns: ["id"];
                    },
                ];
            };
            orders: {
                Row: {
                    id: string;
                    order_number: string;
                    idempotency_key: string;
                    customer_id: string;
                    table_id: string;
                    table_number_snapshot: string;
                    table_name_snapshot: string | null;
                    status: OrderStatus;
                    subtotal: number;
                    discount_total: number;
                    total: number;
                    currency: string;
                    payment_method: "counter";
                    preferred_payment_method: "card" | "bkash" | "cash" | null;
                    amount_paid: number;
                    payment_status: "unpaid" | "partially_paid" | "paid" | "refunded";
                    customer_note: string | null;
                    rejection_reason: string | null;
                    estimated_preparation_minutes: number | null;
                    preparation_started_at: string | null;
                    estimated_ready_at: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    order_number: string;
                    idempotency_key: string;
                    customer_id: string;
                    table_id: string;
                    table_number_snapshot: string;
                    table_name_snapshot?: string | null;
                    status?: OrderStatus;
                    subtotal: number;
                    discount_total?: number;
                    total: number;
                    currency: string;
                    payment_method?: "counter";
                    preferred_payment_method?: "card" | "bkash" | "cash" | null;
                    amount_paid?: number;
                    payment_status?: "unpaid" | "partially_paid" | "paid" | "refunded";
                    customer_note?: string | null;
                    rejection_reason?: string | null;
                    estimated_preparation_minutes?: number | null;
                    preparation_started_at?: string | null;
                    estimated_ready_at?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    order_number?: string;
                    idempotency_key?: string;
                    customer_id?: string;
                    table_id?: string;
                    table_number_snapshot?: string;
                    table_name_snapshot?: string | null;
                    status?: OrderStatus;
                    subtotal?: number;
                    discount_total?: number;
                    total?: number;
                    currency?: string;
                    payment_method?: "counter";
                    preferred_payment_method?: "card" | "bkash" | "cash" | null;
                    amount_paid?: number;
                    payment_status?: "unpaid" | "partially_paid" | "paid" | "refunded";
                    customer_note?: string | null;
                    rejection_reason?: string | null;
                    estimated_preparation_minutes?: number | null;
                    preparation_started_at?: string | null;
                    estimated_ready_at?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "orders_table_id_fkey";
                        columns: ["table_id"];
                        isOneToOne: false;
                        referencedRelation: "restaurant_tables";
                        referencedColumns: ["id"];
                    },
                ];
            };
            order_items: {
                Row: {
                    id: string;
                    order_id: string;
                    menu_item_id: string | null;
                    item_name: string;
                    unit_price: number;
                    quantity: number;
                    line_total: number;
                    special_instructions: string | null;
                    preparation_time_minutes_snapshot: number | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    order_id: string;
                    menu_item_id?: string | null;
                    item_name: string;
                    unit_price: number;
                    quantity: number;
                    line_total: number;
                    special_instructions?: string | null;
                    preparation_time_minutes_snapshot?: number | null;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    order_id?: string;
                    menu_item_id?: string | null;
                    item_name?: string;
                    unit_price?: number;
                    quantity?: number;
                    line_total?: number;
                    special_instructions?: string | null;
                    preparation_time_minutes_snapshot?: number | null;
                    created_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "order_items_order_id_fkey";
                        columns: ["order_id"];
                        isOneToOne: false;
                        referencedRelation: "orders";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "order_items_menu_item_id_fkey";
                        columns: ["menu_item_id"];
                        isOneToOne: false;
                        referencedRelation: "menu_items";
                        referencedColumns: ["id"];
                    },
                ];
            };
            customer_reviews: {
                Row: {
                    id: string;
                    order_id: string;
                    customer_id: string;
                    rating: number;
                    comment: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    order_id: string;
                    customer_id: string;
                    rating: number;
                    comment?: string | null;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    order_id?: string;
                    customer_id?: string;
                    rating?: number;
                    comment?: string | null;
                    created_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "customer_reviews_order_id_fkey";
                        columns: ["order_id"];
                        isOneToOne: true;
                        referencedRelation: "orders";
                        referencedColumns: ["id"];
                    },
                ];
            };
            customer_review_dismissals: {
                Row: {
                    order_id: string;
                    customer_id: string;
                    dismissed_at: string;
                };
                Insert: {
                    order_id: string;
                    customer_id: string;
                    dismissed_at?: string;
                };
                Update: {
                    order_id?: string;
                    customer_id?: string;
                    dismissed_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "customer_review_dismissals_order_id_fkey";
                        columns: ["order_id"];
                        isOneToOne: true;
                        referencedRelation: "orders";
                        referencedColumns: ["id"];
                    },
                ];
            };
        };
        Views: { [_ in never]: never         };
        order_payment_collections: {
            Row: {
                id: string;
                order_id: string;
                idempotency_key: string;
                amount: number;
                payment_method: "card" | "bkash" | "cash";
                collected_by: string;
                collected_at: string;
                verification_status: "staff_verified";
                notes: string | null;
                created_at: string;
            };
            Insert: {
                id?: string;
                order_id: string;
                idempotency_key: string;
                amount: number;
                payment_method: "card" | "bkash" | "cash";
                collected_by: string;
                collected_at?: string;
                verification_status?: "staff_verified";
                notes?: string | null;
                created_at?: string;
            };
            Update: {
                id?: string;
                order_id?: string;
                idempotency_key?: string;
                amount?: number;
                payment_method?: "card" | "bkash" | "cash";
                collected_by?: string;
                collected_at?: string;
                verification_status?: "staff_verified";
                notes?: string | null;
                created_at?: string;
            };
            Relationships: [
                {
                    foreignKeyName: "order_payment_collections_order_id_fkey";
                    columns: ["order_id"];
                    isOneToOne: false;
                    referencedRelation: "orders";
                    referencedColumns: ["id"];
                },
            ];
        };
        Functions: {
            turf_create_booking_request: {
                Args: {
                    p_starts_at: string;
                    p_ends_at: string;
                    p_booking_mode: string;
                    p_customer_name: string;
                    p_customer_phone: string;
                    p_player_count: number;
                    p_customer_note: string | null;
                    p_policy_version_id: number;
                    p_policy_accepted: boolean;
                    p_fixed_slot_id?: string | null;
                };
                Returns: Json;
            };
            turf_assign_staff: {
                Args: { p_target_user_id: string; p_role: string; p_active: boolean; p_reason: string };
                Returns: Json;
            };
            turf_assign_staff_by_email: {
                Args: { p_target_email: string; p_role: string; p_active: boolean; p_reason: string };
                Returns: Json;
            };
            turf_review_booking_request: {
                Args: { p_booking_id: string; p_decision: string; p_reason: string | null };
                Returns: Json;
            };
            turf_request_booking_change: {
                Args: {
                    p_booking_id: string;
                    p_request_type: string;
                    p_reason: string;
                    p_requested_starts_at?: string | null;
                    p_requested_ends_at?: string | null;
                };
                Returns: Json;
            };
            turf_review_booking_change: {
                Args: {
                    p_request_id: string;
                    p_decision: string;
                    p_reason: string;
                    p_refund_amount?: number | null;
                    p_refund_method?: string | null;
                    p_refund_reference?: string | null;
                };
                Returns: Json;
            };
            turf_staff_change_requests: {
                Args: Record<string, never>;
                Returns: Json;
            };
            turf_customer_booking_change_requests: {
                Args: { p_booking_id: string };
                Returns: Json;
            };
            turf_customer_notifications: {
                Args: Record<string, never>;
                Returns: Json;
            };
            turf_mark_notification_read: {
                Args: { p_notification_id: number };
                Returns: Json;
            };
            turf_claim_email_notifications: {
                Args: { p_limit?: number };
                Returns: Json;
            };
            turf_finish_email_notification: {
                Args: { p_notification_id: number; p_success: boolean; p_error?: string | null };
                Returns: Json;
            };
            turf_public_day: {
                Args: { p_local_date: string };
                Returns: Json;
            };
            turf_public_week: {
                Args: { p_first_date: string };
                Returns: Json;
            };
            turf_get_booking_tracking: {
                Args: { p_reference: string; p_tracking_token?: string | null };
                Returns: Json;
            };
            turf_customer_bookings: {
                Args: Record<string, never>;
                Returns: Json;
            };
            turf_submit_advance_payment: {
                Args: {
                    p_booking_id: string;
                    p_payment_method: string;
                    p_transaction_reference: string;
                    p_amount: number;
                    p_note: string | null;
                    p_idempotency_key: string;
                };
                Returns: Json;
            };
            turf_review_advance_payment: {
                Args: { p_payment_id: string; p_decision: string; p_reason: string | null };
                Returns: Json;
            };
            turf_current_staff_role: {
                Args: Record<string, never>;
                Returns: string | null;
            };
            turf_staff_dashboard: {
                Args: Record<string, never>;
                Returns: Json;
            };
            turf_staff_settings: {
                Args: Record<string, never>;
                Returns: Json;
            };
            turf_update_settings: {
                Args: {
                    p_hourly_rate: number;
                    p_advance_amount: number;
                    p_minimum_duration_minutes: number;
                    p_duration_increment_minutes: number;
                    p_booking_horizon_days: number;
                    p_request_hold_minutes: number;
                    p_payment_deadline_hours: number;
                    p_minimum_players: number;
                    p_maximum_players: number;
                    p_no_show_grace_minutes: number;
                    p_booking_enabled: boolean;
                    p_reason: string;
                };
                Returns: Json;
            };
            turf_set_weekly_hours: {
                Args: {
                    p_weekday: number;
                    p_is_closed: boolean;
                    p_opens_at: string | null;
                    p_closes_at: string | null;
                    p_reason: string;
                };
                Returns: Json;
            };
            turf_publish_policy: {
                Args: { p_content: string; p_effective_at: string; p_reason: string };
                Returns: Json;
            };
            turf_set_fixed_slot: {
                Args: {
                    p_slot_id: string | null;
                    p_label: string;
                    p_starts_at: string;
                    p_ends_at: string;
                    p_price: number;
                    p_is_active: boolean;
                    p_reason: string;
                };
                Returns: Json;
            };
            turf_set_payment_method: {
                Args: {
                    p_method: string;
                    p_display_name: string;
                    p_account_details: string;
                    p_account_type: string;
                    p_instructions: string;
                    p_is_active: boolean;
                    p_reason: string;
                };
                Returns: Json;
            };
            turf_process_expiries: {
                Args: Record<string, never>;
                Returns: Json;
            };
            admin_create_staff_invitation: {
                Args: { p_actor_id: string; p_user_id: string; p_email: string; p_role: string };
                Returns: Json;
            };
            admin_invite_existing_staff_account: {
                Args: { p_actor_id: string; p_email: string; p_role: string };
                Returns: Json;
            };
            admin_update_staff_membership: {
                Args: { p_actor_id: string; p_target_user_id: string; p_role?: string | null; p_status?: string | null };
                Returns: Json;
            };
            admin_activate_invited_staff: {
                Args: { p_user_id: string };
                Returns: Json;
            };
            admin_reply_to_table_visit: {
                Args: {
                    p_visit_id: string;
                    p_staff_id: string;
                    p_staff_name: string;
                    p_body: string;
                };
                Returns: Json;
            };
            admin_update_table_support_request: {
                Args: { p_request_id: string; p_status: string };
                Returns: Json;
            };
            admin_close_table_visit: {
                Args: { p_visit_id: string };
                Returns: Json;
            };
            get_table_visit_state: {
                Args: { p_session_id: string; p_session_token_hash: string };
                Returns: Json;
            };
            create_table_visit_support_request: {
                Args: {
                    p_session_id: string;
                    p_session_token_hash: string;
                    p_request_type: string;
                    p_customer_message?: string | null;
                };
                Returns: Json;
            };
            send_table_visit_message: {
                Args: {
                    p_session_id: string;
                    p_session_token_hash: string;
                    p_sender_name: string;
                    p_body: string;
                };
                Returns: Json;
            };
            create_qr_ordering_session: {
                Args: { p_table_id: string; p_token_hash: string };
                Returns: {
                    id: string;
                    created_at: string;
                    expires_at: string;
                    visit_id: string;
                    visit_started_at: string;
                    order_window_expires_at: string;
                    last_activity_at: string;
                    support_cooldown_until: string | null;
                }[];
            };
            create_dine_in_order_with_session: {
                Args: {
                    p_customer_id: string;
                    p_table_id: string;
                    p_idempotency_key: string;
                    p_items: Json;
                    p_customer_note: string | null;
                    p_session_id: string;
                    p_session_token_hash: string;
                };
                Returns: Json;
            };
            create_dine_in_order: {
                Args: {
                    p_customer_id: string;
                    p_table_id: string;
                    p_idempotency_key: string;
                    p_items: Json;
                    p_customer_note: string | null;
                };
                Returns: Json;
            };
            create_dine_in_order_with_payment: {
                Args: {
                    p_customer_id: string;
                    p_table_id: string;
                    p_idempotency_key: string;
                    p_items: Json;
                    p_customer_note: string | null;
                    p_session_id: string;
                    p_session_token_hash: string;
                    p_preferred_payment_method: string;
                };
                Returns: Json;
            };
            admin_record_order_payment: {
                Args: {
                    p_order_id: string;
                    p_staff_id: string;
                    p_amount: number;
                    p_payment_method: string;
                    p_notes: string | null;
                    p_idempotency_key: string;
                };
                Returns: Json;
            };
            admin_payment_overview: {
                Args: { p_from_date?: string | null; p_to_date?: string | null };
                Returns: Json;
            };
            admin_order_dashboard_with_payments: {
                Args: {
                    p_status?: string;
                    p_search?: string | null;
                    p_table?: string | null;
                    p_from_date?: string | null;
                    p_to_date?: string | null;
                    p_payment_status?: string;
                    p_payment_method?: string;
                    p_offset?: number;
                    p_limit?: number;
                };
                Returns: Json;
            };
            cancel_customer_order: {
                Args: { p_customer_id: string; p_order_id: string };
                Returns: string;
            };
            admin_order_dashboard: {
                Args: {
                    p_status?: string | null;
                    p_search?: string | null;
                    p_offset?: number;
                    p_limit?: number;
                };
                Returns: Json;
            };
            admin_transition_order: {
                Args: {
                    p_order_id: string;
                    p_expected_status: string;
                    p_next_status: string;
                    p_rejection_reason?: string | null;
                    p_min_minutes: number;
                    p_max_minutes: number;
                };
                Returns: Json;
            };
            admin_set_preparation_estimate: {
                Args: { p_order_id: string; p_expected_status: string; p_minutes: number; p_min_minutes: number; p_max_minutes: number };
                Returns: Json;
            };
            admin_dashboard_order_buckets: {
                Args: Record<string, never>;
                Returns: { bucket_label: string; order_count: number }[];
            };
            admin_order_status_counts: {
                Args: Record<string, never>;
                Returns: { status: string; order_count: number }[];
            };
            customer_review_prompt_state: {
                Args: { p_customer_id: string; p_order_id: string };
                Returns: Json;
            };
            submit_customer_review: {
                Args: { p_customer_id: string; p_order_id: string; p_rating: number; p_comment: string | null };
                Returns: Json;
            };
            dismiss_customer_review_prompt: {
                Args: { p_customer_id: string; p_order_id: string };
                Returns: Json;
            };
            admin_customer_reviews: {
                Args: {
                    p_search?: string | null;
                    p_rating?: number | null;
                    p_sort?: string;
                    p_offset?: number;
                    p_limit?: number;
                };
                Returns: Json;
            };
            admin_order_realtime_enabled: {
                Args: Record<string, never>;
                Returns: boolean;
            };
            admin_customer_directory: {
                Args: { p_search?: string | null; p_sort?: string; p_offset?: number; p_limit?: number };
                Returns: Json;
            };
            admin_customer_order_history: {
                Args: { p_customer_id: string };
                Returns: Json;
            };
            admin_customer_details: {
                Args: { p_customer_id: string };
                Returns: Json;
            };
            admin_customer_count: {
                Args: Record<string, never>;
                Returns: number;
            };
            admin_order_dashboard_filtered: {
                Args: {
                    p_status?: string;
                    p_search?: string | null;
                    p_table?: string | null;
                    p_from_date?: string | null;
                    p_to_date?: string | null;
                    p_payment_status?: string;
                    p_offset?: number;
                    p_limit?: number;
                };
                Returns: Json;
            };
        };
        Enums: { [_ in never]: never };
        CompositeTypes: { [_ in never]: never };
    };
};