import { randomUUID } from "crypto";
import { supabase } from "../lib/supabaseClient.js";
import {
    SUPABASE_TABLE,
    ORDER_STATUS_VALUES,
    DEFAULT_ORDER_STATUS
} from "../config.js";
import { normalizeText, normalizePhone } from "../utils/text.js";
import {
    uploadFile,
    uploadFiles,
    removeFiles,
    getStoragePublicUrl,
    listSubmissionProductImageUrls,
    removeSubmissionImageFiles
} from "./storageService.js";
import { createCourierShipment } from "./trackingService.js";

function toFiniteNumber(value) {
    const number = Number(value);

    return Number.isFinite(number) ? number : null;
}

function roundMoney(value) {
    return Math.round(value * 100) / 100;
}

function calculateCodAmount(productPrice, advanceAmount) {
    const normalizedProductPrice = toFiniteNumber(productPrice);

    if (normalizedProductPrice == null) {
        return null;
    }

    const normalizedAdvanceAmount = Math.max(0, toFiniteNumber(advanceAmount) ?? 0);

    return Math.max(0, roundMoney(normalizedProductPrice - normalizedAdvanceAmount));
}

function getReceivedCodAmount(submission, codAmount) {
    const normalizedStatus = normalizeOrderStatus(submission.status);
    const storedReceivedAmount = toFiniteNumber(submission.codReceivedAmount);

    if (normalizedStatus === "delivered" || normalizedStatus === "cancelled") {
        return Math.max(0, storedReceivedAmount ?? codAmount ?? 0);
    }

    return Math.max(0, storedReceivedAmount ?? 0);
}

function getCourierTrackingId(shipment) {
    return normalizeText(
        shipment?.raw?.orderid
    ) || null;
}

export function generateSubmissionReference() {
    return `ORD-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export function generateOrderId() {
    return randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}

export function normalizeOrderStatus(value) {
    const status = normalizeText(value).toLowerCase();
    return ORDER_STATUS_VALUES.includes(status) ? status : DEFAULT_ORDER_STATUS;
}

export function getSubmissionPublicFields(submission) {
    const productPrice = toFiniteNumber(submission.productPrice);
    const advanceAmount = toFiniteNumber(submission.advanceAmount) ?? 0;
    const codAmount = calculateCodAmount(productPrice, advanceAmount);
    const codReceivedAmount = getReceivedCodAmount(submission, codAmount);

    return {
        ...submission,
        productImageUrls: [],
        receiptImageUrl: getStoragePublicUrl(submission.receiptImage),
        productImage: getStoragePublicUrl(submission.productImage),
        orderId: submission.orderId || submission.orderid || null,
        trackingId: normalizeText(submission.trackingId) || null,
        status: normalizeOrderStatus(submission.status),
        productPrice,
        codReceivedAmount,
        cod_charge: codAmount,
        remainingCod: codAmount == null ? null : Math.max(0, roundMoney(codAmount - codReceivedAmount))
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
        productSize: normalizeText(body.productSize) || null,
        advanceAmount: body.advanceAmount,
        receiptImage: receiptUpload ? getStoragePublicUrl(receiptUpload.path) : null,
        address: normalizeText(body.address),
        status: DEFAULT_ORDER_STATUS,
        codReceivedAmount: 0
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
    const { fromDate, toDate, search, hasReceipt, status } = query;
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

    if (status && ORDER_STATUS_VALUES.includes(status)) {
        dbQuery = dbQuery.eq("status", status);
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
            hasReceipt: hasReceipt === "true" ? true : hasReceipt === "false" ? false : null,
            status: status || null
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

// Moving placed -> created must create the courier shipment first; the status only
// changes once that call succeeds, so a failed shipment never leaves an order "placed".
export async function updateSubmissionStatus(id, status, productPrice) {
    const { data: existing, error: fetchError } = await supabase
        .from(SUPABASE_TABLE)
        .select("*")
        .eq("id", id)
        .single();

    if (fetchError || !existing) {
        return null;
    }
    const updatePayload = { status };
    const normalizedAdvanceAmount = toFiniteNumber(existing.advanceAmount);
    const normalizedProductPrice = toFiniteNumber(productPrice);

    if (productPrice !== undefined) {
        if (normalizedProductPrice == null || normalizedProductPrice <= 0) {
            const error = new Error("productPrice must be a positive number.");
            error.statusCode = 400;
            throw error;
        }

        if (normalizedAdvanceAmount == null) {
            const error = new Error("Stored advance amount is invalid for this order.");
            error.statusCode = 400;
            throw error;
        }

        if (normalizedProductPrice < normalizedAdvanceAmount) {
            const error = new Error("productPrice must be greater than or equal to advanceAmount.");
            error.statusCode = 400;
            throw error;
        }

        updatePayload.productPrice = normalizedProductPrice;
    }

    const codAmount = calculateCodAmount(
        normalizedProductPrice ?? existing.productPrice,
        normalizedAdvanceAmount
    );

    if (status === "delivered" || status === "cancelled") {
        updatePayload.codReceivedAmount = codAmount ?? 0;
    } else {
        updatePayload.codReceivedAmount = 0;
    }

    if (status === "created" && normalizeOrderStatus(existing.status) === "placed") {
        const orderRef = existing.orderId || id;
        let shipment;

        try {
            shipment = await createCourierShipment(
                getSubmissionPublicFields({
                    ...existing,
                    productPrice: normalizedProductPrice ?? existing.productPrice
                })
            );

        } catch (error) {
            console.error(`[submissionService] shipment creation failed for order ${orderRef}: ${error.message}`);
            throw error;
        }

        const courierTrackingId = getCourierTrackingId(shipment);

        if (courierTrackingId) {
            updatePayload.trackingId = courierTrackingId;
        }

        console.info(`[submissionService] shipment created for order ${orderRef}; moving status to placed.`);
    }

    const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .update(updatePayload)
        .eq("id", id)
        .select("*")
        .single();

    if (error) {
        throw new Error(`Failed to update order status: ${error.message}`);
    }

    if (!data) {
        return null;
    }

    return enrichSubmission(data);
}

export async function updateTrackingId(orderId, trackingId) {
    const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .update({ trackingId })
        .eq("orderId", orderId)
        .select("*")
        .single();

    if (error) {
        if (String(error.message || "").toLowerCase().includes("trackingid")) {
            throw new Error(
                `Your Supabase table ${SUPABASE_TABLE} is missing the trackingId column. Run server/migrations/001_create_order_submissions.sql in the Supabase SQL editor, then retry.`
            );
        }

        throw new Error(`Failed to update tracking id: ${error.message}`);
    }

    if (!data) {
        return null;
    }

    return enrichSubmission(data);
}

// Calls the third-party courier API to create a shipment for an existing order.
// The order status only moves to "placed" once the courier API confirms success.
export async function createShipmentForOrder(id) {
    const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .select("*")
        .eq("id", id)
        .single();

    if (error || !data) {
        return null;
    }

    const orderRef = data.orderId || id;

    let shipment;

    try {
        shipment = await createCourierShipment(getSubmissionPublicFields(data));
    } catch (error) {
        console.error(`[submissionService] shipment creation failed for order ${orderRef}: ${error.message}`);
        throw error;
    }

    const updatePayload = { status: "placed" };
    const courierTrackingId = getCourierTrackingId(shipment);

    if (courierTrackingId) {
        updatePayload.trackingId = courierTrackingId;
    }

    const { data: updatedData, error: updateError } = await supabase
        .from(SUPABASE_TABLE)
        .update(updatePayload)
        .eq("id", id)
        .select("*")
        .single();

    if (updateError) {
        console.error(`[submissionService] shipment created but failed to persist order ${orderRef} status: ${updateError.message}`);
        throw new Error(`Shipment created but failed to update order status: ${updateError.message}`);
    }

    console.info(`[submissionService] order ${orderRef} marked as placed after successful shipment creation.`);

    return enrichSubmission(updatedData);
}

export async function handleNCMWebhookEvent(payload) {
    const { orderIds, event, status, timestamp } = payload;

    for (const orderId of orderIds) {
        // Update the order status based on the webhook event
    }
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
    return {
        count: 0,
        pricedCount: 0,
        advanceReceived: 0,
        totalSales: 0,
        pendingCod: 0,
        statusBreakdown: { pending: 0, placed: 0, created: 0, dispatched: 0, delivered: 0, exchange: 0, cancelled: 0 },
        statusSalesBreakdown: { pending: 0, placed: 0, created: 0, dispatched: 0, delivered: 0, exchange: 0, cancelled: 0 }
    };
}

function createEmptyStatusTotals() {
    return {
        pending: { qty: 0, amount: 0 },
        placed: { qty: 0, amount: 0 },
        created: { qty: 0, amount: 0 },
        dispatched: { qty: 0, amount: 0 },
        delivered: { qty: 0, amount: 0 },
        exchange: { qty: 0, amount: 0 },
        cancelled: { qty: 0, amount: 0 }
    };
}

function addToBucket(bucket, { advanceAmount, productPrice, status }) {
    bucket.count += 1;
    const normalizedAdvanceAmount = toFiniteNumber(advanceAmount) ?? 0;
    const normalizedProductPrice = toFiniteNumber(productPrice);
    const codAmount = calculateCodAmount(normalizedProductPrice, normalizedAdvanceAmount);
    const receivedAmount = status === "delivered" || status === "cancelled" ? codAmount ?? 0 : 0;

    bucket.advanceReceived += Math.max(0, normalizedAdvanceAmount);

    if (normalizedProductPrice != null) {
        bucket.pricedCount += 1;
        bucket.totalSales += Math.max(0, normalizedProductPrice);
        bucket.pendingCod += Math.max(0, (codAmount ?? 0) - receivedAmount);
        bucket.statusSalesBreakdown[status] = (bucket.statusSalesBreakdown[status] ?? 0) + Math.max(0, normalizedProductPrice);
    }

    bucket.statusBreakdown[status] = (bucket.statusBreakdown[status] ?? 0) + 1;
}

function roundBucket(bucket) {
    return {
        count: bucket.count,
        pricedCount: bucket.pricedCount,
        advanceReceived: Math.round(bucket.advanceReceived * 100) / 100,
        totalSales: Math.round(bucket.totalSales * 100) / 100,
        pendingCod: Math.round(bucket.pendingCod * 100) / 100,
        statusBreakdown: bucket.statusSalesBreakdown,
        statusCountBreakdown: bucket.statusBreakdown
    };
}

export async function getOrderStats() {
    const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .select("id, created_at, advanceAmount, productPrice, status, receiptImage, codReceivedAmount");

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

    const receipts = { withReceipt: 0, withoutReceipt: 0 };

    (data || []).forEach((row) => {
        const createdAt = new Date(row.created_at);
        const entry = {
            advanceAmount: toFiniteNumber(row.advanceAmount) ?? 0,
            productPrice: toFiniteNumber(row.productPrice),
            status: normalizeOrderStatus(row.status),
            codReceivedAmount: toFiniteNumber(row.codReceivedAmount)
        };

        addToBucket(ranges.allTime, entry);

        if (createdAt >= startOfYear) {
            addToBucket(ranges.year, entry);
        }

        if (createdAt >= startOfMonth) {
            addToBucket(ranges.month, entry);
        }

        if (createdAt >= startOfWeek) {
            addToBucket(ranges.week, entry);
        }

        if (createdAt >= startOfDay) {
            addToBucket(ranges.today, entry);
        }

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
        receipts
    };
}

export async function deleteSubmission(id) {
    const { data: existing, error: fetchError } = await supabase
        .from(SUPABASE_TABLE)
        .select("*")
        .eq("id", id)
        .single();

    if (fetchError || !existing) {
        return null;
    }

    if (normalizeOrderStatus(existing.status) === "delivered") {
        const error = new Error("Delivered orders cannot be deleted.");
        error.statusCode = 400;
        throw error;
    }

    try {
        await removeSubmissionImageFiles(existing);
    } catch (storageError) {
        console.error(`[submissionService] Failed to remove storage files for ID ${id}:`, storageError);
    }

    const { error: deleteError } = await supabase
        .from(SUPABASE_TABLE)
        .delete()
        .eq("id", id);

    if (deleteError) {
        throw new Error(`Failed to delete order submission: ${deleteError.message}`);
    }

    return existing;
}

export async function updateSubmission(id, fields) {
    const { data: existing, error: fetchError } = await supabase
        .from(SUPABASE_TABLE)
        .select("*")
        .eq("id", id)
        .single();

    if (fetchError || !existing) {
        return null;
    }

    if (normalizeOrderStatus(existing.status) === "delivered") {
        const error = new Error("Delivered orders cannot be edited.");
        error.statusCode = 400;
        throw error;
    }

    const updatePayload = {};
    if (fields.name !== undefined) updatePayload.name = normalizeText(fields.name);
    if (fields.phone !== undefined) {
        const normalizedPhone = normalizePhone(fields.phone);

        if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
            const error = new Error("Enter a valid 10-digit phone number.");
            error.statusCode = 400;
            throw error;
        }

        updatePayload.phone = normalizedPhone;
    }
    if (fields.address !== undefined) updatePayload.address = normalizeText(fields.address);
    if (fields.city !== undefined) updatePayload.city = normalizeText(fields.city);
    if (fields.productSize !== undefined) updatePayload.productSize = normalizeText(fields.productSize);

    if (fields.status !== undefined) {
        const status = normalizeOrderStatus(fields.status);
        updatePayload.status = status;
    }

    if (fields.advanceAmount !== undefined) {
        const normalizedAdvanceAmount = toFiniteNumber(fields.advanceAmount);
        if (normalizedAdvanceAmount == null || normalizedAdvanceAmount < 0) {
            const error = new Error("advanceAmount must be a non-negative number.");
            error.statusCode = 400;
            throw error;
        }
        updatePayload.advanceAmount = normalizedAdvanceAmount;
    }

    if (fields.productPrice !== undefined && fields.productPrice !== null) {
        const normalizedProductPrice = toFiniteNumber(fields.productPrice);
        if (normalizedProductPrice == null || normalizedProductPrice <= 0) {
            const error = new Error("productPrice must be a positive number.");
            error.statusCode = 400;
            throw error;
        }
        updatePayload.productPrice = normalizedProductPrice;
    } else if (fields.productPrice === null) {
        updatePayload.productPrice = null;
    }

    const finalPrice = updatePayload.productPrice !== undefined ? updatePayload.productPrice : toFiniteNumber(existing.productPrice);
    const finalAdvance = updatePayload.advanceAmount !== undefined ? updatePayload.advanceAmount : toFiniteNumber(existing.advanceAmount);

    if (finalPrice !== null && finalAdvance !== null && finalPrice < finalAdvance) {
        const error = new Error("productPrice must be greater than or equal to advanceAmount.");
        error.statusCode = 400;
        throw error;
    }

    const finalStatus = updatePayload.status !== undefined ? updatePayload.status : normalizeOrderStatus(existing.status);
    const finalCodAmount = calculateCodAmount(finalPrice, finalAdvance);

    if (finalStatus === "delivered") {
        updatePayload.codReceivedAmount = finalCodAmount ?? 0;
    } else if (fields.status !== undefined) {
        updatePayload.codReceivedAmount = 0;
    }

    const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .update(updatePayload)
        .eq("id", id)
        .select("*")
        .single();

    if (error) {
        throw new Error(`Failed to update order: ${error.message}`);
    }

    return enrichSubmission(data);
}


