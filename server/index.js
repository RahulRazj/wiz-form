import express from "express";
import cors from "cors";
import path from "path";
import { PORT, SUPABASE_BUCKETS, IMAGE_CLEANUP_RETENTION_DAYS, IMAGE_CLEANUP_INTERVAL_DAYS, projectRoot } from "./src/config.js";
import { ensureStorageBucketIsPublic } from "./src/services/storageService.js";
import { cleanupExpiredImages } from "./src/services/cleanupService.js";
import submissionsRoutes from "./src/routes/submissionsRoutes.js";
import storageRoutes from "./src/routes/storageRoutes.js";
import adminRoutes from "./src/routes/adminRoutes.js";
import branchesRoutes from "./src/routes/branchesRoutes.js";
import { errorHandler } from "./src/middleware/errorHandler.js";

const app = express();

app.set("trust proxy", true);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (req, res) => {
    res.json({ ok: true });
});

app.use("/api/submissions", submissionsRoutes);
app.use("/api/storage", storageRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/branches", branchesRoutes);

app.use(errorHandler);

function startImageCleanupTimer() {
    if (!IMAGE_CLEANUP_RETENTION_DAYS || IMAGE_CLEANUP_RETENTION_DAYS <= 0) {
        console.log("Image cleanup disabled (set IMAGE_CLEANUP_RETENTION_DAYS in server/.env to enable).");
        return;
    }

    const intervalMs = Math.max(IMAGE_CLEANUP_INTERVAL_DAYS, 1) * 24 * 60 * 60 * 1000;

    console.log(
        `Image cleanup enabled: removing images older than ${IMAGE_CLEANUP_RETENTION_DAYS} day(s), checking every ${IMAGE_CLEANUP_INTERVAL_DAYS} day(s).`
    );

    cleanupExpiredImages().catch((error) => console.error("[cleanup] initial run failed:", error.message));
    setInterval(() => {
        cleanupExpiredImages().catch((error) => console.error("[cleanup] scheduled run failed:", error.message));
    }, intervalMs);
}

async function startServer() {
    await Promise.all(SUPABASE_BUCKETS.map((bucketName) => ensureStorageBucketIsPublic(bucketName)));

    app.listen(PORT, () => {
        startImageCleanupTimer();
    });
}

startServer();
