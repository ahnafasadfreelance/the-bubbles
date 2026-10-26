"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, LoaderCircle, Star, Utensils, X } from "lucide-react";

import {
    dismissCustomerReviewPrompt,
    getCustomerReviewPromptState,
    submitCustomerReview,
} from "@/app/orders/review-actions";

type PromptState = "checking" | "eligible" | "hidden" | "error";

function describeError(reason: string) {
    if (reason === "already_reviewed") return "A review has already been submitted for this order.";
    if (reason === "not_completed") return "Reviews are available after an order is completed.";
    if (reason === "unauthorized") return "Please sign in again to submit your review.";
    if (reason === "invalid") return "Check your rating and feedback, then try again.";
    if (reason === "not_found") return "We could not find this order.";
    return "We could not save that just now. Please try again.";
}

export function CustomerReviewPrompt({
    orderId,
    orderNumber,
    completed,
}: {
    orderId: string;
    orderNumber: string;
    completed: boolean;
}) {
    const [promptState, setPromptState] = useState<PromptState>(completed ? "checking" : "hidden");
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [dismissing, setDismissing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");
    const [error, setError] = useState("");
    const [closing, setClosing] = useState(false);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLElement>(null);
    const restoreFocusRef = useRef<HTMLElement | null>(null);
    const closingTimerRef = useRef<number | null>(null);
    const requestBusyRef = useRef(false);

    const checkEligibility = useCallback(async () => {
        if (!completed) {
            setPromptState("hidden");
            return;
        }
        setPromptState("checking");
        setError("");
        try {
            const result = await getCustomerReviewPromptState(orderId);
            if (!result.ok) {
                setPromptState("error");
                setError(describeError(result.reason));
            } else {
                setPromptState(result.state === "eligible" ? "eligible" : "hidden");
            }
        } catch {
            setPromptState("error");
            setError(describeError("unavailable"));
        }
    }, [completed, orderId]);

    const closeAfterMotion = useCallback(() => {
        setClosing(true);
        closingTimerRef.current = window.setTimeout(() => {
            setPromptState("hidden");
            setClosing(false);
        }, 160);
    }, []);

    const dismiss = useCallback(async () => {
        if (requestBusyRef.current) return;
        requestBusyRef.current = true;
        setDismissing(true);
        setError("");
        try {
            const result = await dismissCustomerReviewPrompt(orderId);
            if (!result.ok) {
                setError(describeError(result.reason));
                return;
            }
            closeAfterMotion();
        } catch {
            setError(describeError("unavailable"));
        } finally {
            requestBusyRef.current = false;
            setDismissing(false);
        }
    }, [closeAfterMotion, orderId]);

    useEffect(() => {
        const timer = window.setTimeout(() => void checkEligibility(), 0);
        return () => {
            window.clearTimeout(timer);
            if (closingTimerRef.current !== null) window.clearTimeout(closingTimerRef.current);
        };
    }, [checkEligibility]);

    useEffect(() => {
        if (promptState !== "eligible") return;
        restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        closeButtonRef.current?.focus();

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape" && !requestBusyRef.current) {
                event.preventDefault();
                void dismiss();
                return;
            }
            if (event.key !== "Tab" || !dialogRef.current) return;
            const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
                'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ));
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
                event.preventDefault();
                first.focus();
            }
        }

        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", handleKeyDown);
            if (restoreFocusRef.current?.isConnected) restoreFocusRef.current.focus();
        };
    }, [dismiss, promptState]);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (submitting || rating < 1) return;
        requestBusyRef.current = true;
        setSubmitting(true);
        setError("");
        try {
            const result = await submitCustomerReview({ orderId, rating, comment });
            if (!result.ok) {
                setError(describeError(result.reason));
                if (result.reason === "already_reviewed") {
                    setSuccessMessage("A review has already been submitted for this order.");
                    setSuccess(true);
                }
                return;
            }
            setSuccessMessage(`Your review has been saved for order #${orderNumber}.`);
            setSuccess(true);
        } catch {
            setError(describeError("unavailable"));
        } finally {
            requestBusyRef.current = false;
            setSubmitting(false);
        }
    }

    if (promptState === "hidden" || promptState === "checking") return null;

    if (promptState === "error") {
        return (
            <div role="alert" className="rounded-xl border border-[#edc2c2] bg-white p-4 text-sm text-[#7a2929]">
                <p>{error}</p>
                <button type="button" onClick={() => void checkEligibility()} className="mt-2 min-h-10 rounded-lg border border-[#e2b7b7] px-3 font-semibold hover:bg-[#fff1f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b84c4c]">
                    Retry review check
                </button>
            </div>
        );
    }

    return (
        <div className={`fixed inset-0 z-[70] flex items-end justify-center bg-[#020d19]/75 p-0 backdrop-blur-[2px] motion-reduce:backdrop-blur-0 sm:items-center sm:p-4 ${closing ? "review-backdrop-out" : "review-backdrop-in"}`}>
            <section
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="customer-review-title"
                aria-describedby="customer-review-description"
                className={`relative max-h-[100dvh] w-full overflow-y-auto rounded-t-2xl border border-[#1a4465] bg-[#06223d] p-5 text-white shadow-2xl sm:max-h-[92dvh] sm:max-w-lg sm:rounded-2xl sm:p-7 ${closing ? "review-dialog-out" : "review-dialog-in"}`}
            >
                <button
                    ref={closeButtonRef}
                    type="button"
                    aria-label="Close review dialog"
                    disabled={submitting || dismissing}
                    onClick={() => void dismiss()}
                    className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-lg text-[#b4c6d9] transition-colors hover:bg-[#0b3558] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff] disabled:cursor-not-allowed disabled:opacity-55"
                >
                    {dismissing ? <LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <X className="h-5 w-5" aria-hidden="true" />}
                </button>

                {success ? (
                    <div className="py-5 text-center">
                        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#1b735f] bg-[#0d4b46] text-[#6ce0bb]">
                            <CheckCircle2 className="h-7 w-7 review-success-check" aria-hidden="true" />
                        </span>
                        <h2 id="customer-review-title" className="mt-4 text-xl font-bold">{successMessage.startsWith("A review") ? "Review already received" : "Thank you for your feedback"}</h2>
                        <p id="customer-review-description" className="mt-2 text-sm leading-6 text-[#b4c6d9]">{successMessage}</p>
                        <button type="button" onClick={closeAfterMotion} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-[#087fc7] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0995df] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#70dfff]">
                            Done
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#39c5e9]">
                            <Utensils className="h-4 w-4" aria-hidden="true" /> Blue Table
                        </div>
                        <h2 id="customer-review-title" className="mt-4 pr-10 text-2xl font-bold leading-tight sm:text-[26px]">How was your experience?</h2>
                        <p id="customer-review-description" className="mt-2 text-sm leading-6 text-[#b4c6d9]">
                            Your feedback helps us make every visit better. Order #{orderNumber}
                        </p>

                        <form onSubmit={submit} className="mt-6">
                            <fieldset>
                                <legend className="text-sm font-semibold text-white">Your rating <span className="text-[#ffb547]">(required)</span></legend>
                                <div role="radiogroup" aria-label="Rating from 1 to 5 stars" className="mt-2 flex items-center gap-1">
                                    {[1, 2, 3, 4, 5].map((value) => (
                                        <button
                                            key={value}
                                            type="button"
                                            role="radio"
                                            aria-label={`${value} ${value === 1 ? "star" : "stars"}`}
                                            aria-checked={rating === value}
                                            tabIndex={rating === value || (rating === 0 && value === 1) ? 0 : -1}
                                            onClick={() => setRating(value)}
                                            onKeyDown={(event) => {
                                                const next = event.key === "ArrowRight" || event.key === "ArrowUp"
                                                    ? Math.min(5, value + 1)
                                                    : event.key === "ArrowLeft" || event.key === "ArrowDown"
                                                        ? Math.max(1, value - 1)
                                                        : event.key === "Home" ? 1 : event.key === "End" ? 5 : null;
                                                if (next !== null) {
                                                    event.preventDefault();
                                                    setRating(next);
                                                    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next - 1]?.focus();
                                                }
                                            }}
                                            className="flex h-12 w-12 items-center justify-center rounded-lg transition-transform duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#62d8f5] motion-reduce:transition-none motion-reduce:hover:scale-100"
                                        >
                                            <Star className={`h-8 w-8 transition-colors motion-reduce:transition-none ${rating >= value ? "fill-[#ffbd55] text-[#ffbd55] review-star-selected" : "text-[#71879a]"}`} aria-hidden="true" />
                                        </button>
                                    ))}
                                    <span className="ml-2 min-w-16 text-xs font-medium text-[#b4c6d9]" aria-live="polite">
                                        {rating ? `${rating} of 5` : "Choose"}
                                    </span>
                                </div>
                            </fieldset>

                            <label htmlFor="customer-review-comment" className="mt-5 block text-sm font-semibold text-white">
                                Tell us more <span className="font-normal text-[#91a9c2]">(optional)</span>
                            </label>
                            <textarea
                                id="customer-review-comment"
                                value={comment}
                                onChange={(event) => setComment(event.target.value)}
                                maxLength={2000}
                                rows={4}
                                placeholder="What did you enjoy about your visit?"
                                className="mt-2 block w-full resize-y rounded-lg border border-[#31536e] bg-[#041b33] px-3.5 py-3 text-sm leading-6 text-white placeholder:text-[#8299ad] transition-colors focus:border-[#19b6df] focus:outline-none focus:ring-2 focus:ring-[#19b6df]/25"
                            />
                            <p className="mt-1 text-right text-[11px] text-[#91a9c2]">{comment.length}/2000</p>

                            {error ? <p role="alert" className="mt-3 rounded-lg border border-[#743b47] bg-[#331f35] px-3 py-2 text-sm leading-5 text-[#ffd9df]">{error}</p> : null}

                            <button
                                type="submit"
                                disabled={rating < 1 || submitting || dismissing}
                                className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#078cf0] px-4 text-sm font-bold text-white transition-colors hover:bg-[#0a9bf9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#70dfff] disabled:cursor-not-allowed disabled:bg-[#31536e] disabled:text-[#b4c6d9]"
                            >
                                {submitting ? <><LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Submitting…</> : "Submit Review"}
                            </button>
                        </form>
                    </>
                )}
            </section>
        </div>
    );
}
