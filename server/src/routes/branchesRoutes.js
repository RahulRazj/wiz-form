import { Router } from "express";
import { getCourierBranches } from "../services/trackingService.js";

const router = Router();

router.get("/", async (req, res, next) => {
    try {
        const branches = await getCourierBranches();
        res.json({ data: branches });
    } catch (error) {
        next(error);
    }
});

export default router;
