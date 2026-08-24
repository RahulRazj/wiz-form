import { COURIER_WEBHOOK_SECRET } from "../config.js";

export function requireCourierWebhookToken(req, res, next) {
    if (!COURIER_WEBHOOK_SECRET) {
        return res.status(500).json({
            error: "Courier webhook secret is not configured on the server. Set COURIER_WEBHOOK_SECRET in server/.env."
        });
    }

    const providedToken = req.get("x-webhook-token") || "";

    if (providedToken !== COURIER_WEBHOOK_SECRET) {
        return res.status(401).json({ error: "Invalid or missing webhook token." });
    }

    next();
}
