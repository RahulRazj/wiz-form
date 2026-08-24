import { useEffect, useRef, useState } from "react";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_PRODUCT_IMAGES = 5;
const PRODUCT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const RECEIPT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString();
}

function formatCurrency(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "—";
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(amount);
}

function getSubmissionProductImages(submission) {
  if (Array.isArray(submission?.productImageUrls) && submission.productImageUrls.length > 0) {
    return submission.productImageUrls.filter(Boolean);
  }

  return submission?.productImage ? [submission.productImage] : [];
}

function getSubmissionReceiptImage(submission) {
  return submission?.receiptImageUrl || submission?.receiptImage || "";
}

function isReceiptImageUrl(url) {
  return Boolean(url) && !/\.pdf($|\?)/i.test(url);
}

const ADMIN_TOKEN_STORAGE_KEY = "adminToken";

function createPreviewEntry(file) {
  return {
    id: crypto.randomUUID(),
    file,
    previewUrl: URL.createObjectURL(file)
  };
}

function revokePreviewEntry(entry) {
  if (entry?.previewUrl) {
    URL.revokeObjectURL(entry.previewUrl);
  }
}

function revokePreviewEntries(entries) {
  entries.forEach(revokePreviewEntry);
}

const initialFormData = {
  name: "",
  phone: "",
  address: "",
  city: "",
  advanceAmount: "",
  terms: false
};

export default function App() {
  const [pathname, setPathname] = useState(window.location.pathname);
  const [formData, setFormData] = useState(initialFormData);
  const [errors, setErrors] = useState({});
  const [termsError, setTermsError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [productImages, setProductImages] = useState([]);
  const [receiptImage, setReceiptImage] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [orderId, setOrderId] = useState("");

  const [submissions, setSubmissions] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [adminPage, setAdminPage] = useState(1);
  const [adminLimit, setAdminLimit] = useState(20);
  const [adminFromDate, setAdminFromDate] = useState("");
  const [adminToDate, setAdminToDate] = useState("");
  const [adminSearch, setAdminSearch] = useState("");
  const [adminReceiptFilter, setAdminReceiptFilter] = useState("all");
  const [adminPagination, setAdminPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasMore: false
  });
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState("");
  const [viewSubmission, setViewSubmission] = useState(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusUpdateError, setStatusUpdateError] = useState("");
  const [dashboardStats, setDashboardStats] = useState(null);
  const [dashboardStatsLoading, setDashboardStatsLoading] = useState(false);
  const [dashboardStatsError, setDashboardStatsError] = useState("");
  const [adminToken, setAdminToken] = useState(() => {
    try {
      return sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });
  const [adminTokenStatus, setAdminTokenStatus] = useState(() => {
    try {
      return sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ? "checking" : "idle";
    } catch {
      return "idle";
    }
  });
  const [adminTokenInput, setAdminTokenInput] = useState("");
  const [adminAuthError, setAdminAuthError] = useState("");
  const [isVerifyingAdminToken, setIsVerifyingAdminToken] = useState(false);

  const productImageInputRef = useRef(null);
  const receiptImageInputRef = useRef(null);
  const productImagesRef = useRef(productImages);
  const receiptImageRef = useRef(receiptImage);

  const isLegacyDashboardRoute = pathname === "/dashboard";
  const isAdminRoute = pathname.startsWith("/admin") || isLegacyDashboardRoute;
  const isAdminHomeRoute = pathname === "/admin";
  const isAdminDashboardRoute = pathname === "/admin/dashboard" || isLegacyDashboardRoute;
  const isAdminManageRoute = pathname === "/admin/manage";
  const isAdminUnlocked = adminTokenStatus === "valid";

  useEffect(() => {
    productImagesRef.current = productImages;
  }, [productImages]);

  useEffect(() => {
    receiptImageRef.current = receiptImage;
  }, [receiptImage]);

  useEffect(() => {
    return () => {
      revokePreviewEntries(productImagesRef.current);
      revokePreviewEntry(receiptImageRef.current);
    };
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname);
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    if (!isLegacyDashboardRoute) {
      return;
    }

    window.history.replaceState({}, "", "/admin/dashboard");
    setPathname("/admin/dashboard");
  }, [isLegacyDashboardRoute]);

  function navigate(to) {
    if (window.location.pathname !== to) {
      window.history.pushState({}, "", to);
      setPathname(to);
    }
  }

  function goToAdminRoute(to) {
    setAdminPage(1);
    setSelectedSubmission(null);
    setSelectedImageUrl("");
    navigate(to);
  }

  useEffect(() => {
    if (!isAdminRoute || !adminToken || adminTokenStatus !== "checking") {
      return undefined;
    }

    const controller = new AbortController();

    async function verifyStoredToken() {
      try {
        const response = await fetch("/api/admin/verify", {
          headers: { "X-Admin-Token": adminToken },
          signal: controller.signal
        });

        if (response.ok) {
          setAdminTokenStatus("valid");
        } else {
          try {
            sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
          } catch {
            // ignore storage failures
          }

          setAdminToken("");
          setAdminTokenStatus("idle");
        }
      } catch (error) {
        if (error.name === "AbortError") {
          return;
        }

        setAdminTokenStatus("idle");
      }
    }

    verifyStoredToken();

    return () => {
      controller.abort();
    };
  }, [isAdminRoute, adminToken, adminTokenStatus]);

  async function handleAdminUnlock(event) {
    event.preventDefault();
    const candidate = adminTokenInput.trim();

    if (!candidate) {
      setAdminAuthError("Please enter the admin passcode.");
      return;
    }

    try {
      setIsVerifyingAdminToken(true);
      setAdminAuthError("");

      const response = await fetch("/api/admin/verify", {
        headers: { "X-Admin-Token": candidate }
      });

      if (!response.ok) {
        throw new Error("Incorrect passcode. Please try again.");
      }

      try {
        sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, candidate);
      } catch {
        // ignore storage failures (e.g. private browsing)
      }

      setAdminToken(candidate);
      setAdminTokenStatus("valid");
      setAdminTokenInput("");
    } catch (error) {
      setAdminAuthError(
        error instanceof Error && error.message ? error.message : "Incorrect passcode."
      );
    } finally {
      setIsVerifyingAdminToken(false);
    }
  }

  function handleAdminLock() {
    try {
      sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    } catch {
      // ignore storage failures
    }

    setAdminToken("");
    setAdminTokenStatus("idle");
    setAdminTokenInput("");
  }

  useEffect(() => {
    if (!isAdminRoute || isAdminDashboardRoute || !isAdminUnlocked) {
      return undefined;
    }

    const controller = new AbortController();

    async function loadSubmissions() {
      try {
        setAdminLoading(true);
        setAdminError("");

        const query = new URLSearchParams({
          page: String(adminPage),
          limit: String(adminLimit)
        });

        if (adminFromDate) {
          query.set("fromDate", adminFromDate);
        }

        if (adminToDate) {
          query.set("toDate", adminToDate);
        }

        if (adminSearch.trim()) {
          query.set("search", adminSearch.trim());
        }

        if (adminReceiptFilter === "with-receipt") {
          query.set("hasReceipt", "true");
        }

        if (adminReceiptFilter === "without-receipt") {
          query.set("hasReceipt", "false");
        }

        const response = await fetch(`/api/submissions?${query.toString()}`, {
          headers: { "X-Admin-Token": adminToken },
          signal: controller.signal
        });

        const responseBody = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(responseBody.error || responseBody.message || "Failed to load submissions.");
        }

        setSubmissions(Array.isArray(responseBody.data) ? responseBody.data : []);
        setAdminPagination(
          responseBody.pagination || {
            page: adminPage,
            limit: adminLimit,
            total: 0,
            totalPages: 0,
            hasMore: false
          }
        );
      } catch (error) {
        if (error.name === "AbortError") {
          return;
        }

        setAdminError(
          error instanceof Error && error.message
            ? error.message
            : "Failed to load submissions."
        );
      } finally {
        setAdminLoading(false);
      }
    }

    loadSubmissions();

    return () => {
      controller.abort();
    };
  }, [adminPage, adminLimit, adminFromDate, adminToDate, adminSearch, adminReceiptFilter, isAdminRoute, isAdminDashboardRoute, isAdminUnlocked, adminToken]);

  useEffect(() => {
    if (!isAdminDashboardRoute || !isAdminUnlocked) {
      return undefined;
    }

    const controller = new AbortController();

    async function loadStats() {
      try {
        setDashboardStatsLoading(true);
        setDashboardStatsError("");

        const response = await fetch("/api/submissions/stats", {
          headers: { "X-Admin-Token": adminToken },
          signal: controller.signal
        });

        const responseBody = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(responseBody.error || responseBody.message || "Failed to load statistics.");
        }

        setDashboardStats(responseBody.data || null);
      } catch (error) {
        if (error.name === "AbortError") {
          return;
        }

        setDashboardStatsError(
          error instanceof Error && error.message
            ? error.message
            : "Failed to load statistics."
        );
      } finally {
        setDashboardStatsLoading(false);
      }
    }

    loadStats();

    return () => {
      controller.abort();
    };
  }, [isAdminDashboardRoute, isAdminUnlocked, adminToken]);

  function openSubmissionView(submission) {
    setStatusUpdateError("");
    setViewSubmission(submission);
  }

  function closeSubmissionView() {
    setViewSubmission(null);
    setStatusUpdateError("");
  }

  function applySubmissionUpdate(updatedSubmission) {
    setSubmissions((current) =>
      current.map((submission) =>
        submission.id === updatedSubmission.id ? { ...submission, ...updatedSubmission } : submission
      )
    );
    setViewSubmission((current) =>
      current && current.id === updatedSubmission.id ? { ...current, ...updatedSubmission } : current
    );
  }

  async function handleCreateOrder(submission) {
    try {
      setIsUpdatingStatus(true);
      setStatusUpdateError("");

      const response = await fetch(`/api/submissions/${submission.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Admin-Token": adminToken },
        body: JSON.stringify({ status: "created" })
      });

      const responseBody = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(responseBody.error || responseBody.message || "Failed to create the order.");
      }

      applySubmissionUpdate(responseBody.data || { ...submission, status: "created" });
    } catch (error) {
      setStatusUpdateError(
        error instanceof Error && error.message ? error.message : "Failed to create the order."
      );
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  function updateField(name, value) {
    setFormData((current) => ({
      ...current,
      [name]: value
    }));

    setErrors((current) => {
      if (!current[name]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[name];
      return nextErrors;
    });
  }

  function validateRequiredFields() {
    const nextErrors = {};

    if (!formData.name.trim()) nextErrors.name = "This field is required.";
    if (!formData.phone.trim()) nextErrors.phone = "This field is required.";
    if (!formData.address.trim()) nextErrors.address = "This field is required.";
    if (!formData.city.trim()) nextErrors.city = "This field is required.";
    if (!formData.advanceAmount.trim()) nextErrors.advanceAmount = "This field is required.";

    if (formData.phone.trim()) {
      const phone = formData.phone.replace(/\D/g, "");
      if (!/^[6-9]\d{9}$/.test(phone)) {
        nextErrors.phone = "Enter a valid 10-digit phone number.";
      }
    }

    if (formData.advanceAmount.trim() && Number(formData.advanceAmount) <= 0) {
      nextErrors.advanceAmount = "Enter a valid advance amount.";
    }

    if (productImagesRef.current.length === 0) {
      nextErrors.productImage = "Please upload at least one product image.";
    } else if (productImagesRef.current.length > MAX_PRODUCT_IMAGES) {
      nextErrors.productImage = `Please upload up to ${MAX_PRODUCT_IMAGES} product images.`;
    }

    if (receiptImageRef.current && !RECEIPT_IMAGE_TYPES.includes(receiptImageRef.current.file.type)) {
      nextErrors.receiptImage = "Please upload an image or PDF receipt.";
    }

    return nextErrors;
  }

  function handleProductFiles(files) {
    const currentImages = productImagesRef.current;
    const availableSlots = MAX_PRODUCT_IMAGES - currentImages.length;

    if (availableSlots <= 0) {
      setErrors((current) => ({
        ...current,
        productImage: `Please upload up to ${MAX_PRODUCT_IMAGES} product images.`
      }));

      if (productImageInputRef.current) {
        productImageInputRef.current.value = "";
      }

      return;
    }

    const selectedFiles = Array.from(files || []);
    const acceptedFiles = selectedFiles.slice(0, availableSlots);

    if (selectedFiles.length > availableSlots) {
      setErrors((current) => ({
        ...current,
        productImage: `Please upload up to ${MAX_PRODUCT_IMAGES} product images.`
      }));
    }

    const nextEntries = acceptedFiles
      .filter((file) => file.size <= MAX_FILE_SIZE && PRODUCT_IMAGE_TYPES.includes(file.type))
      .map(createPreviewEntry);

    if (nextEntries.length !== acceptedFiles.length) {
      setErrors((current) => ({
        ...current,
        productImage: "Please upload JPG, PNG or WEBP product images under 5 MB each."
      }));
    } else {
      setErrors((current) => {
        if (!current.productImage) {
          return current;
        }

        const nextErrors = { ...current };
        delete nextErrors.productImage;
        return nextErrors;
      });
    }

    setProductImages((current) => [...current, ...nextEntries]);

    if (productImageInputRef.current) {
      productImageInputRef.current.value = "";
    }
  }

  function removeProductImage(id) {
    setProductImages((current) => {
      const entry = current.find((item) => item.id === id);
      revokePreviewEntry(entry);
      return current.filter((item) => item.id !== id);
    });
  }

  function handleReceiptFile(file) {
    if (!file) {
      if (receiptImageRef.current) {
        revokePreviewEntry(receiptImageRef.current);
      }

      setReceiptImage(null);

      if (receiptImageInputRef.current) {
        receiptImageInputRef.current.value = "";
      }

      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setErrors((current) => ({
        ...current,
        receiptImage: "File size must be less than 5 MB."
      }));

      if (receiptImageInputRef.current) {
        receiptImageInputRef.current.value = "";
      }

      return;
    }

    if (!RECEIPT_IMAGE_TYPES.includes(file.type)) {
      setErrors((current) => ({
        ...current,
        receiptImage: "Please upload an image or PDF receipt."
      }));

      if (receiptImageInputRef.current) {
        receiptImageInputRef.current.value = "";
      }

      return;
    }

    if (receiptImageRef.current) {
      revokePreviewEntry(receiptImageRef.current);
    }

    setReceiptImage(createPreviewEntry(file));
    setErrors((current) => {
      if (!current.receiptImage) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors.receiptImage;
      return nextErrors;
    });

    if (receiptImageInputRef.current) {
      receiptImageInputRef.current.value = "";
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const nextErrors = validateRequiredFields();
    const isTermsAccepted = formData.terms;

    setErrors(nextErrors);
    setTermsError(isTermsAccepted ? "" : "Please confirm the information before submitting.");

    if (Object.keys(nextErrors).length > 0 || !isTermsAccepted) {
      return;
    }

    const payload = new FormData();
    payload.append("name", formData.name.trim());
    payload.append("phone", formData.phone.trim());
    payload.append("address", formData.address.trim());
    payload.append("city", formData.city.trim());
    payload.append("advanceAmount", formData.advanceAmount.trim());
    payload.append("terms", "true");

    productImagesRef.current.forEach((entry) => {
      payload.append("productImage", entry.file);
    });

    if (receiptImageRef.current) {
      payload.append("receiptImage", receiptImageRef.current.file);
    }

    try {
      setIsSubmitting(true);
      const response = await fetch("/api/submissions", {
        method: "POST",
        body: payload
      });

      const responseBody = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(responseBody.error || responseBody.message || "Failed to submit the order.");
      }

      setOrderId(responseBody.orderId || String(responseBody.id || "Saved"));
      setIsSubmitted(true);
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error && error.message
          ? error.message
          : "Something went wrong while submitting your order. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetForm() {
    revokePreviewEntries(productImagesRef.current);
    revokePreviewEntry(receiptImageRef.current);

    setFormData(initialFormData);
    setErrors({});
    setTermsError("");
    setProductImages([]);
    setReceiptImage(null);
    setIsSubmitted(false);
    setOrderId("");

    if (productImageInputRef.current) {
      productImageInputRef.current.value = "";
    }

    if (receiptImageInputRef.current) {
      receiptImageInputRef.current.value = "";
    }
  }

  const adminLockScreen = (
    <>
      <header className="form-header admin-header">
        <div className="brand-icon">🔒</div>

        <div>
          <h1>Admin Console</h1>
          <p>Enter the admin passcode to continue.</p>
        </div>
      </header>

      <section className="dashboard-card admin-lock-card">
        {adminTokenStatus === "checking" ? (
          <p className="dashboard-state">Checking access...</p>
        ) : (
          <form className="admin-lock-form" onSubmit={handleAdminUnlock}>
            <label htmlFor="adminPasscode">Passcode</label>
            <input
              id="adminPasscode"
              type="password"
              autoFocus
              value={adminTokenInput}
              onChange={(event) => setAdminTokenInput(event.target.value)}
              placeholder="Enter admin passcode"
            />

            {adminAuthError ? <small className="error">{adminAuthError}</small> : null}

            <button type="submit" className="primary-button" disabled={isVerifyingAdminToken}>
              {isVerifyingAdminToken ? "Checking..." : "Unlock"}
            </button>
          </form>
        )}
      </section>
    </>
  );

  const adminShell = (
    <>
      <header className="form-header admin-header">
        <div className="brand-icon">📊</div>

        <div>
          <h1>Admin Console</h1>
          <p>Review submissions, inspect images, and manage orders.</p>
        </div>
      </header>

      <div className="dashboard-top-actions admin-nav">
        <button type="button" className={`secondary-button ${isAdminHomeRoute ? "active" : ""}`} onClick={() => goToAdminRoute("/admin")}>Overview</button>
        <button type="button" className={`secondary-button ${isAdminDashboardRoute ? "active" : ""}`} onClick={() => goToAdminRoute("/admin/dashboard")}>Dashboard</button>
        <button type="button" className={`secondary-button ${isAdminManageRoute ? "active" : ""}`} onClick={() => goToAdminRoute("/admin/manage")}>Manage</button>
        <button type="button" className="secondary-button" onClick={handleAdminLock}>Lock</button>
      </div>

      {isAdminDashboardRoute ? (
        <section className="dashboard-card">
          <div className="dashboard-header">
            <div>
              <h2>Dashboard</h2>
              <p>Order volume and revenue at a glance, from GET /api/submissions/stats.</p>
            </div>
          </div>

          {dashboardStatsLoading ? (
            <p className="dashboard-state">Loading statistics...</p>
          ) : dashboardStatsError ? (
            <p className="dashboard-state dashboard-state-error">{dashboardStatsError}</p>
          ) : dashboardStats ? (
            <>
              <div className="stats-grid">
                <div className="stats-card">
                  <span className="stats-card-label">Today</span>
                  <strong className="stats-card-value">{dashboardStats.ranges.today.count}</strong>
                  <span className="stats-card-sub">{formatCurrency(dashboardStats.ranges.today.totalAmount)}</span>
                </div>

                <div className="stats-card">
                  <span className="stats-card-label">This Week</span>
                  <strong className="stats-card-value">{dashboardStats.ranges.week.count}</strong>
                  <span className="stats-card-sub">{formatCurrency(dashboardStats.ranges.week.totalAmount)}</span>
                </div>

                <div className="stats-card">
                  <span className="stats-card-label">This Month</span>
                  <strong className="stats-card-value">{dashboardStats.ranges.month.count}</strong>
                  <span className="stats-card-sub">{formatCurrency(dashboardStats.ranges.month.totalAmount)}</span>
                </div>

                <div className="stats-card">
                  <span className="stats-card-label">This Year</span>
                  <strong className="stats-card-value">{dashboardStats.ranges.year.count}</strong>
                  <span className="stats-card-sub">{formatCurrency(dashboardStats.ranges.year.totalAmount)}</span>
                </div>

                <div className="stats-card stats-card-highlight">
                  <span className="stats-card-label">All Time</span>
                  <strong className="stats-card-value">{dashboardStats.ranges.allTime.count}</strong>
                  <span className="stats-card-sub">{formatCurrency(dashboardStats.ranges.allTime.totalAmount)}</span>
                </div>
              </div>

              <div className="stats-secondary-grid">
                <div className="stats-breakdown-card">
                  <span className="submission-inspector-section-title">Order Status</span>

                  <div className="stats-breakdown-row">
                    <span className="status-pill status-pill-placed">PLACED</span>
                    <strong>{dashboardStats.statusBreakdown.placed}</strong>
                  </div>
                  <div className="stats-breakdown-row">
                    <span className="status-pill status-pill-created">CREATED</span>
                    <strong>{dashboardStats.statusBreakdown.created}</strong>
                  </div>
                  <div className="stats-breakdown-row">
                    <span className="status-pill status-pill-delivered">DELIVERED</span>
                    <strong>{dashboardStats.statusBreakdown.delivered}</strong>
                  </div>
                </div>

                <div className="stats-breakdown-card">
                  <span className="submission-inspector-section-title">Receipts</span>

                  <div className="stats-breakdown-row">
                    <span className="receipt-pill receipt-pill-ok">Attached</span>
                    <strong>{dashboardStats.receipts.withReceipt}</strong>
                  </div>
                  <div className="stats-breakdown-row">
                    <span className="receipt-pill receipt-pill-missing">Missing</span>
                    <strong>{dashboardStats.receipts.withoutReceipt}</strong>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="dashboard-state">No statistics available.</p>
          )}
        </section>
      ) : (
        <section className="dashboard-card">
          <div className="dashboard-header">
            <div>
              <h2>{isAdminManageRoute ? "Manage Queue" : "Order Submissions"}</h2>
            <p>Live data from GET /api/submissions with server-side search and filters.</p>
          </div>

          <div className="dashboard-summary">
            <div>
              <strong>{adminPagination.total}</strong>
              <span>Total</span>
            </div>

            <div>
              <strong>{adminPagination.page}</strong>
              <span>Page</span>
            </div>

            <div>
              <strong>{submissions.length}</strong>
              <span>Shown</span>
            </div>
          </div>
        </div>

        <div className="dashboard-filters">
          <div className="dashboard-filters-row dashboard-filters-row-search">
            <label className="dashboard-search-field">
              <span>Search</span>
              <input
                type="search"
                placeholder="Search name, phone, city, or address..."
                value={adminSearch}
                onChange={(event) => {
                  setAdminPage(1);
                  setAdminSearch(event.target.value);
                }}
              />
            </label>
          </div>

          <div className="dashboard-filters-row">
            <label>
              <span>From</span>
              <input
                type="datetime-local"
                value={adminFromDate}
                onChange={(event) => {
                  setAdminPage(1);
                  setAdminFromDate(event.target.value);
                }}
              />
            </label>

            <label>
              <span>To</span>
              <input
                type="datetime-local"
                value={adminToDate}
                onChange={(event) => {
                  setAdminPage(1);
                  setAdminToDate(event.target.value);
                }}
              />
            </label>

            <label>
              <span>Receipt</span>
              <select
                value={adminReceiptFilter}
                onChange={(event) => {
                  setAdminPage(1);
                  setAdminReceiptFilter(event.target.value);
                }}
              >
                <option value="all">All</option>
                <option value="with-receipt">With receipt</option>
                <option value="without-receipt">Without receipt</option>
              </select>
            </label>

            <label>
              <span>Limit</span>
              <select
                value={adminLimit}
                onChange={(event) => {
                  setAdminPage(1);
                  setAdminLimit(Number(event.target.value));
                }}
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </label>
          </div>
        </div>

        {adminLoading ? (
          <p className="dashboard-state">Loading submissions...</p>
        ) : adminError ? (
          <p className="dashboard-state dashboard-state-error">{adminError}</p>
        ) : submissions.length === 0 ? (
          <p className="dashboard-state">No submissions found.</p>
        ) : isAdminManageRoute ? (
          <div className="manage-grid">
            {submissions.map((submission) => {
              const productImagesForSubmission = getSubmissionProductImages(submission);
              const receiptUrl = getSubmissionReceiptImage(submission);

              return (
                <article className="manage-item" key={`manage-${submission.orderId || submission.id}`}>
                  <div className="manage-item-header">
                    <div>
                      <strong>{submission.orderId || "—"}</strong>
                      <p>{submission.name || "—"}</p>
                    </div>

                    <div className="manage-item-badges">
                      <span className={`status-pill status-pill-${submission.status || "placed"}`}>
                        {(submission.status || "placed").toUpperCase()}
                      </span>

                      <span className={`receipt-pill ${receiptUrl ? "receipt-pill-ok" : "receipt-pill-missing"}`}>
                        {receiptUrl ? "Receipt" : "No receipt"}
                      </span>
                    </div>
                  </div>

                  <div className="manage-item-gallery">
                    {productImagesForSubmission.length > 0 ? (
                      productImagesForSubmission.slice(0, 3).map((imageUrl, index) => (
                        <button
                          type="button"
                          key={`${submission.orderId || submission.id}-${index}-${imageUrl}`}
                          className="manage-thumb-button"
                          onClick={() => setSelectedImageUrl(imageUrl)}
                        >
                          <img src={imageUrl} alt={`Preview ${index + 1}`} loading="lazy" />
                        </button>
                      ))
                    ) : (
                      <div className="submission-preview-empty">No product images.</div>
                    )}
                  </div>

                  <div className="manage-item-meta">
                    <span>{submission.city || "—"}</span>
                    <span>{formatCurrency(submission.advanceAmount)}</span>
                    <span>{formatDateTime(submission.created_at)}</span>
                  </div>

                  <button
                    type="button"
                    className="secondary-button compact-button"
                    onClick={() => openSubmissionView(submission)}
                  >
                    View
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="dashboard-table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Location</th>
                  <th>Advance</th>
                  <th>Images</th>
                  <th>Receipt</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>

              <tbody>
                {submissions.map((submission) => {
                  const productImagesForSubmission = getSubmissionProductImages(submission);
                  const receiptUrl = getSubmissionReceiptImage(submission);
                  const isSelectedRow = selectedSubmission?.id === submission.id;

                  return (
                    <tr
                      key={submission.orderId || submission.id}
                      className={`dashboard-row-clickable ${isSelectedRow ? "selected" : ""}`}
                      onClick={() => setSelectedSubmission(submission)}
                    >
                      <td>
                        <div className="dashboard-stacked-detail">
                          <strong>{submission.name || "—"}</strong>
                          <span>{submission.phone || "—"}</span>
                        </div>
                      </td>
                      <td>
                        <div className="dashboard-stacked-detail">
                          <strong>{submission.city || "—"}</strong>
                          <span>{submission.address || "—"}</span>
                        </div>
                      </td>
                      <td>{formatCurrency(submission.advanceAmount)}</td>
                      <td>
                        {productImagesForSubmission.length > 0 ? (
                          <span className="image-stack">
                            <img
                              src={productImagesForSubmission[0]}
                              alt={`Product image for ${submission.orderId || submission.id || "submission"}`}
                              className="dashboard-preview-thumb dashboard-preview-thumb-primary"
                              loading="lazy"
                            />
                            <span className="image-count-badge">{productImagesForSubmission.length}</span>
                          </span>
                        ) : (
                          <span className="dashboard-empty-cell">No images</span>
                        )}
                      </td>
                      <td>
                        {receiptUrl ? (
                          <a href={receiptUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Open receipt</a>
                        ) : (
                          <span className="dashboard-empty-cell">No receipt</span>
                        )}
                      </td>
                      <td>
                        <span className={`status-pill status-pill-${submission.status || "placed"}`}>
                          {(submission.status || "placed").toUpperCase()}
                        </span>
                      </td>
                      <td>{formatDateTime(submission.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {selectedSubmission ? (
          <div
            className="submission-inspector-backdrop"
            role="presentation"
            onClick={() => setSelectedSubmission(null)}
          >
            <aside
              className="submission-inspector"
              role="dialog"
              aria-modal="true"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="submission-inspector-header">
                <div>
                  <h3>{selectedSubmission.orderId || "Selected order"}</h3>
                  <p>{selectedSubmission.name || "—"} · {selectedSubmission.city || "—"}</p>
                </div>

                <button type="button" className="secondary-button compact-button" onClick={() => setSelectedSubmission(null)}>
                  Close
                </button>
              </div>

              <div className="submission-meta-grid">
                <div>
                  <span>Phone</span>
                  <strong>{selectedSubmission.phone || "—"}</strong>
                </div>
                <div>
                  <span>Advance</span>
                  <strong>{formatCurrency(selectedSubmission.advanceAmount)}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{(selectedSubmission.status || "placed").toUpperCase()}</strong>
                </div>
              </div>

              <p className="submission-address">{selectedSubmission.address || "No address provided."}</p>

              <div className="submission-inspector-section">
                <span className="submission-inspector-section-title">
                  Product Images ({getSubmissionProductImages(selectedSubmission).length})
                </span>

                <div className="submission-image-grid">
                  {getSubmissionProductImages(selectedSubmission).length > 0 ? (
                    getSubmissionProductImages(selectedSubmission).map((imageUrl, index) => (
                      <button
                        type="button"
                        key={`${selectedSubmission.orderId || selectedSubmission.id}-${imageUrl}`}
                        className="submission-image-button"
                        onClick={() => setSelectedImageUrl(imageUrl)}
                      >
                        <img src={imageUrl} alt={`Submission image ${index + 1}`} loading="lazy" />
                      </button>
                    ))
                  ) : (
                    <div className="submission-preview-empty">No product images.</div>
                  )}
                </div>
              </div>

              <div className="submission-inspector-section">
                <span className="submission-inspector-section-title">Receipt</span>
                {getSubmissionReceiptImage(selectedSubmission) ? (
                  isReceiptImageUrl(getSubmissionReceiptImage(selectedSubmission)) ? (
                    <button
                      type="button"
                      className="submission-image-button submission-receipt-preview"
                      onClick={() => setSelectedImageUrl(getSubmissionReceiptImage(selectedSubmission))}
                    >
                      <img src={getSubmissionReceiptImage(selectedSubmission)} alt="Receipt preview" loading="lazy" />
                    </button>
                  ) : (
                    <a
                      className="submission-receipt-file"
                      href={getSubmissionReceiptImage(selectedSubmission)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span style={{ fontSize: 28 }}>📄</span>
                      Open receipt (PDF)
                    </a>
                  )
                ) : (
                  <span className="dashboard-empty-cell">No receipt attached.</span>
                )}
              </div>
            </aside>
          </div>
        ) : null}


        <div className="dashboard-pagination">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setAdminPage((current) => Math.max(1, current - 1))}
            disabled={adminLoading || adminPage <= 1}
          >
            Previous
          </button>

          <span>
            Page {adminPagination.page} of {adminPagination.totalPages || 1}
          </span>

          <button
            type="button"
            className="secondary-button"
            onClick={() => setAdminPage((current) => current + 1)}
            disabled={adminLoading || !adminPagination.hasMore}
          >
            Next
          </button>
        </div>
      </section>
      )}

      {selectedImageUrl ? (
        <div className="image-modal-backdrop" role="presentation" onClick={() => setSelectedImageUrl("") }>
          <div className="image-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="image-modal-header">
              <strong>Image Preview</strong>
              <button type="button" className="secondary-button compact-button" onClick={() => setSelectedImageUrl("")}>Close</button>
            </div>
            <img src={selectedImageUrl} alt="Selected product" className="image-modal-preview" />
          </div>
        </div>
      ) : null}

      {viewSubmission ? (
        <div className="image-modal-backdrop" role="presentation" onClick={closeSubmissionView}>
          <div
            className="submission-detail-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="submission-detail-modal-header">
              <div>
                <h3>{viewSubmission.orderId || "Selected order"}</h3>
                <span className={`status-pill status-pill-${viewSubmission.status || "placed"}`}>
                  {(viewSubmission.status || "placed").toUpperCase()}
                </span>
              </div>

              <button type="button" className="secondary-button compact-button" onClick={closeSubmissionView}>
                Close
              </button>
            </div>

            <div className="submission-detail-modal-body">
              <div className="submission-meta-grid">
                <div>
                  <span>Customer</span>
                  <strong>{viewSubmission.name || "—"}</strong>
                </div>
                <div>
                  <span>Phone</span>
                  <strong>{viewSubmission.phone || "—"}</strong>
                </div>
                <div>
                  <span>City</span>
                  <strong>{viewSubmission.city || "—"}</strong>
                </div>
                <div>
                  <span>Advance</span>
                  <strong>{formatCurrency(viewSubmission.advanceAmount)}</strong>
                </div>
              </div>

              <p className="submission-address">{viewSubmission.address || "No address provided."}</p>

              <div className="submission-image-grid">
                {getSubmissionProductImages(viewSubmission).map((imageUrl, index) => (
                  <a
                    key={`view-${viewSubmission.orderId || viewSubmission.id}-${imageUrl}`}
                    href={imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="submission-image-button"
                  >
                    <img src={imageUrl} alt={`Submission image ${index + 1}`} loading="lazy" />
                  </a>
                ))}
              </div>

              <div className="submission-receipt-section">
                <span className="submission-inspector-section-title">Receipt</span>

                {getSubmissionReceiptImage(viewSubmission) ? (
                  isReceiptImageUrl(getSubmissionReceiptImage(viewSubmission)) ? (
                    <button
                      type="button"
                      className="submission-image-button submission-receipt-preview"
                      onClick={() => setSelectedImageUrl(getSubmissionReceiptImage(viewSubmission))}
                    >
                      <img src={getSubmissionReceiptImage(viewSubmission)} alt="Receipt preview" loading="lazy" />
                    </button>
                  ) : (
                    <a
                      className="submission-receipt-file"
                      href={getSubmissionReceiptImage(viewSubmission)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span style={{ fontSize: 28 }}>📄</span>
                      Open receipt (PDF)
                    </a>
                  )
                ) : (
                  <span className="dashboard-empty-cell">No receipt attached.</span>
                )}
              </div>

              {statusUpdateError ? (
                <p className="dashboard-state dashboard-state-error">{statusUpdateError}</p>
              ) : null}
            </div>

            <div className="submission-detail-modal-actions">
              {viewSubmission.status === "placed" ? (
                <button
                  type="button"
                  className="primary-button"
                  disabled={isUpdatingStatus}
                  onClick={() => handleCreateOrder(viewSubmission)}
                >
                  {isUpdatingStatus ? "Creating order..." : "Create Order"}
                </button>
              ) : (
                <span className="dashboard-empty-cell">
                  Order already {viewSubmission.status === "delivered" ? "delivered" : "created"}.
                </span>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );

  const formView = (
    <>
      <header className="form-header">
        <div className="brand-icon">🛍️</div>

        <div>
          <h1>Place Your Order</h1>
          <p>Enter your details and upload your payment receipt.</p>
        </div>
      </header>

      <form id="orderForm" onSubmit={handleSubmit} hidden={isSubmitted} noValidate>
        <section className="form-section">
          <div className="section-header">
            <div className="section-number">1</div>
            <div>
              <h2>Customer Details</h2>
              <p>Tell us where we should deliver your order.</p>
            </div>
          </div>

          <div className={`field ${errors.name ? "invalid" : ""}`}>
            <label htmlFor="name">Full Name <span>*</span></label>
            <input
              type="text"
              id="name"
              name="name"
              placeholder="Enter your full name"
              autoComplete="name"
              value={formData.name}
              onChange={(event) => updateField("name", event.target.value)}
            />
            <small className="error">{errors.name}</small>
          </div>

          <div className={`field ${errors.phone ? "invalid" : ""}`}>
            <label htmlFor="phone">Phone Number <span>*</span></label>
            <div className="phone-input">
              <span>+977</span>
              <input
                type="tel"
                id="phone"
                name="phone"
                placeholder="98765 43210"
                maxLength="10"
                inputMode="numeric"
                autoComplete="tel"
                value={formData.phone}
                onChange={(event) => updateField("phone", event.target.value)}
              />
            </div>
            <small className="error">{errors.phone}</small>
          </div>

          <div className={`field ${errors.address ? "invalid" : ""}`}>
            <label htmlFor="address">Delivery Address <span>*</span></label>
            <textarea
              id="address"
              name="address"
              rows="3"
              placeholder="House / Flat No., Street, Area..."
              autoComplete="street-address"
              value={formData.address}
              onChange={(event) => updateField("address", event.target.value)}
            />
            <small className="error">{errors.address}</small>
          </div>

          <div className="address-row">
            <div className={`field ${errors.city ? "invalid" : ""}`}>
              <label htmlFor="city">City <span>*</span></label>
              <input
                type="text"
                id="city"
                name="city"
                placeholder="City"
                value={formData.city}
                onChange={(event) => updateField("city", event.target.value)}
              />
              <small className="error">{errors.city}</small>
            </div>
          </div>
        </section>

        <section className="form-section">
          <div className="section-header">
            <div className="section-number">2</div>
            <div>
              <h2>Product Details</h2>
              <p>Tell us what you ordered.</p>
            </div>
          </div>

          <div className={`field ${errors.productImage ? "invalid" : ""}`}>
            <label>Product Images <span>*</span></label>
            <div
              className="upload-box"
              data-upload="productImage"
              onClick={() => productImageInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDragEnter={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handleProductFiles(event.dataTransfer.files);
              }}
            >
              <input
                ref={productImageInputRef}
                type="file"
                id="productImage"
                name="productImage"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={(event) => handleProductFiles(event.target.files)}
              />

              <div className="upload-content">
                <div className="upload-icon">📷</div>
                <strong>Upload product image</strong>
                <span>Click to browse or drag & drop</span>
                <small>JPG, PNG or WEBP · Max 5 images · 5 MB each</small>
              </div>
            </div>

            <div className={`file-preview ${productImages.length ? "visible" : ""}`} id="productImagePreview">
              {productImages.length > 0 ? (
                <div className="file-preview-list">
                  {productImages.map((entry) => (
                    <div className="file-preview-item" key={entry.id}>
                      <img src={entry.previewUrl} alt={entry.file.name} />
                      <div className="file-info">
                        <span className="file-name">{entry.file.name}</span>
                        <span className="file-size">{formatFileSize(entry.file.size)}</span>
                      </div>
                      <button
                        type="button"
                        className="remove-file"
                        title="Remove file"
                        onClick={() => removeProductImage(entry.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <small className="error">{errors.productImage}</small>
          </div>
        </section>

        <section className="form-section">
          <div className="section-header">
            <div className="section-number">3</div>
            <div>
              <h2>Payment Details</h2>
              <p>Upload proof of your advance payment.</p>
            </div>
          </div>

          <div className={`field ${errors.advanceAmount ? "invalid" : ""}`}>
            <label htmlFor="advanceAmount">Advance Amount <span>*</span></label>
            <div className="amount-input">
              <span>₹</span>
              <input
                type="number"
                id="advanceAmount"
                name="advanceAmount"
                placeholder="0"
                min="1"
                step="0.01"
                value={formData.advanceAmount}
                onChange={(event) => updateField("advanceAmount", event.target.value)}
              />
            </div>
            <small className="error">{errors.advanceAmount}</small>
          </div>

          <div className={`field ${errors.receiptImage ? "invalid" : ""}`}>
            <label>Transaction / Payment Receipt</label>
            <div
              className="upload-box"
              data-upload="receiptImage"
              onClick={() => receiptImageInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDragEnter={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handleReceiptFile(event.dataTransfer.files?.[0]);
              }}
            >
              <input
                ref={receiptImageInputRef}
                type="file"
                id="receiptImage"
                name="receiptImage"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                hidden
                onChange={(event) => handleReceiptFile(event.target.files?.[0])}
              />

              <div className="upload-content">
                <div className="upload-icon">🧾</div>
                <strong>Upload payment receipt</strong>
                <span>Click to browse or drag & drop</span>
                <small>JPG, PNG, WEBP or PDF · Optional</small>
              </div>
            </div>

            <div className={`file-preview ${receiptImage ? "visible" : ""}`} id="receiptImagePreview">
              {receiptImage ? (
                <div className="file-preview-list">
                  <div className="file-preview-item">
                    {receiptImage.file.type.startsWith("image/") ? (
                      <img src={receiptImage.previewUrl} alt={receiptImage.file.name} />
                    ) : (
                      <div style={{ fontSize: 28 }}>📄</div>
                    )}

                    <div className="file-info">
                      <span className="file-name">{receiptImage.file.name}</span>
                      <span className="file-size">{formatFileSize(receiptImage.file.size)}</span>
                    </div>

                    <button
                      type="button"
                      className="remove-file"
                      title="Remove file"
                      onClick={() => handleReceiptFile(null)}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <small className="error">{errors.receiptImage}</small>
          </div>
        </section>

        <label className="terms">
          <input
            type="checkbox"
            id="terms"
            name="terms"
            checked={formData.terms}
            onChange={(event) => {
              updateField("terms", event.target.checked);
              if (event.target.checked) {
                setTermsError("");
              }
            }}
          />

          <span>
            I confirm that the information provided above is correct and the payment receipt
            belongs to this order.
          </span>
        </label>

        <small className="terms-error">{termsError}</small>

        <button type="submit" className={`submit-button ${isSubmitting ? "loading" : ""}`} disabled={isSubmitting}>
          <span className="button-text">{isSubmitting ? "Submitting..." : "Submit Order"}</span>
          <span className="button-loader" />
        </button>

        <p className="secure-note">🔒 Your information is securely submitted.</p>
      </form>

      <div className="success-message" hidden={!isSubmitted}>
        <div className="success-icon">✓</div>
        <h2>Order Submitted!</h2>
        <p>Thank you! We've received your order details and payment receipt.</p>

        <div className="order-reference">
          Order ID:
          <strong>{orderId}</strong>
        </div>

        <p className="success-note">
          We'll contact you on your registered phone number to confirm your order.
        </p>

        <button type="button" className="secondary-button" onClick={resetForm}>
          Place Another Order
        </button>
      </div>
    </>
  );

  return (
    <main className={`page ${isAdminRoute ? "dashboard-page" : ""}`}>
      <div className="site-brand">
        <span className="site-brand-mark">W</span>
        <span className="site-brand-name">Wizzzey Technologies</span>
      </div>

      <div className="form-container">
        {isAdminRoute ? (isAdminUnlocked ? adminShell : adminLockScreen) : formView}
      </div>

      <footer className="page-footer">
        <p>Wizzzey. Simple, secure, and reliable order submissions.</p>
      </footer>
    </main>
  );
}