import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const projectRoot = path.resolve(__dirname, "..", "..");

dotenv.config({ path: path.join(projectRoot, "server", ".env") });

function normalizeText(value) {
    return String(value || "").trim();
}

function parseIntegerEnv(value, fallback) {
    const parsed = Number.parseInt(value, 10);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const PORT = Number(process.env.PORT || 3000);
export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const SUPABASE_TABLE = process.env.SUPABASE_TABLE || "wiz_order_preview";
export const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "wiz_bucket_preview";
export const SUPABASE_BUCKETS = Array.from(
    new Set([
        ...normalizeText(SUPABASE_BUCKET)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        "order-submissions",
        "wiz_bucket"
    ])
);

export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const MAX_PRODUCT_IMAGES = 5;
export const MAX_LIMIT = 100;
export const ADVANCE_AMOUNT_MIN = parseIntegerEnv(process.env.ADVANCE_AMOUNT_MIN, 200);
export const ADVANCE_AMOUNT_MAX = Math.max(
    ADVANCE_AMOUNT_MIN,
    parseIntegerEnv(process.env.ADVANCE_AMOUNT_MAX, 100000)
);

export const ORDER_STATUS_VALUES = ["pending", "placed", "created", "dispatched", "delivered", "exchange", "cancelled"];
export const DEFAULT_ORDER_STATUS = "pending";

export const ADMIN_SECRET_TOKEN = process.env.ADMIN_SECRET_TOKEN || "";
export const COURIER_WEBHOOK_SECRET = process.env.COURIER_WEBHOOK_SECRET || "";

// NCM courier API used to create shipments for dispatched orders.
export const NCM_API_BASE_URL = process.env.NCM_API_URL || "";
export const NCM_API_KEY = process.env.NCM_API_KEY || "";
export const NCM_API_TIMEOUT_MS = Number(process.env.NCM_API_TIMEOUT_MS || 10000);
export const NCM_WEBHOOK_SECRET = process.env.NCM_WEBHOOK_SECRET || "";

// API Endpoints
export const NCM_CREATE_ORDER_PATH = process.env.NCM_CREATE_ORDER_PATH;
export const NCM_BRANCH_LIST = process.env.NCM_BRANCH_LIST;

export const SUBMISSION_RATE_WINDOW_MS = 15 * 60 * 1000;
export const SUBMISSION_RATE_LIMIT = 12;

// Background job that deletes order images from Supabase storage once they're older
// than this many days. 0 (default) keeps the feature disabled.
export const IMAGE_CLEANUP_RETENTION_DAYS = Number(process.env.IMAGE_CLEANUP_RETENTION_DAYS || 0);
export const IMAGE_CLEANUP_INTERVAL_DAYS = Number(process.env.IMAGE_CLEANUP_INTERVAL_DAYS || 1);

export const ALLOWED_SUBMISSION_FIELDS = new Set([
    "name",
    "phone",
    "address",
    "city",
    "advanceAmount",
    "productSize",
    "terms"
]);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
        "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server/.env"
    );
}
