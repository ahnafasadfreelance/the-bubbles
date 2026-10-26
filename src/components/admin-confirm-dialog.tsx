"use client";

import { useEffect, useRef } from "react";

export function AdminConfirmDialog({
    open,
    title,
    description,
    confirmLabel,
    busy,
    onCancel,
    onConfirm,
}: {
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    busy: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const cancelButtonRef = useRef<HTMLButtonElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        if (open && !dialog.open) {
            previousFocusRef.current = document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            dialog.showModal();
            cancelButtonRef.current?.focus();
        } else if (!open && dialog.open) {
            dialog.close();
            if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
        }
    }, [open]);

    return (
        <dialog
            ref={dialogRef}
            role="alertdialog"
            aria-labelledby="admin-confirm-title"
            onCancel={(event) => {
                event.preventDefault();
                if (!busy) onCancel();
            }}
            onClick={(event) => {
                if (event.target === event.currentTarget && !busy) onCancel();
            }}
            className="fixed inset-0 z-50 m-0 flex h-full max-h-none w-full max-w-none items-end justify-center overflow-y-auto bg-transparent p-0 backdrop:bg-[#03172b]/70 sm:items-center sm:p-4"
        >
            <section className="w-full max-w-md rounded-t-xl border border-[#d7e2ec] bg-white p-5 text-[#09294d] shadow-xl sm:rounded-md">
                <h2 id="admin-confirm-title" className="text-base font-bold">{title}</h2>
                <p className="mt-2 text-sm text-[#617991]">{description}</p>
                <div className="mt-5 flex justify-end gap-2">
                    <button ref={cancelButtonRef} type="button" disabled={busy} onClick={onCancel} className="min-h-10 rounded border border-[#b9d0e1] px-4 text-sm font-semibold text-[#37566f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087bc1] disabled:opacity-50">Cancel</button>
                    <button type="button" disabled={busy} onClick={onConfirm} className="min-h-10 rounded bg-[#a74437] px-4 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087bc1] disabled:opacity-50">{busy ? "Working…" : confirmLabel}</button>
                </div>
            </section>
        </dialog>
    );
}
