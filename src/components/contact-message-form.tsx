"use client";

import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";

export function ContactMessageForm({ email }: { email: string | null }) {
    const [message, setMessage] = useState("");

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!email) return;

        const data = new FormData(event.currentTarget);
        const name = String(data.get("name") ?? "").trim();
        const sender = String(data.get("email") ?? "").trim();
        const body = String(data.get("message") ?? "").trim();
        const subject = encodeURIComponent(`Website message from ${name}`);
        const content = encodeURIComponent(`Name: ${name}\nEmail: ${sender}\n\n${body}`);
        window.location.href = `mailto:${email}?subject=${subject}&body=${content}`;
        setMessage("Your email app should open with this message ready to send.");
    }

    return (
        <section className="rounded-md border border-[#0e3b60] bg-[#06223d] p-4 sm:p-6">
            <h2 className="text-sm font-bold text-white sm:text-base">Send Us a Message</h2>
            {email ? (
                <form className="mt-3 space-y-2.5" onSubmit={submit}>
                    <label className="block text-[10px] font-semibold text-[#bfd1e0]">Your Name
                        <input name="name" type="text" autoComplete="name" required maxLength={120} className="mt-1 block h-9 w-full rounded-md border border-[#155078] bg-[#041a2f] px-3 text-xs text-white outline-none focus:border-[#12bce5] focus:ring-2 focus:ring-[#12bce5]/25" />
                    </label>
                    <label className="block text-[10px] font-semibold text-[#bfd1e0]">Your Email
                        <input name="email" type="email" autoComplete="email" required maxLength={254} className="mt-1 block h-9 w-full rounded-md border border-[#155078] bg-[#041a2f] px-3 text-xs text-white outline-none focus:border-[#12bce5] focus:ring-2 focus:ring-[#12bce5]/25" />
                    </label>
                    <label className="block text-[10px] font-semibold text-[#bfd1e0]">Message
                        <textarea name="message" required maxLength={4000} rows={4} className="mt-1 block w-full resize-y rounded-md border border-[#155078] bg-[#041a2f] px-3 py-2 text-xs text-white outline-none focus:border-[#12bce5] focus:ring-2 focus:ring-[#12bce5]/25" />
                    </label>
                    <button type="submit" className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-[#08afe0] px-4 text-xs font-bold text-white transition-colors hover:bg-[#0096ca] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93e7ff]">
                        <Send className="h-3.5 w-3.5" aria-hidden="true" /> Send Message
                    </button>
                    {message ? <p role="status" className="text-[10px] leading-4 text-[#9ed8e8]">{message}</p> : <p className="text-[9px] leading-4 text-[#829bb0]">Your default email app will open to send this message.</p>}
                </form>
            ) : <p className="mt-2 text-xs leading-5 text-[#a8bfd2]">The restaurant has not provided an email address yet.</p>}
        </section>
    );
}