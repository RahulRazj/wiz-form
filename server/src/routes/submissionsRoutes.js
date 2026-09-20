import { Router } from "express";
import multer from "multer";
import { MAX_FILE_SIZE, MAX_PRODUCT_IMAGES, MAX_LIMIT, ORDER_STATUS_VALUES } from "../config.js";
import { enforceSubmissionRateLimit } from "../middleware/rateLimiter.js";
import { requireAdminToken } from "../middleware/adminAuth.js";
import { requireCourierWebhookToken } from "../middleware/courierAuth.js";
import { normalizeText, clampNumber } from "../utils/text.js";
import {
    validateAllowedFields,
    validateRequiredFields,
    validateFile,
    validateFileCollection
} from "../validators/submissionValidators.js";
import {
    createSubmission,
    listSubmissions,
    getSubmissionByReference,
    updateSubmissionStatus,
    handleNCMWebhookEvent,
    createShipmentForOrder,
    getOrderStats,
    deleteSubmission,
    updateSubmission
} from "../services/submissionService.js";

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 6,
        fields: 8,
        parts: 18,
        fieldNameSize: 64,
        fieldSize: 2048
    }
});

const router = Router();

router.post(
    "/",
    (req, res, next) => enforceSubmissionRateLimit(req, res, next),
    upload.fields([
        { name: "productImage", maxCount: MAX_PRODUCT_IMAGES },
        { name: "receiptImage", maxCount: 1 }
    ]),
    async (req, res, next) => {
        try {
            validateAllowedFields(req.body);
            const { phone, advanceAmount } = validateRequiredFields(req.body);
            const productImages = req.files?.productImage || [];
            const receiptImage = req.files?.receiptImage?.[0];

            validateFileCollection(
                productImages,
                ["image/jpeg", "image/png", "image/webp", "image/avif"],
                "productImage",
                { minCount: 1, maxCount: MAX_PRODUCT_IMAGES }
            );
            validateFile(
                receiptImage,
                ["image/jpeg", "image/png", "image/webp", "image/avif", "application/pdf"],
                "receiptImage"
            );

            const result = await createSubmission(
                { ...req.body, phone, advanceAmount },
                req.files
            );

            res.status(201).json({
                message: "Submission stored successfully.",
                ...result
            });
        } catch (error) {
            next(error);
        }
    }
);

router.patch("/:id/status", requireAdminToken, async (req, res, next) => {
    try {
        const id = Number.parseInt(req.params.id, 10);

        if (!Number.isFinite(id)) {
            return res.status(400).json({ error: "A valid submission id is required." });
        }

        const requestedStatus = normalizeText(req.body?.status).toLowerCase();

        if (!ORDER_STATUS_VALUES.includes(requestedStatus)) {
            return res.status(400).json({
                error: `status must be one of: ${ORDER_STATUS_VALUES.join(", ")}`
            });
        }

        let productPrice = Number(req.body?.productPrice);

        if (!Number.isFinite(productPrice) || productPrice <= 0) {
            return res.status(400).json({ error: "productPrice must be a positive number." });
        }

        const enrichedSubmission = await updateSubmissionStatus(id, requestedStatus, productPrice);

        if (!enrichedSubmission) {
            return res.status(404).json({ error: "Submission not found." });
        }

        res.json({ data: enrichedSubmission });
    } catch (error) {
        next(error);
    }
});

router.get("/", requireAdminToken, async (req, res, next) => {
    try {
        const result = await listSubmissions({
            limit: clampNumber(req.query.limit, 1, MAX_LIMIT, 20),
            page: clampNumber(req.query.page, 1, Number.MAX_SAFE_INTEGER, 1),
            fromDate: normalizeText(req.query.fromDate),
            toDate: normalizeText(req.query.toDate),
            search: normalizeText(req.query.search).replace(/,/g, " ").trim(),
            hasReceipt: normalizeText(req.query.hasReceipt).toLowerCase(),
            status: normalizeText(req.query.status).toLowerCase()
        });

        res.json(result);
    } catch (error) {
        next(error);
    }
});

router.get("/stats", requireAdminToken, async (req, res, next) => {
    try {
        const stats = await getOrderStats();
        res.json({ data: stats });
    } catch (error) {
        next(error);
    }
});

// Triggers shipment creation with the third-party courier API for an existing order.
router.post("/:id/create-shipment", requireAdminToken, async (req, res, next) => {
    try {
        const id = Number.parseInt(req.params.id, 10);

        if (!Number.isFinite(id)) {
            return res.status(400).json({ error: "A valid submission id is required." });
        }

        const enrichedSubmission = await createShipmentForOrder(id);

        if (!enrichedSubmission) {
            return res.status(404).json({ error: "Submission not found." });
        }

        res.json({ data: enrichedSubmission });
    } catch (error) {
        next(error);
    }
});


router.get("/:submissionReference", requireAdminToken, async (req, res, next) => {
    try {
        const submissionReference = normalizeText(req.params.submissionReference);

        if (!submissionReference) {
            return res.status(400).json({ error: "submissionReference is required." });
        }

        const enrichedSubmission = await getSubmissionByReference(submissionReference);

        if (!enrichedSubmission) {
            return res.status(404).json({ error: "Submission not found." });
        }

        res.json({ data: enrichedSubmission });
    } catch (error) {
        next(error);
    }
});

router.delete("/:id", requireAdminToken, async (req, res, next) => {
    try {
        const id = Number.parseInt(req.params.id, 10);

        if (!Number.isFinite(id)) {
            return res.status(400).json({ error: "A valid submission id is required." });
        }

        const deleted = await deleteSubmission(id);

        if (!deleted) {
            return res.status(404).json({ error: "Submission not found." });
        }

        res.json({ message: "Order deleted successfully.", data: deleted });
    } catch (error) {
        next(error);
    }
});

router.put("/:id", requireAdminToken, async (req, res, next) => {
    try {
        const id = Number.parseInt(req.params.id, 10);

        if (!Number.isFinite(id)) {
            return res.status(400).json({ error: "A valid submission id is required." });
        }

        const updated = await updateSubmission(id, req.body);

        if (!updated) {
            return res.status(404).json({ error: "Submission not found." });
        }

        res.json({ message: "Order updated successfully.", data: updated });
    } catch (error) {
        next(error);
    }
});

router.post("/ncm/webhook", async (req, res) =>{
    const { order_id,order_ids,event,timestamp,status } = req.body;

    const ids = order_ids ?? [order_id];

    // Always acknowledge NCM quickly
    res.sendStatus(200);

    await handleNCMWebhookEvent({ orderIds: ids, event, status, timestamp });
});

export default router;
