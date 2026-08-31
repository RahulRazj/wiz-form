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

// AVIF/HEIF images use an ISOBMFF container: a size word, then "ftyp", then a brand code.
export function isAvifBuffer(buffer) {
    return buffer?.length >= 12
        && buffer.slice(4, 8).toString("ascii") === "ftyp"
        && ["avif", "avis"].includes(buffer.slice(8, 12).toString("ascii"));
}

const SIGNATURE_DETECTORS = [
    { mimetype: "image/jpeg", test: isJpegBuffer },
    { mimetype: "image/png", test: isPngBuffer },
    { mimetype: "image/webp", test: isWebpBuffer },
    { mimetype: "image/avif", test: isAvifBuffer },
    { mimetype: "application/pdf", test: isPdfBuffer }
];

// Detects the real file type from its bytes, ignoring whatever mimetype the client declared.
export function detectFileMimetype(buffer) {
    const match = SIGNATURE_DETECTORS.find((detector) => detector.test(buffer));
    return match ? match.mimetype : null;
}

export function validateFileSignature(file, fieldName, allowedTypes) {
    if (!file?.buffer?.length) {
        const error = new Error(`Missing file data for ${fieldName}.`);
        error.statusCode = 400;
        throw error;
    }

    const detectedType = detectFileMimetype(file.buffer);

    if (!detectedType || !allowedTypes.includes(detectedType)) {
        const error = new Error(`Unsupported file contents for ${fieldName}.`);
        error.statusCode = 400;
        throw error;
    }

    // Trust the sniffed type over the client-declared mimetype for downstream storage/content-type.
    file.mimetype = detectedType;
}
