import { ALLOWED_SUBMISSION_FIELDS, ADVANCE_AMOUNT_MIN, ADVANCE_AMOUNT_MAX } from "../config.js";
import { normalizeText, normalizePhone } from "../utils/text.js";
import { validateFileSignature } from "../utils/fileSignatures.js";

export function validateRequiredFields(body) {
    const requiredFields = [
        "name",
        "phone",
        "address",
        "city",
        "advanceAmount"
    ];

    const missingFields = requiredFields.filter((field) => !normalizeText(body[field]));

    if (missingFields.length > 0) {
        const error = new Error(
            `Missing required fields: ${missingFields.join(", ")}`
        );
        error.statusCode = 400;
        throw error;
    }

    const phone = normalizePhone(body.phone);
    if (!/^[6-9]\d{9}$/.test(phone)) {
        const error = new Error("Enter a valid 10-digit phone number.");
        error.statusCode = 400;
        throw error;
    }

    const amountText = normalizeText(body.advanceAmount);
    if (!/^\d+$/.test(amountText)) {
        const error = new Error("Enter a valid integer advance amount.");
        error.statusCode = 400;
        throw error;
    }

    const amount = Number.parseInt(amountText, 10);
    if (!Number.isFinite(amount) || amount < ADVANCE_AMOUNT_MIN || amount > ADVANCE_AMOUNT_MAX) {
        const error = new Error(
            `Enter a valid integer advance amount between ${ADVANCE_AMOUNT_MIN} and ${ADVANCE_AMOUNT_MAX}.`
        );
        error.statusCode = 400;
        throw error;
    }

    if (String(body.terms).toLowerCase() !== "true") {
        const error = new Error("Please confirm the information before submitting.");
        error.statusCode = 400;
        throw error;
    }

    return {
        phone,
        advanceAmount: amount
    };
}

export function validateAllowedFields(body) {
    const unexpectedFields = Object.keys(body || {}).filter(
        (fieldName) => !ALLOWED_SUBMISSION_FIELDS.has(fieldName)
    );

    if (unexpectedFields.length > 0) {
        const error = new Error(`Unexpected field(s): ${unexpectedFields.join(", ")}`);
        error.statusCode = 400;
        throw error;
    }
}

export function validateFile(file, allowedTypes, fieldName) {
    if (!file) {
        return;
    }

    validateFileSignature(file, fieldName, allowedTypes);
}

export function validateFileCollection(files, allowedTypes, fieldName, options = {}) {
    const { minCount = 1, maxCount = 1 } = options;

    if (!Array.isArray(files) || files.length < minCount) {
        const error = new Error(`Missing required file(s): ${fieldName}`);
        error.statusCode = 400;
        throw error;
    }

    if (files.length > maxCount) {
        const error = new Error(
            `You can upload at most ${maxCount} files for ${fieldName}.`
        );
        error.statusCode = 400;
        throw error;
    }

    files.forEach((file) => validateFile(file, allowedTypes, fieldName));
}
