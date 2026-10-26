import { NextResponse } from "next/server";
import { createPrivilegedClient } from "@/lib/supabase/privileged-server";
import { createClient } from "@/lib/supabase/server";
import { safeLocalPath } from "@/lib/supabase/redirects";

export async function GET(request: Request) {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");
    const tokenHash = requestUrl.searchParams.get("token_hash");
    const type = requestUrl.searchParams.get("type");
    const next = safeLocalPath(requestUrl.searchParams.get("next"), "/");

    if (type === "invite" && (!tokenHash || code)) {
        const login = new URL("/login", requestUrl.origin);
        login.searchParams.set("error", "callback_failed");
        login.searchParams.set("next", next);
        return NextResponse.redirect(login);
    }
    if (!code && !(tokenHash && type === "invite")) {
        const providerError = requestUrl.searchParams.get("error");
        const providerErrorCode = requestUrl.searchParams.get("error_code");
        const error = providerError === "access_denied" || providerErrorCode === "user_cancelled"
            ? "cancelled"
            : "callback_failed";
        const login = new URL("/login", requestUrl.origin);
        login.searchParams.set("error", error);
        login.searchParams.set("next", next);
        return NextResponse.redirect(login);
    }

    try {
        const supabase = await createClient();
        const { data, error } = code
            ? await supabase.auth.exchangeCodeForSession(code)
            : await supabase.auth.verifyOtp({ type: "invite", token_hash: tokenHash! });
        if (error) {
            const login = new URL("/login", requestUrl.origin);
            login.searchParams.set("error", "callback_failed");
            login.searchParams.set("next", next);
            return NextResponse.redirect(login);
        }
        if (data.user?.email && data.user.email_confirmed_at) {
            const privileged = createPrivilegedClient();
            const { data: activationResult, error: activationResultError } = await privileged.rpc("admin_activate_invited_staff", {
                p_user_id: data.user.id,
            });
            const activationNotFound = activationResult
                && typeof activationResult === "object"
                && "reason" in activationResult
                && activationResult.reason === "not_found";
            if (activationResultError || (!activationNotFound && (
                !activationResult
                || typeof activationResult !== "object"
                || !("ok" in activationResult)
                || activationResult.ok !== true
            ))) {
                const login = new URL("/login", requestUrl.origin);
                login.searchParams.set("error", "callback_failed");
                login.searchParams.set("next", next);
                return NextResponse.redirect(login);
            }
            if (type === "invite" && activationNotFound) {
                const login = new URL("/login", requestUrl.origin);
                login.searchParams.set("error", "callback_failed");
                login.searchParams.set("next", next);
                return NextResponse.redirect(login);
            }
        } else if (type === "invite") {
            const login = new URL("/login", requestUrl.origin);
            login.searchParams.set("error", "callback_failed");
            login.searchParams.set("next", next);
            return NextResponse.redirect(login);
        }
    } catch {
        const login = new URL("/login", requestUrl.origin);
        login.searchParams.set("error", "callback_failed");
        login.searchParams.set("next", next);
        return NextResponse.redirect(login);
    }

    return NextResponse.redirect(new URL(next, requestUrl.origin));
}