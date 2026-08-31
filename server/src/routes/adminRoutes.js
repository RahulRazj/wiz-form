import { Router } from "express";
import { requireAdminToken } from "../middleware/adminAuth.js";
import { cleanupExpiredImages } from "../services/cleanupService.js";

const router = Router();

router.get("/verify", requireAdminToken, (req, res) => {
    res.json({ ok: true });
});

router.post("/cleanup-images", requireAdminToken, async (req, res, next) => {
    try {
        const result = await cleanupExpiredImages();
        res.json({ data: result });
    } catch (error) {
        next(error);
    }
});

export default router;
