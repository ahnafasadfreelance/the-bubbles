"use client";

import { LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";

import { signInWithGoogle } from "@/lib/supabase/auth";
import { safeLocalPath } from "@/lib/supabase/redirects";

export function GoogleSignInButton({ next }: { next: string }) {
    const [isStarting, setIsStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const isStartingRef = useRef(false);

    async function startSignIn() {
        if (isStartingRef.current) return;
        isStartingRef.current = true;
        setIsStarting(true);
        setError(null);

        try {
            const callback = new URL("/auth/callback", window.location.origin);
            callback.searchParams.set("next", safeLocalPath(next, "/"));
            const { error: signInError } = await signInWithGoogle(callback.toString());
            if (signInError) {
                setError("Google sign-in could not be started. Check the Supabase provider setup and try again.");
                isStartingRef.current = false;
                setIsStarting(false);
            }
        } catch {
            setError("Google sign-in could not be started. Check the Supabase provider setup and try again.");
            isStartingRef.current = false;
            setIsStarting(false);
        }
    }

    return (
        <div>
            <button
                type="button"
                onClick={startSignIn}
                disabled={isStarting}
                aria-busy={isStarting}
                aria-describedby={error ? "google-sign-in-error" : undefined}
                className="flex min-h-14 w-full items-center justify-center gap-3 rounded-full border border-[#36c8ff]/45 bg-[#078bff] px-5 py-3 text-base font-semibold text-white shadow-[0_10px_35px_rgba(0,137,255,0.2)] transition-[background-color,box-shadow,transform] duration-200 hover:bg-[#0879e8] hover:shadow-[0_12px_38px_rgba(0,137,255,0.3)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5bdcff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#04152b] disabled:cursor-wait disabled:opacity-75 lg:min-h-[3.25rem] lg:text-sm"
            >
                {isStarting ? (
                    <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white">
                        <svg className="h-6 w-6" viewBox="0 0 24 24" aria-hidden="true">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.75 3.28-8.09Z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
                            <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84Z" />
                            <path fill="#EA4335" d="M12 5.36c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.99 14.97 1 12 1a11 11 0 0 0-9.82 6.07L5.84 9.9C6.71 7.3 9.14 5.36 12 5.36Z" />
                        </svg>
                    </span>
                )}
                {isStarting ? "Connecting to Google..." : "Continue with Google"}
            </button>
            {error ? <p id="google-sign-in-error" role="alert" className="mt-3 text-left text-sm leading-5 text-[#ffb9b9]">{error}</p> : null}
        </div>
    );
}