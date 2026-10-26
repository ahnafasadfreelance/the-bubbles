function escapeHtml(value: string) {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export async function sendTurfEmailWithResend({
    apiKey,
    from,
    recipient,
    subject,
    body,
    href,
    idempotencyKey,
}: {
    apiKey: string;
    from: string;
    recipient: string;
    subject: string;
    body: string;
    href: string;
    idempotencyKey: string;
}): Promise<string | null> {
    try {
        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "Idempotency-Key": idempotencyKey,
            },
            body: JSON.stringify({
                from,
                to: [recipient],
                subject,
                text: `${body}\n\n${href}`,
                html: `<p>${escapeHtml(body)}</p><p><a href="${escapeHtml(href)}">View booking</a></p>`,
            }),
            signal: AbortSignal.timeout(10000),
        });
        return response.ok ? null : `Resend returned HTTP ${response.status}.`;
    } catch (error) {
        return error instanceof Error && error.name === "TimeoutError"
            ? "Email provider request timed out."
            : "Email provider request failed.";
    }
}
