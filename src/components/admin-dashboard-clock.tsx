"use client";

import { useEffect, useState } from "react";

export function AdminDashboardClock() {
    const [now, setNow] = useState<Date | null>(null);

    useEffect(() => {
        const initialUpdate = setTimeout(() => setNow(new Date()), 0);
        const interval = setInterval(() => setNow(new Date()), 1000);
        return () => {
            clearTimeout(initialUpdate);
            clearInterval(interval);
        };
    }, []);

    const date = now
        ? new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(now)
        : "Loading local time";
    const time = now
        ? new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(now)
        : "--:--:--";

    return (
        <div className="flex min-w-0 items-center gap-2 rounded-lg border border-[#24608a] bg-linear-to-br from-[#0d3558] to-[#092746] px-2.5 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.22)] sm:min-w-52 sm:gap-3 sm:rounded-xl sm:px-4 sm:py-3">
            <span aria-hidden="true" className="relative flex h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#43e0b0] opacity-40" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#43e0b0] shadow-[0_0_12px_rgba(67,224,176,0.75)] sm:h-3 sm:w-3" />
            </span>
            <div className="min-w-0">
                <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#82a9c8] sm:text-[9px] sm:tracking-[0.2em]">Local time</p>
                <time
                    dateTime={now?.toISOString()}
                    className="mt-0.5 block whitespace-nowrap font-mono text-lg font-semibold leading-5 tabular-nums tracking-tight text-white sm:text-2xl sm:leading-6"
                >
                    {time}
                </time>
                <p className="mt-0.5 text-[9px] font-medium text-[#bdd3e7] sm:mt-1 sm:text-[10px]">{date}</p>
            </div>
        </div>
    );
}
