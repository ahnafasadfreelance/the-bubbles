"use client";

import { useMemo, useRef, useState, useEffect, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { inviteStaffAction, updateStaffAccessAction, type StaffAuditRecord, type StaffRecord } from "@/app/admin/staff-actions";
import type { AdminRole } from "@/lib/admin-auth";
import { canManageStaffMember } from "@/lib/admin-role-policy";

const ROLE_LABELS: Record<AdminRole, string> = {
    owner: "Owner",
    full_admin: "Full Admin",
    order_management: "Order Management",
};

type PendingChange = { userId: string; email: string; role?: "full_admin" | "order_management"; status?: "active" | "deactivated" };

function statusLabel(status: StaffRecord["status"]) {
    if (status === "invited") return "Invited";
    if (status === "deactivated") return "Deactivated";
    return "Active";
}

function StaffDialog({ open, close, children, title, id }: { open: boolean; close: () => void; children: ReactNode; title: string; id: string }) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const dialog = dialogRef.current;
        if (open && dialog && !dialog.open) dialog.showModal();
        if (!open && dialog?.open) dialog.close();
    }, [open]);
    return (
        <dialog ref={dialogRef} aria-labelledby={id} onCancel={(event) => { event.preventDefault(); close(); }} onClose={close} className="m-auto w-[min(94vw,34rem)] rounded-xl border border-[#1a4465] bg-[#082440] p-0 text-[#f5f9ff] shadow-2xl backdrop:bg-[#020d19]/75">
            <div className="p-5 sm:p-6">
                <div className="mb-5 flex items-start justify-between gap-4">
                    <h2 id={id} className="text-lg font-semibold">{title}</h2>
                    <button type="button" onClick={close} aria-label="Close dialog" className="rounded px-2 py-1 text-sm text-[#a7bfd4] hover:bg-[#123654] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff]">Close</button>
                </div>
                {children}
            </div>
        </dialog>
    );
}

export function StaffAccessPanel({ role, actorUserId, staff, audit }: { role: AdminRole; actorUserId: string; staff: StaffRecord[]; audit: StaffAuditRecord[] }) {
    const router = useRouter();
    const [search, setSearch] = useState("");
    const [inviteOpen, setInviteOpen] = useState(false);
    const [email, setEmail] = useState("");
    const [inviteRole, setInviteRole] = useState<"full_admin" | "order_management">("order_management");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [pending, setPending] = useState<PendingChange | null>(null);
    const [auditOpen, setAuditOpen] = useState(false);

    const filteredStaff = useMemo(() => {
        const query = search.trim().toLowerCase();
        return staff.filter((member) => !query || member.email.toLowerCase().includes(query) || ROLE_LABELS[member.role].toLowerCase().includes(query) || member.status.includes(query));
    }, [search, staff]);
    const mayGrantFullAdmin = role === "owner";

    async function invite(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError("");
        setMessage("");
        try {
            const result = await inviteStaffAction({ email, role: inviteRole });
            if (!result.ok) setError(result.reason);
            else {
                setMessage(result.existingAccount
                    ? `Access is pending for ${email.trim()}. Ask them to sign out and sign in with that same account; access activates after authentication.`
                    : `Invitation sent to ${email.trim()}. Access will activate when the invite is accepted.`);
                setEmail("");
                setInviteOpen(false);
                router.refresh();
            }
        } catch {
            setError("The invitation could not be sent. Please try again.");
        } finally {
            setBusy(false);
        }
    }

    async function applyChange() {
        if (!pending) return;
        setBusy(true);
        setError("");
        setMessage("");
        try {
            const result = await updateStaffAccessAction({
                userId: pending.userId,
                ...(pending.role ? { role: pending.role } : {}),
                ...(pending.status ? { status: pending.status } : {}),
            });
            if (!result.ok) setError(result.reason);
            else {
                setMessage(`Access updated for ${pending.email}.`);
                setPending(null);
                router.refresh();
            }
        } catch {
            setError("The staff access change could not be saved. Please retry.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-5">
            <section className="rounded-xl border border-[#143958] bg-[#041b33] p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-sm font-semibold text-white">Restaurant staff</h2>
                        <p className="mt-1 text-xs leading-5 text-[#91a9c2]">Manage access for this restaurant. Invitations require the recipient to authenticate before access is activated.</p>
                    </div>
                    <button type="button" onClick={() => { setError(""); setInviteOpen(true); }} className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#078cf0] px-4 text-sm font-semibold text-white hover:bg-[#159cf8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#041b33]">Invite Staff</button>
                </div>

                {error ? <p role="alert" className="mt-4 rounded-md border border-[#823e46] bg-[#401e28] px-3 py-2 text-sm text-[#ffd7db]">{error}</p> : null}
                {message ? <p role="status" className="mt-4 rounded-md border border-[#24694b] bg-[#103b31] px-3 py-2 text-sm text-[#c6f5d8]">{message}</p> : null}

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <label className="sr-only" htmlFor="staff-search">Search staff</label>
                    <input id="staff-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by email, role, or status" className="min-h-10 w-full rounded-md border border-[#245477] bg-[#061d36] px-3 text-sm text-white placeholder:text-[#7894ad] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff] sm:max-w-sm" />
                    <span className="text-xs text-[#91a9c2]" aria-live="polite">{filteredStaff.length} {filteredStaff.length === 1 ? "staff member" : "staff members"}</span>
                </div>

                {staff.length === 0 ? (
                    <div className="mt-5 rounded-lg border border-dashed border-[#245477] px-4 py-8 text-center">
                        <h3 className="text-sm font-semibold text-white">No staff access yet</h3>
                        <p className="mt-1 text-xs text-[#91a9c2]">Invite a trusted team member to get started.</p>
                    </div>
                ) : filteredStaff.length === 0 ? (
                    <p className="mt-5 rounded-md bg-[#092746] px-4 py-6 text-center text-sm text-[#a7bfd4]">No staff members match that search.</p>
                ) : (
                    <div className="mt-4 overflow-x-auto rounded-lg border border-[#143958]">
                        <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                            <thead className="bg-[#092746] text-xs text-[#91a9c2]"><tr><th scope="col" className="px-4 py-3 font-medium">Staff member</th><th scope="col" className="px-4 py-3 font-medium">Role</th><th scope="col" className="px-4 py-3 font-medium">Status</th><th scope="col" className="px-4 py-3 font-medium">Actions</th></tr></thead>
                            <tbody className="divide-y divide-[#143958]">
                                {filteredStaff.map((member) => {
                                    const canManage = canManageStaffMember(role, member.role, actorUserId, member.userId);
                                    return (
                                        <tr key={member.userId} className="align-top">
                                            <td className="px-4 py-3"><span className="block max-w-xs break-all font-medium text-white">{member.email}</span></td>
                                            <td className="px-4 py-3 text-[#d5e5f4]">
                                                {canManage ? (
                                                    <label className="sr-only" htmlFor={`role-${member.userId}`}>Change role for {member.email}</label>
                                                ) : null}
                                                {canManage ? (
                                                    <select id={`role-${member.userId}`} value={member.role} onChange={(event) => setPending({ userId: member.userId, email: member.email, role: event.target.value as "full_admin" | "order_management" })} className="rounded-md border border-[#245477] bg-[#061d36] px-2 py-1 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff]">
                                                        <option value="order_management">Order Management</option>
                                                        {mayGrantFullAdmin ? <option value="full_admin">Full Admin</option> : null}
                                                    </select>
                                                ) : ROLE_LABELS[member.role]}
                                            </td>
                                            <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${member.status === "active" ? "bg-[#143d32] text-[#b8f0d0]" : member.status === "invited" ? "bg-[#3b321d] text-[#ffe4a6]" : "bg-[#3b2730] text-[#f0bdc5]"}`}>{statusLabel(member.status)}</span></td>
                                            <td className="px-4 py-3">
                                                {canManage ? member.status === "deactivated" ? (
                                                    <button type="button" onClick={() => setPending({ userId: member.userId, email: member.email, status: "active" })} className="rounded px-2 py-1 text-xs font-semibold text-[#9de9fa] hover:bg-[#123654] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff]">Reactivate</button>
                                                ) : (
                                                    <button type="button" onClick={() => setPending({ userId: member.userId, email: member.email, status: "deactivated" })} className="rounded px-2 py-1 text-xs font-semibold text-[#ffb7be] hover:bg-[#3b2730] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff]">Deactivate</button>
                                                ) : <span className="text-xs text-[#7894ad]">{member.role === "owner" ? "Protected owner" : "No actions available"}</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {role === "owner" ? (
                <section className="rounded-xl border border-[#143958] bg-[#041b33] p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div><h2 className="text-sm font-semibold text-white">Security audit log</h2><p className="mt-1 text-xs text-[#91a9c2]">Recent staff access changes for this restaurant.</p></div>
                        <button type="button" aria-expanded={auditOpen} onClick={() => setAuditOpen((value) => !value)} className="rounded-md border border-[#245477] px-3 py-2 text-xs font-semibold text-[#d5e5f4] hover:bg-[#092746] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff]">{auditOpen ? "Hide log" : "View log"}</button>
                    </div>
                    {auditOpen ? audit.length ? <ol className="mt-4 divide-y divide-[#143958]">
                        {audit.map((event) => {
                            const roleValue = typeof event.metadata === "object" && event.metadata !== null && !Array.isArray(event.metadata) && "role" in event.metadata ? event.metadata.role : null;
                            const roleDetail = roleValue === "owner" || roleValue === "full_admin" || roleValue === "order_management" ? ` · ${ROLE_LABELS[roleValue]}` : "";
                            return <li key={event.id} className="flex flex-col gap-1 py-3 text-xs sm:flex-row sm:items-start sm:justify-between"><span className="text-[#d5e5f4]">{event.action.replaceAll("_", " ")}{roleDetail}{event.targetEmail ? ` · ${event.targetEmail}` : ""}{event.actorId ? ` · actor ${event.actorId}` : ""}</span><span className="text-[#91a9c2]">{new Date(event.createdAt).toLocaleString()}</span></li>;
                        })}
                    </ol> : <p className="mt-4 text-xs text-[#91a9c2]">No security events have been recorded yet.</p> : null}
                </section>
            ) : null}

            <StaffDialog id="staff-invite-title" open={inviteOpen} close={() => setInviteOpen(false)} title="Invite staff">
                <form onSubmit={invite} className="space-y-4">
                    <div>
                        <label htmlFor="staff-invite-email" className="mb-1.5 block text-sm font-medium">Email address</label>
                        <input id="staff-invite-email" type="email" required maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-11 w-full rounded-md border border-[#245477] bg-[#061d36] px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff]" />
                    </div>
                    <div>
                        <label htmlFor="staff-invite-role" className="mb-1.5 block text-sm font-medium">Role</label>
                        <select id="staff-invite-role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "full_admin" | "order_management")} className="min-h-11 w-full rounded-md border border-[#245477] bg-[#061d36] px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff]">
                            {mayGrantFullAdmin ? <option value="full_admin">Full Admin</option> : null}
                            <option value="order_management">Order Management</option>
                        </select>
                        <p className="mt-2 text-xs leading-5 text-[#a7bfd4]">{inviteRole === "full_admin" ? "Can manage restaurant operations and settings, and manage Order Management staff. Only the Owner can grant this role." : "Can work with orders and table-support requests. Cannot access settings, menus, staff administration, reports, or payment collection."} If this email already has an account, access stays pending until that account signs in.</p>
                    </div>
                    {error ? <p role="alert" className="rounded-md border border-[#823e46] bg-[#401e28] px-3 py-2 text-sm text-[#ffd7db]">{error}</p> : null}
                    <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                        <button type="button" onClick={() => setInviteOpen(false)} disabled={busy} className="min-h-10 rounded-md border border-[#245477] px-4 text-sm font-medium text-[#d5e5f4] hover:bg-[#123654] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff]">Cancel</button>
                        <button type="submit" disabled={busy} className="min-h-10 rounded-md bg-[#078cf0] px-4 text-sm font-semibold text-white hover:bg-[#159cf8] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff]">{busy ? "Sending…" : "Send invitation"}</button>
                    </div>
                </form>
            </StaffDialog>

            <StaffDialog id="staff-change-title" open={pending !== null} close={() => setPending(null)} title="Confirm access change">
                {pending ? <div className="space-y-4">
                    <p className="text-sm leading-6 text-[#d5e5f4]">
                        {pending.role ? `Change ${pending.email}'s role to ${ROLE_LABELS[pending.role]}?` : pending.status === "deactivated" ? `Deactivate ${pending.email}'s staff access? Their current session will no longer pass authorization checks.` : `Reactivate ${pending.email}'s staff access?`}
                    </p>
                    {error ? <p role="alert" className="rounded-md border border-[#823e46] bg-[#401e28] px-3 py-2 text-sm text-[#ffd7db]">{error}</p> : null}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button type="button" onClick={() => setPending(null)} disabled={busy} className="min-h-10 rounded-md border border-[#245477] px-4 text-sm font-medium text-[#d5e5f4] hover:bg-[#123654] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff]">Cancel</button>
                        <button type="button" onClick={() => void applyChange()} disabled={busy} className="min-h-10 rounded-md bg-[#078cf0] px-4 text-sm font-semibold text-white hover:bg-[#159cf8] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff]">{busy ? "Saving…" : "Confirm change"}</button>
                    </div>
                </div> : null}
            </StaffDialog>
        </div>
    );
}
