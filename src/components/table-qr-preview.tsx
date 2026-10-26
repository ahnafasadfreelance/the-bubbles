import { Download } from "lucide-react";

import { AdminTableQrActions } from "@/components/admin-table-qr-actions";
import { getAdminRestaurantSettings } from "@/lib/admin-management-data";
import { getRestaurantLogoDataUrl } from "@/lib/admin-assets";
import { generateTableQrPng, generateTableQrSvg, getTableQrUrl } from "@/lib/table-qr";

export async function TableQrPreview({
    table,
    heading,
}: {
    table: { table_number: string; table_name: string | null; qr_token: string };
    heading?: string;
}) {
    const settingsResult = await getAdminRestaurantSettings();
    let logoDataUrl: string | null = null;
    let logoError = false;
    if (!settingsResult.ok) {
        console.error("Restaurant settings could not be loaded for the table QR logo.", settingsResult.reason);
        logoError = true;
    } else if (settingsResult.data?.logo_url) {
        try {
            logoDataUrl = await getRestaurantLogoDataUrl(settingsResult.data.logo_url);
        } catch (error) {
            console.error("Restaurant logo could not be loaded for the table QR code.", error);
            logoError = true;
        }
    }

    const [svg, png] = await Promise.all([
        generateTableQrSvg(table.qr_token, logoDataUrl),
        generateTableQrPng(table.qr_token, logoDataUrl),
    ]);
    const label = table.table_name || `Table ${table.table_number}`;
    const publicUrl = getTableQrUrl(table.qr_token);

    return (
        <section aria-label={`QR code for ${label}`} className="table-sign-print w-full max-w-none rounded-md border border-[#d7e2ec] bg-[#f7faff] p-4 text-center shadow-[0_8px_24px_rgba(0,0,0,0.15)]">
            {heading ? <h2 className="mb-1 text-left text-[11px] font-semibold text-[#183a55]">{heading}</h2> : null}
            {heading ? <p className="mb-3 text-left text-[9px] text-[#71879a]">{label}</p> : null}
            <p className="mb-3 text-[9px] font-bold uppercase tracking-[0.12em] text-[#0876c7]">Dine in · scan to order</p>
            <div
                role="img"
                aria-label={`Scannable QR code for ${label}`}
                className="table-qr-code mx-auto aspect-square w-full max-w-72 [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
                dangerouslySetInnerHTML={{ __html: svg }}
            />
            {logoError ? <p role="alert" className="table-sign-actions mt-2 text-xs text-[#8b3333]">The restaurant logo could not be loaded. This QR code was generated without it.</p> : null}
            {!heading ? <p className="mt-3 text-sm font-semibold text-[#09294d]">{label}</p> : null}
            <div className="table-sign-actions">
                <a href={publicUrl} className="mt-2 block break-all rounded-sm border border-[#d7e2ec] bg-white px-2 py-1.5 text-left font-mono text-[8px] text-[#526a80]">{publicUrl}</a>
                <div className="mt-2 flex flex-wrap justify-center gap-1.5"><a href={png} download={`table-${table.table_number}-qr.png`} className="inline-flex h-7 items-center gap-1 rounded bg-[#0795f5] px-2 text-[8px] font-semibold text-white hover:bg-[#1685d2]"><Download aria-hidden="true" className="h-3 w-3" />Download PNG</a><a href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} download={`table-${table.table_number}-qr.svg`} className="inline-flex h-7 items-center gap-1 rounded border border-[#cad7e2] bg-white px-2 text-[8px] font-semibold text-[#28506c] hover:bg-[#eaf1f8]"><Download aria-hidden="true" className="h-3 w-3" />Download SVG</a></div>
                <AdminTableQrActions url={publicUrl} />
            </div>
        </section>
    );
}