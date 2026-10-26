import { timingSafeEqual } from "node:crypto";

import { createPrivilegedClient } from "@/lib/supabase/privileged-server";
import { sendTurfEmailWithResend } from "@/lib/turf/email-provider";
import type { Json } from "@/types/database";

type EmailNotification = {
    id: number;
    idempotency_key: string;
    email: string;
    title: string;
    body: string;
    href: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEmailNotification(value: unknown): EmailNotification | null {
    if (!isRecord(value)
        || typeof value.id !== "number" || !Number.isSafeInteger(value.id) || value.id < 1
        || typeof value.idempotency_key !== "string"
        || typeof value.email !== "string" || value.email.length > 320
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)
        || typeof value.title !== "string" || value.title.length > 200
        || typeof value.body !== "string" || value.body.length > 2000
        || typeof value.href !== "string" || !value.href.startsWith("/") || value.href.startsWith("//")) return null;
    return {
        id: value.id,
        idempotency_key: value.idempotency_key,
        email: value.email,
        title: value.title,
        body: value.body,
        href: value.href,
    };
}

function requestIsAuthorized(request: Request, configuredSecret: string) {
    const authorization = request.headers.get("authorization");
    const presented = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    const expectedBytes = Buffer.from(configuredSecret);
    const presentedBytes = Buffer.from(presented);
    return presentedBytes.length === expectedBytes.length && timingSafeEqual(presentedBytes, expectedBytes);
}

export async function POST(request: Request) {
    const configuredSecret = process.env.TURF_CRON_SECRET?.trim();
    if (!configuredSecret || Buffer.byteLength(configuredSecret) < 32) {
        return Response.json({ error: "Scheduled turf processing is not configured." }, { status: 503 });
    }
    if (!requestIsAuthorized(request, configuredSecret)) return Response.json({ error: "Unauthorized." }, { status: 401 });

    const apiKey = process.env.RESEND_API_KEY?.trim();
    const sender = process.env.TURF_EMAIL_FROM?.trim();
    const siteUrl = process.env.TURF_SITE_URL?.trim();
    let siteOrigin: string;
    try {
        const parsedSiteUrl = new URL(siteUrl ?? "");
        if (!apiKey || !sender || parsedSiteUrl.protocol !== "https:" || parsedSiteUrl.username || parsedSiteUrl.password) {
            throw new Error("Turf email delivery configuration is incomplete.");
        }
        siteOrigin = parsedSiteUrl.origin;
    } catch {
        return Response.json({ error: "Turf email delivery is not configured." }, { status: 503 });
    }

    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase.rpc("turf_claim_email_notifications", { p_limit: 10 });
        if (error) {
            console.error("Turf email queue could not be claimed.", { code: error.code });
            return Response.json({ error: "Email queue processing failed." }, { status: 503 });
        }
        const batch: Json = data;
        if (!Array.isArray(batch)) {
            console.error("Turf email queue returned an invalid response.");
            return Response.json({ error: "Email queue processing failed." }, { status: 503 });
        }

        let sent = 0;
        let failed = 0;
        for (const raw of batch) {
            const notification = parseEmailNotification(raw);
            const rawRecord = isRecord(raw) ? raw : null;
            const notificationId = rawRecord && typeof rawRecord.id === "number" && Number.isSafeInteger(rawRecord.id)
                ? rawRecord.id : null;
            if (!notificationId) {
                failed += 1;
                console.error("Claimed turf email had an invalid identifier.");
                continue;
            }

            let deliveryError: string | null = null;
            if (!notification) {
                deliveryError = "Claimed notification data was invalid.";
            } else {
                deliveryError = await sendTurfEmailWithResend({
                    apiKey,
                    from: sender,
                    recipient: notification.email,
                    subject: notification.title,
                    body: notification.body,
                    href: `${siteOrigin}${notification.href}`,
                    idempotencyKey: notification.idempotency_key,
                });
            }

            const { error: finishError } = await supabase.rpc("turf_finish_email_notification", {
                p_notification_id: notificationId,
                p_success: deliveryError === null,
                p_error: deliveryError,
            });
            if (finishError) {
                console.error("Turf email result could not be recorded.", { code: finishError.code, notificationId });
                failed += 1;
                continue;
            }
            if (deliveryError) {
                failed += 1;
                console.error("Turf email delivery failed.", { notificationId, reason: deliveryError });
            } else {
                sent += 1;
            }
        }

        return Response.json({ sent, failed }, {
            status: failed ? 503 : 200,
            headers: { "Cache-Control": "private, no-store" },
        });
    } catch (error) {
        console.error("Turf email worker is unavailable.", error);
        return Response.json({ error: "Email queue processing failed." }, { status: 503 });
    }
}
