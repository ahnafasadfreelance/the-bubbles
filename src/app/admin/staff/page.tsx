import { StaffAccessPanel } from "@/components/staff-access-panel";
import { TurfStaffAccessForm } from "@/components/turf-staff-access-form";
import { loadStaffAccessAction } from "@/app/admin/staff-actions";
import { requireAdminRole } from "@/lib/admin-auth";

export const metadata = { title: "Staff & Access" };

export default async function AdminStaffPage() {
    const access = await requireAdminRole("owner", "full_admin");
    const result = await loadStaffAccessAction();
    return (
        <main className="mx-auto max-w-375 space-y-5 px-3 py-4 sm:px-5 sm:py-5 lg:px-8">
            <header className="border-b border-[#163b5a] pb-4">
                <h1 className="text-xl font-semibold leading-6 text-[#f5f9ff]">Staff &amp; Access</h1>
                <p className="mt-1 text-xs text-[#91a9c2]">Manage restaurant staff and assign separate rooftop turf access.</p>
            </header>
            {!result.ok ? (
                <div role="alert" className="border-l-4 border-[#b84c4c] bg-[#fff2f2] px-4 py-3 text-sm text-[#7a2929]">
                    {result.reason === "unauthorized" ? "Staff administration access is required." : "Staff access could not be loaded. Check the database migration and retry."}
                </div>
            ) : <StaffAccessPanel role={result.role} actorUserId={result.actorUserId} staff={result.staff} audit={result.audit} />}
            <section id="turf-access" className="scroll-mt-6 rounded-xl border border-[#143958] bg-[#041b33] p-4 sm:p-5">
                <h2 className="text-sm font-semibold text-white">Rooftop Turf Staff</h2>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-[#91a9c2]">
                    Assign or deactivate Turf Manager access using the email of an existing, verified Google-authenticated account. Turf permissions remain separate from restaurant roles.
                </p>
                <TurfStaffAccessForm isOwner={access.role === "owner"} />
            </section>
        </main>
    );
}
