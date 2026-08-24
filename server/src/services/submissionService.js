import { randomUUID } from "crypto";
import { supabase } from "../lib/supabaseClient.js";
import {
    SUPABASE_TABLE,
    ORDER_STATUS_VALUES,
    DEFAULT_ORDER_STATUS
} from "../config.js";
import { normalizeText } from "../utils/text.js";
import {
    uploadFile,
    uploadFiles,
    removeFiles,
    getStoragePublicUrl,
    listSubmissionProductImageUrls
} from "./storageService.js";

export function generateSubmissionReference() {
    return `ORD-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export function generateOrderId() {
    return `WZ-${Date.now().toString(36).toUpperCase()}-${randomUUID()
        .slice(0, 6)
        .toUpperCase()}`;
}

export function normalizeOrderStatus(value) {
    const status = normalizeText(value).toLowerCase();
    return ORDER_STATUS_VALUES.includes(status) ? status : DEFAULT_ORDER_STATUS;
}

export function getSubmissionPublicFields(submission) {
    return {
        ...submission,
        productImageUrls: [],
        receiptImageUrl: getStoragePublicUrl(submission.receiptImage),
        productImage: getStoragePublicUrl(submission.productImage),
        orderId: submission.orderId || submission.orderid || null,
        status: normalizeOrderStatus(submission.status)
    };
}

export async function enrichSubmission(submission) {
    return {
        ...getSubmissionPublicFields(submission),
        productImageUrls: await listSubmissionProductImageUrls(submission.productImage)
    };
}

export async function createSubmission(body, files) {
    const productImages = files?.productImage || [];
    const receiptImage = files?.receiptImage?.[0];

    const submissionReference = generateSubmissionReference();
    const orderId = generateOrderId();
    const uploadedFiles = [];

    const productUploads = await uploadFiles(
        productImages,
        submissionReference,
        "product-image"
    );
    uploadedFiles.push(...productUploads);

    const primaryProductUpload = productUploads[0];

    const receiptUpload = receiptImage
        ? await uploadFile(receiptImage, submissionReference, "receipt")
        : null;

    if (receiptUpload) {
        uploadedFiles.push(receiptUpload);
    }

    const submission = {
        orderId,
        name: normalizeText(body.name),
        phone: body.phone,
        city: normalizeText(body.city),
        productImage: primaryProductUpload ? getStoragePublicUrl(primaryProductUpload.path) : null,
        advanceAmount: body.advanceAmount,
        receiptImage: receiptUpload ? getStoragePublicUrl(receiptUpload.path) : null,
        address: normalizeText(body.address),
        status: DEFAULT_ORDER_STATUS
    };

    const { error, data } = await supabase
        .from(SUPABASE_TABLE)
        .insert(submission)
        .select("id, created_at")
        .single();

    if (error) {
        await removeFiles(uploadedFiles);

        if (String(error.message || "").includes("orderId")) {
            throw new Error(
                `Your Supabase table ${SUPABASE_TABLE} is missing the orderId column. Run server/migrations/001_create_order_submissions.sql in the Supabase SQL editor, then retry.`
            );
        }

        throw new Error(`Failed to save submission: ${error.message}`);
    }

    return {
        orderId,
        id: data.id,
        created_at: data.created_at
    };
}

export async function listSubmissions(query) {
    const limit = query.limit;
    const page = query.page;
    const { fromDate, toDate, search, hasReceipt } = query;
    const offset = (page - 1) * limit;

    let dbQuery = supabase
        .from(SUPABASE_TABLE)
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + limit - 1);

    if (search) {
        const searchPattern = `%${search}%`;
        dbQuery = dbQuery.or(
            [
                `orderId.ilike.${searchPattern}`,
                `name.ilike.${searchPattern}`,
                `phone.ilike.${searchPattern}`,
                `city.ilike.${searchPattern}`,
                `address.ilike.${searchPattern}`
            ].join(",")
        );
    }

    if (fromDate) {
        dbQuery = dbQuery.gte("created_at", fromDate);
    }

    if (toDate) {
        dbQuery = dbQuery.lte("created_at", toDate);
    }

    if (hasReceipt === "true") {
        dbQuery = dbQuery.not("receiptImage", "is", null);
    } else if (hasReceipt === "false") {
        dbQuery = dbQuery.is("receiptImage", null);
    }

    const { data, error, count } = await dbQuery;

    if (error) {
        throw new Error(`Failed to fetch submissions: ${error.message}`);
    }

    const enrichedData = await Promise.all((data || []).map(enrichSubmission));

    return {
        data: enrichedData,
        pagination: {
            page,
            limit,
            total: count || 0,
            totalPages: count ? Math.ceil(count / limit) : 0,
            hasMore: offset + limit < (count || 0)
        },
        filters: {
            fromDate: fromDate || null,
            toDate: toDate || null,
            search: search || null,
            hasReceipt: hasReceipt === "true" ? true : hasReceipt === "false" ? false : null
        }
    };
}

export async function getSubmissionByReference(submissionReference) {
    const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .select("*")
        .eq("submission_reference", submissionReference)
        .single();

    if (error) {
        return null;
    }

    return enrichSubmission(data);
}

export async function updateSubmissionStatus(id, status) {
    const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .update({ status })
        .eq("id", id)
        .select("*")
        .single();

    if (error) {
        if (String(error.message || "").toLowerCase().includes("status")) {
            throw new Error(
                `Your Supabase table ${SUPABASE_TABLE} is missing the status column. Run server/migrations/001_create_order_submissions.sql in the Supabase SQL editor, then retry.`
            );
        }

        throw new Error(`Failed to update order status: ${error.message}`);
    }

    if (!data) {
        return null;
    }

    return enrichSubmission(data);
}

function getRangeBoundaries(now) {
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = startOfDay.getDay();
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - daysSinceMonday);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    return { startOfDay, startOfWeek, startOfMonth, startOfYear };
}

function createEmptyRangeBucket() {
    return { count: 0, totalAmount: 0 };
}

function addToBucket(bucket, amount) {
    bucket.count += 1;
    bucket.totalAmount += Number.isFinite(amount) ? amount : 0;
}

function roundBucket(bucket) {
    return {
        count: bucket.count,
        totalAmount: Math.round(bucket.totalAmount * 100) / 100
    };
}

export async function getOrderStats() {
    const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .select("id, created_at, advanceAmount, status, receiptImage");

    if (error) {
        throw new Error(`Failed to load order statistics: ${error.message}`);
    }

    const now = new Date();
    const { startOfDay, startOfWeek, startOfMonth, startOfYear } = getRangeBoundaries(now);

    const ranges = {
        today: createEmptyRangeBucket(),
        week: createEmptyRangeBucket(),
        month: createEmptyRangeBucket(),
        year: createEmptyRangeBucket(),
        allTime: createEmptyRangeBucket()
    };

    const statusBreakdown = { placed: 0, created: 0, delivered: 0 };
    const receipts = { withReceipt: 0, withoutReceipt: 0 };

    (data || []).forEach((row) => {
        const createdAt = new Date(row.created_at);
        const amount = Number(row.advanceAmount);

        addToBucket(ranges.allTime, amount);

        if (createdAt >= startOfYear) {
            addToBucket(ranges.year, amount);
        }

        if (createdAt >= startOfMonth) {
            addToBucket(ranges.month, amount);
        }

        if (createdAt >= startOfWeek) {
            addToBucket(ranges.week, amount);
        }

        if (createdAt >= startOfDay) {
            addToBucket(ranges.today, amount);
        }

        const status = normalizeOrderStatus(row.status);
        statusBreakdown[status] += 1;

        if (row.receiptImage) {
            receipts.withReceipt += 1;
        } else {
            receipts.withoutReceipt += 1;
        }
    });

    return {
        generatedAt: now.toISOString(),
        ranges: {
            today: roundBucket(ranges.today),
            week: roundBucket(ranges.week),
            month: roundBucket(ranges.month),
            year: roundBucket(ranges.year),
            allTime: roundBucket(ranges.allTime)
        },
        statusBreakdown,
        receipts
    };
}

