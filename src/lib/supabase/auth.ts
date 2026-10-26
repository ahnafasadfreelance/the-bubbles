import { createClient } from "./client";

export async function signInWithGoogle(redirectTo: string) {
    const supabase = createClient();

    return supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
    });
}