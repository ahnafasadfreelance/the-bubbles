"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const GUEST_STORAGE_KEY = "blue-table-ordering-guide-v1";

function storageKey(customerId: string | null) {
    return customerId ? `${GUEST_STORAGE_KEY}:${customerId}` : GUEST_STORAGE_KEY;
}

const STEPS = [
    {
        selector: '[data-tour="categories"]',
        title: "Choose a category",
        description: "Jump straight to the kind of food you’re in the mood for.",
    },
    {
        selector: '[data-tour="add-item"]',
        title: "Add something you love",
        description: "Tap Add on a dish. Your cart updates right away.",
    },
    {
        selector: '[data-tour="cart"]',
        title: "Your cart is always close",
        description: "When you’re ready, open your cart to review your selections.",
    },
    {
        selector: '[data-tour="payment-methods"]',
        title: "Choose how you’ll pay",
        description: "Pick a payment preference for the restaurant. Staff will collect and verify payment at your table.",
    },
    {
        selector: '[data-tour="place-order"]',
        title: "Place your dine-in order",
        description: "Once your table session is active, submit your order here. Your payment preference does not charge you online.",
    },
] as const;

type GuidePosition = { step: number; top: number; left: number };

export function CustomerOrderingGuide({ customerId }: { customerId: string | null }) {
    const pathname = usePathname();
    const [step, setStep] = useState<number | null>(null);
    const [position, setPosition] = useState<GuidePosition | null>(null);
    const [dismissedInVisit, setDismissedInVisit] = useState(false);
    const activeStep = step === 2 && pathname === "/cart" ? 3 : step;
    const completionKey = storageKey(customerId);

    useEffect(() => {
        if (step !== null || dismissedInVisit || pathname !== "/menu") return;
        const timer = window.setTimeout(() => {
            try {
                const completed = window.localStorage.getItem(completionKey);
                const guestProgress = customerId
                    ? window.localStorage.getItem(GUEST_STORAGE_KEY)
                    : null;
                if (completed || guestProgress) {
                    if (guestProgress && !completed) {
                        window.localStorage.setItem(completionKey, guestProgress);
                    }
                    if (guestProgress) window.localStorage.removeItem(GUEST_STORAGE_KEY);
                    return;
                }
            } catch {
                // Keep the guide available for this visit when browser storage is restricted.
            }
            setStep(0);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [completionKey, customerId, dismissedInVisit, pathname, step]);

    const dismiss = useCallback(() => {
        try {
            window.localStorage.setItem(completionKey, "dismissed");
        } catch {
            // The guide is still dismissed for the current page when browser storage is restricted.
        }
        setDismissedInVisit(true);
        setStep(null);
    }, [completionKey]);

    const goToNextStep = useCallback(() => {
        setStep((current) => {
            if (current === null) return current;
            if (current >= STEPS.length - 1) {
                dismiss();
                return current;
            }
            return current + 1;
        });
    }, [dismiss]);

    useEffect(() => {
        if (activeStep === null) return;

        let target: HTMLElement | null = null;
        let resizeObserver: ResizeObserver | null = null;
        let frame: number | null = null;

        const updatePosition = () => {
            if (!target) return;
            const rect = target.getBoundingClientRect();
            const cardHeight = 185;
            const below = rect.bottom + cardHeight + 16 < window.innerHeight;
            setPosition({
                step: activeStep,
                top: below
                    ? Math.min(window.innerHeight - cardHeight - 12, rect.bottom + 14)
                    : Math.max(12, rect.top - cardHeight - 14),
                left: Math.max(12, Math.min(window.innerWidth - 332, rect.left)),
            });
        };
        const schedulePositionUpdate = () => {
            if (frame !== null) window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(updatePosition);
        };
        const findTarget = () => [...document.querySelectorAll<HTMLElement>(STEPS[activeStep].selector)]
            .find((element) => {
                const rect = element.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            }) ?? null;
        const refreshTarget = () => {
            const nextTarget = findTarget();
            if (nextTarget !== target) {
                target?.classList.remove("customer-tour-target");
                resizeObserver?.disconnect();
                target = nextTarget;
                if (!target) {
                    mutationObserver.observe(document.body, { childList: true, subtree: true });
                    return;
                }
                target.classList.add("customer-tour-target");
                target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
                resizeObserver = new ResizeObserver(schedulePositionUpdate);
                resizeObserver.observe(target);
                mutationObserver.disconnect();
            }
            schedulePositionUpdate();
        };
        const mutationObserver = new MutationObserver(refreshTarget);
        mutationObserver.observe(document.body, { childList: true, subtree: true });
        refreshTarget();
        window.addEventListener("resize", refreshTarget);
        window.addEventListener("scroll", schedulePositionUpdate, true);

        return () => {
            mutationObserver.disconnect();
            resizeObserver?.disconnect();
            if (frame !== null) window.cancelAnimationFrame(frame);
            window.removeEventListener("resize", refreshTarget);
            window.removeEventListener("scroll", schedulePositionUpdate, true);
            target?.classList.remove("customer-tour-target");
        };
    }, [activeStep, pathname]);

    useEffect(() => {
        if (activeStep === null) return;

        const onCategoryClick = (event: MouseEvent) => {
            if (activeStep !== 0 || !(event.target instanceof Element)) return;
            if (event.target.closest("[data-tour-action='category']")) setStep(1);
        };
        const onItemAdded = () => {
            if (activeStep === 0 || activeStep === 1) setStep(2);
        };
        const onPaymentSelected = () => {
            if (activeStep === 3) setStep(4);
        };
        const onOrderPlaced = () => {
            if (activeStep === 4) dismiss();
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") dismiss();
        };

        document.addEventListener("click", onCategoryClick, true);
        window.addEventListener("blue-table:item-added", onItemAdded);
        window.addEventListener("blue-table:payment-selected", onPaymentSelected);
        window.addEventListener("blue-table:order-placed", onOrderPlaced);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("click", onCategoryClick, true);
            window.removeEventListener("blue-table:item-added", onItemAdded);
            window.removeEventListener("blue-table:payment-selected", onPaymentSelected);
            window.removeEventListener("blue-table:order-placed", onOrderPlaced);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [activeStep, dismiss]);

    if (activeStep === null || !position || position.step !== activeStep || !STEPS[activeStep]) return null;

    return (
        <>
            <div className="customer-tour-scrim" aria-hidden="true" />
            <aside
                className="customer-tour-card"
                role="dialog"
                aria-modal="false"
                aria-labelledby="customer-tour-title"
                aria-describedby="customer-tour-description"
                style={{ top: position.top, left: position.left }}
            >
                <div className="flex items-start justify-between gap-3">
                    <p className="text-[11px] font-semibold text-[#9fdff2]">Quick guide · {activeStep + 1} of {STEPS.length}</p>
                    <button
                        type="button"
                        onClick={dismiss}
                        aria-label="Close ordering guide"
                        className="-mr-1 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#c2d8e7] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7ce4ff]"
                    >
                        <span aria-hidden="true">×</span>
                    </button>
                </div>
                <h2 id="customer-tour-title" className="mt-1 text-base font-bold text-white">{STEPS[activeStep].title}</h2>
                <p id="customer-tour-description" className="mt-1 text-sm leading-5 text-[#d0e0ec]">{STEPS[activeStep].description}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                    <span aria-live="polite" className="sr-only">Guide step {activeStep + 1} of {STEPS.length}</span>
                    <button
                        type="button"
                        onClick={dismiss}
                        className="inline-flex min-h-10 items-center rounded-full px-3 text-xs font-semibold text-[#b8d0e1] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7ce4ff]"
                    >
                        Skip guide
                    </button>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={goToNextStep}
                            className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#08afe0] px-3 text-xs font-bold text-[#04243e] hover:bg-[#44d1f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7ce4ff]"
                        >
                            {activeStep === STEPS.length - 1 ? "Close" : "Next"}
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
}
