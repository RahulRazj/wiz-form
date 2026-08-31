import { supabase } from "../lib/supabaseClient.js";
import { SUPABASE_TABLE, IMAGE_CLEANUP_RETENTION_DAYS } from "../config.js";
import { removeSubmissionImageFiles } from "./storageService.js";

const LOG_PREFIX = "[cleanupService]";

// Deletes stored images for orders older than IMAGE_CLEANUP_RETENTION_DAYS and nulls
// out their image columns. No-op when the retention period is not configured.
export async function cleanupExpiredImages() {
    if (!IMAGE_CLEANUP_RETENTION_DAYS || IMAGE_CLEANUP_RETENTION_DAYS <= 0) {
        return { skipped: true, cleanedCount: 0, failedCount: 0, totalCandidates: 0 };
    }

    const cutoff = new Date(Date.now() - IMAGE_CLEANUP_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .select("id, productImage, receiptImage")
        .lt("created_at", cutoff)
        .or("productImage.not.is.null,receiptImage.not.is.null");

    if (error) {
        throw new Error(`Failed to fetch submissions for image cleanup: ${error.message}`);
    }

    let cleanedCount = 0;
    let failedCount = 0;

    for (const row of data || []) {
        try {
            await removeSubmissionImageFiles(row);

            const { error: updateError } = await supabase
                .from(SUPABASE_TABLE)
                .update({ productImage: null, receiptImage: null })
                .eq("id", row.id);

            if (updateError) {
                throw new Error(updateError.message);
            }

            cleanedCount += 1;
        } catch (cleanupError) {
            failedCount += 1;
            console.error(`${LOG_PREFIX} failed to clean up images for submission ${row.id}: ${cleanupError.message}`);
        }
    }

    console.info(
        `${LOG_PREFIX} run complete: ${cleanedCount} cleaned, ${failedCount} failed, cutoff=${cutoff}.`
    );

    return { cutoff, cleanedCount, failedCount, totalCandidates: (data || []).length };
}
