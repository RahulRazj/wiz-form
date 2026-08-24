import { Router } from "express";
import { requireAdminToken } from "../middleware/adminAuth.js";

const router = Router();

router.get("/verify", requireAdminToken, (req, res) => {
    res.json({ ok: true });
});

export default router;
