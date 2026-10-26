"use client";

import { ImagePlus, LoaderCircle, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type ImageRole = "dish" | "category" | "logo" | "cover";

async function discardTemporaryAsset(url: string) {
    try {
        await fetch("/api/admin/assets", {
            method: "DELETE",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
        });
    } catch {
        return;
    }
}

export function AdminImageUpload({
    label,
    role,
    value,
    persistedValue,
    onChange,
}: {
    label: string;
    role: ImageRole;
    value: string | null;
    persistedValue?: string | null;
    onChange: (value: string | null) => void;
}) {
    const [progress, setProgress] = useState<number | null>(null);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const temporaryUrl = useRef<string | null>(null);
    const request = useRef<XMLHttpRequest | null>(null);
    const persistedUrl = useRef(persistedValue);

    useEffect(() => {
        persistedUrl.current = persistedValue;
    }, [persistedValue]);

    useEffect(() => {
        if (temporaryUrl.current && value === persistedValue) temporaryUrl.current = null;
    }, [persistedValue, value]);

    useEffect(() => () => {
        request.current?.abort();
        const temporary = temporaryUrl.current;
        if (temporary && temporary !== persistedUrl.current) void discardTemporaryAsset(temporary);
    }, []);

    function upload(file: File) {
        setError("");
        setMessage("");
        if (file.size > 5 * 1024 * 1024) {
            setError("Choose an image no larger than 5 MB.");
            return;
        }

        const form = new FormData();
        form.append("file", file);
        form.append("role", role);
        const xhr = new XMLHttpRequest();
        request.current = xhr;
        xhr.open("POST", "/api/admin/assets");
        xhr.withCredentials = true;
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
        };
        xhr.onerror = () => {
            setProgress(null);
            setError("Image upload failed. Check your connection and try again.");
        };
        xhr.onabort = () => setProgress(null);
        xhr.onload = () => {
            setProgress(null);
            try {
                const response: unknown = JSON.parse(xhr.responseText);
                if (
                    xhr.status < 200
                    || xhr.status >= 300
                    || !response
                    || typeof response !== "object"
                    || !("url" in response)
                    || typeof response.url !== "string"
                ) {
                    const detail = response && typeof response === "object" && "error" in response && typeof response.error === "string"
                        ? response.error
                        : "Image upload failed. Please retry.";
                    setError(detail);
                    return;
                }

                const uploadedUrl = response.url;
                const previousTemporary = temporaryUrl.current;
                temporaryUrl.current = uploadedUrl;
                onChange(uploadedUrl);
                setMessage("Image uploaded. Save the form to publish this change.");
                if (previousTemporary && previousTemporary !== uploadedUrl) void discardTemporaryAsset(previousTemporary);
            } catch {
                setError("The upload response was invalid. Please retry.");
            }
        };
        setProgress(0);
        xhr.send(form);
    }

    function removeImage() {
        const uncommitted = temporaryUrl.current;
        temporaryUrl.current = null;
        if (uncommitted) void discardTemporaryAsset(uncommitted);
        onChange(null);
        setMessage("");
        setError("");
    }

    return (
        <div>
            <p className="text-xs font-bold text-[#234861]">{label}</p>
            <div className="mt-2 flex flex-wrap items-start gap-3">
                {value ? (
                    <Image src={value} alt={`${label} preview`} width={128} height={96} unoptimized className="h-24 w-32 border border-[#d5e1e9] bg-[#f4f8fb] object-cover" />
                ) : (
                    <div className="flex h-24 w-32 items-center justify-center border border-dashed border-[#bfd1df] bg-[#f4f8fb] text-[#8298a8]">
                        <ImagePlus className="h-6 w-6" aria-hidden="true" />
                        <span className="sr-only">No image selected</span>
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 border border-[#b9d0e1] bg-white px-3 text-xs font-bold text-[#0759a8] hover:bg-[#edf8ff] focus-within:ring-2 focus-within:ring-[#087bc1]">
                        {progress !== null ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-4 w-4" aria-hidden="true" />}
                        {progress !== null ? `Uploading ${progress}%` : "Choose image"}
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/avif"
                            disabled={progress !== null}
                            className="sr-only"
                            onChange={(event) => {
                                const file = event.currentTarget.files?.[0];
                                event.currentTarget.value = "";
                                if (file) upload(file);
                            }}
                        />
                    </label>
                    {value ? <button type="button" onClick={removeImage} disabled={progress !== null} aria-label={`Remove ${label.toLowerCase()}`} className="ml-2 inline-flex min-h-10 items-center gap-1 px-2 text-xs font-semibold text-[#8b3333] hover:bg-[#fff2f2] disabled:opacity-50"><X className="h-4 w-4" aria-hidden="true" /> Remove</button> : null}
                    <p className="mt-2 text-[11px] leading-5 text-[#71879a]">JPEG, PNG, WebP, or AVIF · up to 5 MB</p>
                    {role === "logo" ? <p className="mt-1 text-[11px] leading-5 text-[#71879a]">Square-cropped for table QR codes; outer edges may be trimmed.</p> : null}
                    {message ? <p role="status" className="mt-1 text-[11px] text-[#236c58]">{message}</p> : null}
                    {error ? <p role="alert" className="mt-1 text-[11px] text-[#8b3333]">{error}</p> : null}
                </div>
            </div>
        </div>
    );
}