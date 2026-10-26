import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Turf Staff Access" };

export default async function TurfStaffAccessPage() {
    redirect("/admin/staff#turf-access");
}
