import { Router } from "express";
import { normalizeText } from "../utils/text.js";
import { getStoragePublicUrl, extractStorageLocation, downloadStorageObject } from "../services/storageService.js";
import { requireAdminToken } from "../middleware/adminAuth.js";

const router = Router();

router.get("/public-url", requireAdminToken, async (req, res) => {
    const storagePath = normalizeText(req.query.path);
    const directUrl = normalizeText(req.query.url);

    if (directUrl) {
        return res.json({
            publicUrl: directUrl
        });
    }

    if (!storagePath) {
        return res.status(400).json({
            error: "path or url is required."
        });
    }

    return res.json({
        publicUrl: getStoragePublicUrl(storagePath)
    });
});

router.get("/image", requireAdminToken, async (req, res) => {
    const location = extractStorageLocation(req.query.url || req.query.path);

    if (!location) {
        return res.status(400).json({
            error: "url or path is required."
        });
    }

    try {
        const data = await downloadStorageObject(location);
        const arrayBuffer = await data.arrayBuffer();
        const contentType = data.type || "application/octet-stream";

        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=3600");
        return res.send(Buffer.from(arrayBuffer));
    } catch (error) {
        return res.status(404).json({
            error: error.message || "Image not found."
        });
    }
});

export default router;
