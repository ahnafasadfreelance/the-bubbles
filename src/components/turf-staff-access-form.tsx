"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function TurfStaffAccessForm({ isOwner }: { isOwner: boolean }) {
    const [email, setEmail] = useState("");
    const [role, setRole] = useState<"full_admin" | "turf_manager">("turf_manager");
    const [active, setActive] = useState(true);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        setMessage(null);
        try {
            const supabase = createClient();
            const { error: rpcError } = await supabase.rpc("turf_assign_staff_by_email", {
                p_target_email: email.trim(),
                p_role: role,
                p_active: active,
                p_reason: reason.trim(),
            });
            if (rpcError) {
                console.error("Turf staff role provisioning was rejected.", {
                    code: rpcError.code,
                    message: rpcError.message,
                });
                throw new Error(rpcError.code === "42501"
                    ? "You are not authorized to assign that role."
                    : rpcError.code === "22023"
                        ? "No unique, verified Google-authenticated account was found for that email."
                        : rpcError.code === "PGRST202" || rpcError.code === "PGRST203"
                            ? "The email-based turf staff function is not available in Supabase yet. Apply the staff email provisioning migration, then reload the Supabase API schema."
                        : "Could not provision this account. Verify the email and role permissions.");
            }
            setMessage(active ? "Turf staff access was provisioned and audited." : "Turf staff access was deactivated and audited.");
            setEmail("");
            setReason("");
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "Turf staff access could not be changed.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="mt-5 max-w-xl space-y-4">
            <label className="block text-sm font-semibold">Existing verified Google account email
                <input required type="email" autoComplete="email" maxLength={254} value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-1 min-h-11 w-full rounded-lg border border-[#cbd9d0] px-3 text-sm" />
                <span className="mt-1 block text-xs font-normal text-[#6a8176]">The person must already have signed in with Google using this email.</span>
            </label>
            <label className="block text-sm font-semibold">Turf role
                <select value={role} onChange={(event) => setRole(event.target.value as "full_admin" | "turf_manager")}
                    className="mt-1 min-h-11 w-full rounded-lg border border-[#cbd9d0] bg-white px-3 text-sm text-[#102b22]">
                    {isOwner ? <option value="full_admin" className="bg-white text-[#102b22]">Full Admin</option> : null}
                    <option value="turf_manager" className="bg-white text-[#102b22]">Turf Manager</option>
                </select>
                {!isOwner ? <span className="mt-1 block text-xs font-normal text-[#6a8176]">Only the existing Owner can grant Turf Full Admin.</span> : null}
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="accent-emerald-700" />
                Active (untick to deactivate existing access)
            </label>
            <label className="block text-sm font-semibold">Reason (required)
                <input required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)}
                    className="mt-1 min-h-11 w-full rounded-lg border border-[#cbd9d0] px-3 text-sm" />
            </label>
            {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
            {message ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p> : null}
            <button type="submit" disabled={busy || reason.trim().length < 3}
                className="min-h-11 rounded-lg bg-[#087a4a] px-5 text-sm font-bold text-white disabled:opacity-50">
                {busy ? "Saving access…" : "Save turf access"}
            </button>
        </form>
    );
}
