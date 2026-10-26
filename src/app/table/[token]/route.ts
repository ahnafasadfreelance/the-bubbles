import { NextResponse } from "next/server";

import {
    createOrderingSession,
    ORDERING_SESSION_COOKIE,
    sessionCookieMaxAge,
} from "@/lib/ordering-session";
import { resolveActiveTableToken, signTableContext, TABLE_CONTEXT_COOKIE, TABLE_CONTEXT_TTL_SECONDS } from "@/lib/table-context";
import { isValidTableQrToken } from "@/lib/table-qr";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ token: string }> },
) {
    const { token } = await params;
    if (!isValidTableQrToken(token)) {
        return NextResponse.redirect(new URL("/table-unavailable", request.url), 303);
    }

    const table = await resolveActiveTableToken(token);
    if (!table) {
        return NextResponse.redirect(new URL("/table-unavailable", request.url), 303);
    }

    try {
        const session = await createOrderingSession(table.id);
        if (!session) {
            return NextResponse.redirect(new URL("/menu?ordering_session=unavailable", request.url), 303);
        }

        const response = NextResponse.redirect(new URL("/menu", request.url), 303);
        response.headers.set("Cache-Control", "no-store");
        response.cookies.set(TABLE_CONTEXT_COOKIE, signTableContext(table.id), {
            httpOnly: true,
            secure: new URL(request.url).protocol === "https:",
            sameSite: "lax",
            path: "/",
            maxAge: TABLE_CONTEXT_TTL_SECONDS,
        });
        response.cookies.set(ORDERING_SESSION_COOKIE, session.cookieValue, {
            httpOnly: true,
            secure: new URL(request.url).protocol === "https:",
            sameSite: "lax",
            path: "/",
            maxAge: sessionCookieMaxAge(session.expiresAt),
            expires: new Date(session.expiresAt),
        });
        return response;
    } catch (error) {
        if (error instanceof Error && error.message.includes("TABLE_UNAVAILABLE")) {
            return NextResponse.redirect(new URL("/table-unavailable", request.url), 303);
        }
        console.error("Unable to establish the table ordering session.", error);
        return NextResponse.redirect(new URL("/menu?ordering_session=unavailable", request.url), 303);
    }
}