import { SiteHeaderClient } from "@/components/site-header-client";
import { getAdminAccess } from "@/lib/admin-auth";
import type { RestaurantSettings } from "@/lib/restaurant-data";
import { getCurrentCustomer } from "@/lib/supabase/auth-server";

export async function SiteHeader({ restaurant }: { restaurant: RestaurantSettings }) {
    const [customer, adminAccess] = await Promise.all([
        getCurrentCustomer(),
        getAdminAccess(),
    ]);

    return <SiteHeaderClient
        restaurant={restaurant}
        initialCustomer={customer}
        initialAdminUserId={adminAccess.kind === "authorized" ? adminAccess.user.id : null}
    />;
}