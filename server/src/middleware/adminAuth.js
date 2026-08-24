import { ADMIN_SECRET_TOKEN } from "../config.js";

export function requireAdminToken(req, res, next) {
    if (!ADMIN_SECRET_TOKEN) {
        return res.status(500).json({
            error: "Admin access token is not configured on the server. Set ADMIN_SECRET_TOKEN in server/.env."
        });
    }

    const providedToken = req.get("x-admin-token") || "";

    if (providedToken !== ADMIN_SECRET_TOKEN) {
        return res.status(401).json({ error: "Invalid or missing admin token." });
    }

    next();
}
