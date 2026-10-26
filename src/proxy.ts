import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseConfig, isSupabaseConfigured } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

export async function proxy(request: NextRequest) {
    if (!isSupabaseConfigured()) return NextResponse.next({ request });

    const { url, anonKey } = getSupabaseConfig();
    let response = NextResponse.next({ request });
    const supabase = createServerClient<Database>(url, anonKey, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                response = NextResponse.next({ request });
                cookiesToSet.forEach(({ name, value, options }) => {
                    response.cookies.set(name, value, options);
                });
            },
        },
    });

    try {
        await supabase.auth.getUser();
    } catch {
        return response;
    }

    return response;
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};