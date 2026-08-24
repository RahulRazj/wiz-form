import { randomUUID } from "crypto";
import path from "path";
import { supabase } from "../lib/supabaseClient.js";
import { SUPABASE_BUCKET, SUPABASE_BUCKETS } from "../config.js";
import { normalizeText, sanitizeFileName } from "../utils/text.js";

export function buildStoragePath(reference, label, fileName) {
    const uniquePart = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    return `${reference}/${label}-${uniquePart}-${sanitizeFileName(fileName)}`;
}

export function getUploadedFileName(file, fallbackName) {
    return normalizeText(file?.originalname) || normalizeText(file?.name) || fallbackName;
}

export function normalizeStorageReference(value) {
    const text = normalizeText(value);

    if (!text) {
        return null;
    }

    if (text.startsWith("http://") || text.startsWith("https://")) {
        return text;
    }

    return text.replace(/^\/+/, "");
}

export async function ensureStorageBucketIsPublic(bucketName) {
    try {
        const { data: bucket } = await supabase.storage.getBucket(bucketName);

        if (!bucket || bucket.public) {
            return;
        }

        await supabase.storage.updateBucket(bucketName, { public: true });
    } catch {
        // Fall back to the existing bucket state if the admin API is unavailable.
    }
}

export async function uploadFile(file, reference, label) {
    if (!file || !file.buffer) {
        const error = new Error(`Missing file data for ${label}.`);
        error.statusCode = 400;
        throw error;
    }

    const storagePath = buildStoragePath(
        reference,
        label,
        getUploadedFileName(file, `${label}.bin`)
    );

    let lastError = null;

    for (const bucketName of SUPABASE_BUCKETS) {
        const { error } = await supabase.storage
            .from(bucketName)
            .upload(storagePath, file.buffer, {
                contentType: file.mimetype,
                upsert: false,
                cacheControl: "3600"
            });

        if (!error) {
            const { data } = supabase.storage
                .from(bucketName)
                .getPublicUrl(storagePath);

            return {
                path: storagePath,
                bucket: bucketName,
                publicUrl: data.publicUrl
            };
        }

        lastError = error;

        if (!String(error.message || "").toLowerCase().includes("bucket not found")) {
            break;
        }
    }

    throw new Error(`Failed to upload ${label}: ${lastError?.message || "Unknown error"}`);
}

export async function uploadFiles(files, reference, label) {
    const uploads = [];

    try {
        for (let index = 0; index < files.length; index += 1) {
            const file = files[index];
            const upload = await uploadFile(file, reference, `${label}-${index + 1}`);
            uploads.push(upload);
        }

        return uploads;
    } catch (error) {
        await removeFiles(uploads);
        throw error;
    }
}

export async function removeFiles(items) {
    if (!items.length) {
        return;
    }

    const groupedByBucket = items.reduce((groups, item) => {
        const bucketName = item.bucket || SUPABASE_BUCKETS[0];
        if (!groups[bucketName]) {
            groups[bucketName] = [];
        }

        groups[bucketName].push(item.path);
        return groups;
    }, {});

    await Promise.all(
        Object.entries(groupedByBucket).map(([bucketName, paths]) =>
            supabase.storage.from(bucketName).remove(paths)
        )
    );
}

export function getStoragePublicUrl(storagePath) {
    const normalizedPath = normalizeStorageReference(storagePath);

    if (!normalizedPath) {
        return null;
    }

    if (normalizedPath.startsWith("http://") || normalizedPath.startsWith("https://")) {
        return normalizedPath;
    }

    return supabase.storage
        .from(SUPABASE_BUCKET)
        .getPublicUrl(normalizedPath).data.publicUrl;
}

export function extractStorageLocation(storageReference) {
    const normalizedReference = normalizeStorageReference(storageReference);

    if (!normalizedReference) {
        return null;
    }

    if (!normalizedReference.startsWith("http://") && !normalizedReference.startsWith("https://")) {
        return {
            bucket: SUPABASE_BUCKETS[0],
            path: normalizedReference
        };
    }

    try {
        const url = new URL(normalizedReference);
        const marker = "/storage/v1/object/public/";
        const markerIndex = url.pathname.indexOf(marker);

        if (markerIndex === -1) {
            return null;
        }

        const objectPath = url.pathname.slice(markerIndex + marker.length);
        const [bucket, ...pathParts] = objectPath.split("/");

        if (!bucket || pathParts.length === 0) {
            return null;
        }

        return {
            bucket,
            path: pathParts.join("/")
        };
    } catch {
        return null;
    }
}

export async function listSubmissionProductImageUrls(productImageValue) {
    const location = extractStorageLocation(productImageValue);

    if (!location) {
        const fallbackUrl = getStoragePublicUrl(productImageValue);
        return fallbackUrl ? [fallbackUrl] : [];
    }

    const folderPath = path.posix.dirname(location.path);
    const storageFolder = folderPath === "." ? "" : folderPath;
    const bucketCandidates = [location.bucket, ...SUPABASE_BUCKETS].filter(Boolean);

    for (const bucketName of bucketCandidates) {
        try {
            const { data, error } = await supabase.storage
                .from(bucketName)
                .list(storageFolder, {
                    limit: 20,
                    sortBy: { column: "name", order: "asc" }
                });

            if (error) {
                if (String(error.message || "").toLowerCase().includes("bucket not found")) {
                    continue;
                }

                break;
            }

            const productFiles = (data || [])
                .filter((file) => file.name.startsWith("product-image"))
                .sort((left, right) => left.name.localeCompare(right.name));

            if (productFiles.length > 0) {
                return productFiles
                    .map((file) => {
                        const filePath = storageFolder ? `${storageFolder}/${file.name}` : file.name;
                        return supabase.storage.from(bucketName).getPublicUrl(filePath).data.publicUrl;
                    })
                    .filter(Boolean);
            }
        } catch {
            // Try the next bucket candidate.
        }
    }

    const fallbackUrl = getStoragePublicUrl(productImageValue);
    return fallbackUrl ? [fallbackUrl] : [];
}

export async function downloadStorageObject(location) {
    let lastError = null;

    const bucketCandidates = SUPABASE_BUCKETS.includes(location.bucket)
        ? SUPABASE_BUCKETS
        : [location.bucket, ...SUPABASE_BUCKETS];

    for (const bucketName of bucketCandidates) {
        const { data, error } = await supabase.storage
            .from(bucketName)
            .download(location.path);

        if (!error && data) {
            return data;
        }

        lastError = error;

        if (error && !String(error.message || "").toLowerCase().includes("bucket not found")) {
            break;
        }
    }

    throw new Error(lastError?.message || "Image not found.");
}
