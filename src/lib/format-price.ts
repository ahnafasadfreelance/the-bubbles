export function formatPrice(amount: number, currency = "BDT") {
    const currencyCode = /^[A-Z]{3}$/.test(currency) ? currency : "BDT";

    try {
        return new Intl.NumberFormat("en-BD", {
            style: "currency",
            currency: currencyCode,
            maximumFractionDigits: 2,
        }).format(amount);
    } catch {
        return new Intl.NumberFormat("en-BD", {
            style: "currency",
            currency: "BDT",
            maximumFractionDigits: 2,
        }).format(amount);
    }
}