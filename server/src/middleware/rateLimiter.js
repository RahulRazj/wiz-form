import { SUBMISSION_RATE_LIMIT, SUBMISSION_RATE_WINDOW_MS } from "../config.js";

const submissionRateBuckets = new Map();

function getRequestRateKey(req) {
    return req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
}

export function enforceSubmissionRateLimit(req, res, next) {
    const key = getRequestRateKey(req);
    const now = Date.now();
    const currentBucket = submissionRateBuckets.get(key) || {
        count: 0,
        resetAt: now + SUBMISSION_RATE_WINDOW_MS
    };

    if (now > currentBucket.resetAt) {
        currentBucket.count = 0;
        currentBucket.resetAt = now + SUBMISSION_RATE_WINDOW_MS;
    }

    currentBucket.count += 1;
    submissionRateBuckets.set(key, currentBucket);

    if (currentBucket.count > SUBMISSION_RATE_LIMIT) {
        const retryAfterSeconds = Math.max(1, Math.ceil((currentBucket.resetAt - now) / 1000));
        res.setHeader("Retry-After", String(retryAfterSeconds));
        return res.status(429).json({
            error: "Too many submissions from this source. Please try again later."
        });
    }

    return next();
}
