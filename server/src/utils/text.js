export function normalizeText(value) {
    return String(value || "").trim();
}

export function normalizePhone(value) {
    return normalizeText(value).replace(/\D/g, "");
}

export function clampNumber(value, min, max, fallback) {
    const parsed = Number.parseInt(value, 10);

    if (Number.isNaN(parsed)) {
        return fallback;
    }

    return Math.min(max, Math.max(min, parsed));
}

export function sanitizeFileName(fileName) {
    return fileName
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .slice(0, 80)
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "file";
}
