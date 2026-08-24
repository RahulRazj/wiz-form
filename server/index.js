import express from "express";
import cors from "cors";
import path from "path";
import { PORT, SUPABASE_BUCKETS, projectRoot } from "./src/config.js";
import { ensureStorageBucketIsPublic } from "./src/services/storageService.js";
import submissionsRoutes from "./src/routes/submissionsRoutes.js";
import storageRoutes from "./src/routes/storageRoutes.js";
import adminRoutes from "./src/routes/adminRoutes.js";
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

app.use(errorHandler);

async function startServer() {
    await Promise.all(SUPABASE_BUCKETS.map((bucketName) => ensureStorageBucketIsPublic(bucketName)));

    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

startServer();
