import "server-only";

import { Buffer } from "node:buffer";
import QRCode from "qrcode";
import sharp from "sharp";

export function isValidTableQrToken(token: string) {
    return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function getTableQrUrl(token: string) {
    if (!isValidTableQrToken(token)) throw new Error("Invalid table QR token.");

    const configuredBase = process.env.NEXT_PUBLIC_APP_URL?.trim();
    const deploymentHost = process.env.VERCEL_URL?.trim();
    const baseUrl = configuredBase || (deploymentHost ? `https://${deploymentHost}` : null);
    if (!baseUrl) throw new Error("Set NEXT_PUBLIC_APP_URL to generate permanent table QR codes.");

    let origin: URL;
    try {
        origin = new URL(baseUrl);
    } catch {
        throw new Error("NEXT_PUBLIC_APP_URL must be a valid absolute URL.");
    }
    if (origin.protocol !== "https:" && origin.protocol !== "http:") {
        throw new Error("NEXT_PUBLIC_APP_URL must use HTTP or HTTPS.");
    }

    return new URL(`/table/${token}`, origin).toString();
}

const qrOptions = {
    errorCorrectionLevel: "H" as const,
    margin: 4,
    color: { dark: "#09294D", light: "#FFFFFF" },
};

function escapeXmlAttribute(value: string) {
    return value.replace(/[<>&"']/g, (character) => ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "\"": "&quot;",
        "'": "&apos;",
    })[character] ?? character);
}

function addLogoToQrSvg(svg: string, logoDataUrl?: string | null) {
    if (!logoDataUrl) return svg;

    const viewBox = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
    if (!viewBox) throw new Error("Could not determine the generated QR code dimensions.");

    const width = Number(viewBox[1]);
    const height = Number(viewBox[2]);
    const backdropSize = Math.min(width, height) * 0.24;
    const logoSize = Math.min(width, height) * 0.2;
    const logoCornerRadius = logoSize * 0.16;
    const centerX = width / 2;
    const centerY = height / 2;
    const overlay = [
        `<rect x="${centerX - backdropSize / 2}" y="${centerY - backdropSize / 2}" width="${backdropSize}" height="${backdropSize}" rx="${backdropSize * 0.12}" fill="#FFFFFF"/>`,
        `<defs><clipPath id="table-qr-logo-clip"><rect x="${centerX - logoSize / 2}" y="${centerY - logoSize / 2}" width="${logoSize}" height="${logoSize}" rx="${logoCornerRadius}"/></clipPath></defs>`,
        `<image href="${escapeXmlAttribute(logoDataUrl)}" x="${centerX - logoSize / 2}" y="${centerY - logoSize / 2}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet" clip-path="url(#table-qr-logo-clip)"/>`,
    ].join("");

    return svg.replace("</svg>", `${overlay}</svg>`);
}

export async function generateTableQrSvg(token: string, logoDataUrl?: string | null) {
    const svg = await QRCode.toString(getTableQrUrl(token), {
        ...qrOptions,
        type: "svg",
        width: 1024,
    });
    return addLogoToQrSvg(svg, logoDataUrl);
}

export async function generateTableQrPng(token: string, logoDataUrl?: string | null) {
    const svg = await generateTableQrSvg(token, logoDataUrl);
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
}