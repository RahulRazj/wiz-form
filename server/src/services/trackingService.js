import {
    NCM_API_BASE_URL,
    NCM_API_KEY,
    NCM_CREATE_ORDER_PATH,
    NCM_API_TIMEOUT_MS,
    NCM_BRANCH_LIST
} from "../config.js";

const LOG_PREFIX = "[trackingService]";

// Creates a shipment/order with the configured third-party courier API.
export async function createCourierShipment(submission) {
    const orderRef = submission?.orderId || submission?.id || "unknown-order";

    if (!NCM_API_BASE_URL) {
        console.error(`${LOG_PREFIX} NCM_API_URL is not configured; cannot create shipment for order ${orderRef}.`);
        throw new Error(
            "NCM API is not configured. Set NCM_API_URL in server/.env."
        );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), NCM_API_TIMEOUT_MS);
    const apiUrl = `${NCM_API_BASE_URL}/${NCM_CREATE_ORDER_PATH}`;
    const requestBody = {
        name: submission.name,
        phone: submission.phone,
        cod_charge: submission.cod_charge ?? 0,
        phone2: '',
        address: submission.address,
        fbranch: 'BIRGUNJ',
        branch: submission.city,
        package: submission.productDescription ?? ''
    };

    console.info(`${LOG_PREFIX} sending shipment creation request for order ${orderRef} to ${apiUrl} with payload:`, requestBody);

    console.info(`${LOG_PREFIX} creating shipment for order ${orderRef} -> POST ${apiUrl}`);

    let response;

    try {
        response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Token ${NCM_API_KEY}`,
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });
    } catch (error) {
        if (error.name === "AbortError") {
            console.error(`${LOG_PREFIX} request timed out after ${NCM_API_TIMEOUT_MS}ms for order ${orderRef}.`);
            throw new Error("Courier API request timed out.");
        }

        console.error(`${LOG_PREFIX} network error creating shipment for order ${orderRef}:`, error.message);
        throw new Error(`Courier API request failed: ${error.message}`);
    } finally {
        clearTimeout(timeoutId);
    }

    const responseBody = await response.json().catch((parseError) => {
        console.error(`${LOG_PREFIX} failed to parse response body for order ${orderRef}:`, parseError.message);
        return {};
    });

    if (!response.ok) {
        const errorMessage =
            responseBody.error ||
            responseBody.message ||
            `Courier API request failed with status ${response.status}.`;

        console.error(`${LOG_PREFIX} request failed: raw - ${JSON.stringify(responseBody)}`);
        console.error(`${LOG_PREFIX} request failed for order ${orderRef} (status ${response.status}): ${errorMessage}`);
        throw new Error(errorMessage);
    }

    console.info(`${LOG_PREFIX} shipment created successfully for order ${orderRef}.`);

    return {
        raw: responseBody
    };
}

// Fetches the branch/city list from the courier API for use as delivery destinations.
export async function getCourierBranches() {
    if (!NCM_API_BASE_URL || !NCM_API_KEY || !NCM_BRANCH_LIST) {
        console.error(`${LOG_PREFIX} NCM API is not configured; cannot fetch branch list.`);
        throw new Error(
            "NCM API is not configured. Set NCM_API_URL, NCM_API_KEY and NCM_BRANCH_LIST in server/.env."
        );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), NCM_API_TIMEOUT_MS);
    const apiUrl = `${NCM_API_BASE_URL}/${NCM_BRANCH_LIST}`;

    let response;

    try {
        response = await fetch(apiUrl, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Token ${NCM_API_KEY}`,
            },
            signal: controller.signal
        });
    } catch (error) {
        if (error.name === "AbortError") {
            console.error(`${LOG_PREFIX} branch list request timed out after ${NCM_API_TIMEOUT_MS}ms.`);
            throw new Error("Courier API request timed out.");
        }

        console.error(`${LOG_PREFIX} network error fetching branch list:`, error.message);
        throw new Error(`Courier API request failed: ${error.message}`);
    } finally {
        clearTimeout(timeoutId);
    }

    const responseBody = await response.json().catch((parseError) => {
        console.error(`${LOG_PREFIX} failed to parse branch list response:`, parseError.message);
        return null;
    });

    if (!response.ok) {
        const errorMessage =
            responseBody?.error ||
            responseBody?.message ||
            `Courier API request failed with status ${response.status}.`;

        console.error(`${LOG_PREFIX} branch list request failed (status ${response.status}): ${errorMessage}`);
        throw new Error(errorMessage);
    }

    const branches = Array.isArray(responseBody) ? responseBody : responseBody?.data || [];

    return branches.map((branch) => ({
        name: branch.name,
        code: branch.code,
        district: branch.district_name || null,
        province: branch.province_name || null
    })).filter((branch) => branch.name);
}
