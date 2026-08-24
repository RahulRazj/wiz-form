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

export const PORT = Number(process.env.PORT || 3000);
export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const SUPABASE_TABLE = process.env.SUPABASE_TABLE || "order_submissions";
export const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "order-submissions";
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

export const ORDER_STATUS_VALUES = ["pending", "placed", "created", "dispatched", "delivered", "exchange"];
export const DEFAULT_ORDER_STATUS = "pending";

export const ADMIN_SECRET_TOKEN = process.env.ADMIN_SECRET_TOKEN || "";
export const COURIER_WEBHOOK_SECRET = process.env.COURIER_WEBHOOK_SECRET || "";

export const SUBMISSION_RATE_WINDOW_MS = 15 * 60 * 1000;
export const SUBMISSION_RATE_LIMIT = 12;

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
