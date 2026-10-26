"use client";

import { useState } from "react";
import { Clipboard, Printer } from "lucide-react";

export function AdminTableQrActions({ url }: { url: string }) {
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState("");

    async function copyUrl() {
        setError("");
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        } catch {
            setError("Copy was unavailable. Select the public URL above to copy it.");
        }
    }

    return (
        <div className="table-sign-actions flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void copyUrl()} className="inline-flex min-h-10 items-center gap-2 border border-[#b9d0e1] bg-white px-3 text-xs font-bold text-[#0759a8] hover:bg-[#edf8ff]"><Clipboard className="h-4 w-4" aria-hidden="true" />{copied ? "Copied" : "Copy QR URL"}</button>
            <button type="button" onClick={() => window.print()} className="inline-flex min-h-10 items-center gap-2 bg-[#0759a8] px-3 text-xs font-bold text-white hover:bg-[#064987]"><Printer className="h-4 w-4" aria-hidden="true" />Print table sign</button>
            {error ? <p role="alert" className="w-full text-xs text-[#8b3333]">{error}</p> : null}
        </div>
    );
}