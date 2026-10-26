import Link from "next/link";
import { CircleAlert } from "lucide-react";

export default function TableUnavailablePage() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-[#f7faff] px-5 py-12 text-[#09294d]">
            <section className="w-full max-w-lg border border-[#d8e3ed] bg-white p-8 text-center shadow-sm sm:p-10">
                <CircleAlert aria-hidden="true" className="mx-auto h-10 w-10 text-[#087bc1]" />
                <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#0879be]">Dine-in table</p>
                <h1 className="display-heading mt-2 text-3xl font-bold">This table link is unavailable.</h1>
                <p className="mt-3 text-sm leading-6 text-[#617991]">
                    The QR code may be invalid or inactive. Please ask restaurant staff for a current table code.
                </p>
                <Link href="/menu" className="mt-6 inline-flex rounded-full bg-[#087bc1] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#0567a4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087bc1]">
                    Browse the public menu
                </Link>
            </section>
        </main>
    );
}