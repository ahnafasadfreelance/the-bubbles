import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { customerIdentityFromUser } from "@/lib/supabase/identity";
import type { CustomerIdentity } from "@/lib/supabase/identity";
import { safeLocalPath } from "@/lib/supabase/redirects";

export type { CustomerIdentity } from "@/lib/supabase/identity";

export const getCurrentUser = cache(async (): Promise<User | null> => {
    if (!isSupabaseConfigured()) return null;

    try {
        const supabase = await createClient();
        const { data, error } = await supabase.auth.getUser();
        return error ? null : data.user;
    } catch {
        return null;
    }
});

export async function getCurrentCustomer(): Promise<CustomerIdentity | null> {
    const user = await getCurrentUser();
    return user ? customerIdentityFromUser(user) : null;
}

export async function requireAuthenticatedCustomer(next = "/"): Promise<CustomerIdentity> {
    const customer = await getCurrentCustomer();
    if (customer) return customer;

    const destination = safeLocalPath(next, "/");
    redirect(`/login?next=${encodeURIComponent(destination)}`);
}