import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default function OrderNotFound() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-[#020b16] px-4 py-10 text-[#f5faff]">
            <section className="w-full max-w-lg rounded-3xl border border-[#17435a] bg-[#071827] p-6 text-center sm:p-9">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#7890a5]/35 bg-[#172330] text-[#a8bed2]">
                    <AlertCircle className="h-7 w-7" aria-hidden="true" />
                </span>
                <h1 className="mt-5 text-2xl font-bold">Order not found</h1>
                <p className="mt-2 text-sm leading-6 text-[#a8bed2]">We couldn’t find that order, or you don’t have access to it.</p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                    <Link href="/my-orders" className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#00d8df] px-5 text-sm font-bold text-[#031821] transition-colors hover:bg-[#55f0ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5ff]">My orders</Link>
                    <Link href="/menu" className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#315066] px-5 text-sm font-bold text-[#d7e6ef] transition-colors hover:border-[#00e5ff]/55 hover:text-[#00e5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5ff]">Browse menu</Link>
                </div>
            </section>
        </main>
    );
}
