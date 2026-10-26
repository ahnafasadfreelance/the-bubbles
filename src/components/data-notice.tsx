import { AlertCircle, Database, Info } from "lucide-react";

import type { DataStatus } from "@/lib/restaurant-data";

export function DataNotice({
    status,
    subject,
}: {
    status: DataStatus;
    subject: string;
}) {
    if (status === "ready") return null;

    const isError = status === "error";
    const Icon = isError ? AlertCircle : status === "unconfigured" ? Database : Info;
    const message = isError
        ? `${subject} is temporarily unavailable. Please try again later.`
        : status === "unconfigured"
            ? `${subject} will appear here after Supabase is configured.`
            : `${subject} has not been published yet.`;

    return (
        <p
            role={isError ? "alert" : "status"}
            className="flex items-start gap-2 border border-[#b9d0e1] bg-white px-4 py-3 text-xs leading-5 text-[#49677f]"
        >
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#0879be]" aria-hidden="true" />
            <span>{message}</span>
        </p>
    );
}