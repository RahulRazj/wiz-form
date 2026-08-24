export function isJpegBuffer(buffer) {
    return buffer?.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

export function isPngBuffer(buffer) {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((byte, index) => buffer?.[index] === byte);
}

export function isWebpBuffer(buffer) {
    return buffer?.length >= 12
        && buffer.slice(0, 4).toString("ascii") === "RIFF"
        && buffer.slice(8, 12).toString("ascii") === "WEBP";
}

export function isPdfBuffer(buffer) {
    return buffer?.length >= 5 && buffer.slice(0, 5).toString("ascii") === "%PDF-";
}

export function validateFileSignature(file, fieldName) {
    if (!file?.buffer?.length) {
        const error = new Error(`Missing file data for ${fieldName}.`);
        error.statusCode = 400;
        throw error;
    }

    const buffer = file.buffer;

    if (fieldName === "receiptImage") {
        if (file.mimetype === "application/pdf" && isPdfBuffer(buffer)) {
            return;
        }

        if (file.mimetype === "image/jpeg" && isJpegBuffer(buffer)) {
            return;
        }

        if (file.mimetype === "image/png" && isPngBuffer(buffer)) {
            return;
        }

        if (file.mimetype === "image/webp" && isWebpBuffer(buffer)) {
            return;
        }

        const error = new Error(`Unsupported file contents for ${fieldName}.`);
        error.statusCode = 400;
        throw error;
    }

    if (file.mimetype === "image/jpeg" && isJpegBuffer(buffer)) {
        return;
    }

    if (file.mimetype === "image/png" && isPngBuffer(buffer)) {
        return;
    }

    if (file.mimetype === "image/webp" && isWebpBuffer(buffer)) {
        return;
    }

    const error = new Error(`Unsupported file contents for ${fieldName}.`);
    error.statusCode = 400;
    throw error;
}
