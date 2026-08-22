import axios from "axios";

const getApiBaseUrl = () => {
  const runtime = globalThis.__APP_CONFIG__?.VITE_API_BASE_URL;
  if (runtime && !runtime.startsWith("/AAA")) {
    return runtime;
  }
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && !envUrl.startsWith("/AAA")) {
    return envUrl;
  }
  // In development, empty string leverages Vite's dev proxy (/api -> http://localhost:9000)
  return import.meta.env.DEV ? "" : "http://localhost:9000";
};

const apiBaseUrl = getApiBaseUrl();
const loginPath = import.meta.env.MODE === "vm" ? "/AAA/login" : "/login";

const apiClient = axios.create({
  baseURL: apiBaseUrl,
});

const setSessionValue = (key, value) => {
  const strVal = value == null ? "" : String(value);
  sessionStorage.setItem(key, strVal);
  localStorage.setItem(key, strVal);
};

const normalizeRoleValue = (value = "") => String(value).trim().toLowerCase().replaceAll("_", "-");

const normalizeListValue = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
};

const decodeJwtPayload = (token = "") => {
  try {
    const [, payload] = token.split(".");
    if (!payload) return {};
    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = normalizedPayload.padEnd(normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4), "=");
    return JSON.parse(atob(paddedPayload));
  } catch {
    return {};
  }
};

const isJwtExpired = (token = "") => {
  const { exp } = decodeJwtPayload(token);
  return typeof exp === "number" && exp * 1000 <= Date.now();
};

const storeUserProfile = (profile = {}) => {
  const rawRole = normalizeRoleValue(profile.role || "");
  const accountType = normalizeRoleValue(profile.accountType || (rawRole.includes("auditor") ? "auditor" : ""));
  const category = normalizeRoleValue(profile.category || "");
  const auditorType = normalizeRoleValue(profile.auditorType || "");
  const auditorRole = normalizeRoleValue(
    profile.auditorRole ||
    (accountType === "auditor" ? [category, auditorType, "auditor"].filter(Boolean).join("-") : rawRole)
  );
  const role = accountType === "auditor" ? auditorRole || rawRole : rawRole;
  const administrativePosts = normalizeListValue(
    profile.administrativePosts || profile.assignedPosts || profile.posts || profile.post
  );

  setSessionValue("userId", profile.id || profile.userId || "");
  setSessionValue("email", profile.email || profile.username || "");
  setSessionValue("username", profile.email || profile.username || "");
  setSessionValue("name", profile.name || profile.fullName || "");
  setSessionValue("designation", profile.designation || "");
  setSessionValue("school", profile.school || profile.schoolName || "");
  setSessionValue("post", profile.post || "");
  setSessionValue("administrativePosts", JSON.stringify(administrativePosts));
  setSessionValue("accountType", accountType);
  setSessionValue("category", category);
  setSessionValue("auditorType", auditorType);
  setSessionValue("auditorRole", auditorRole);
  setSessionValue("role", role);
  setSessionValue("academicYear", profile.academicYear || profile.currentAcademicYear || "");
  setSessionValue("universityId", profile.universityId || "");
  setSessionValue("universityCode", profile.universityCode || "");
};

const storeTokenSession = (accessToken, refreshToken) => {
  setSessionValue("token", accessToken);
  if (refreshToken) {
    setSessionValue("refreshToken", refreshToken);
  }
  apiClient.defaults.headers.common.Authorization = `Bearer ${accessToken}`;

  const claims = decodeJwtPayload(accessToken);
  storeUserProfile({
    email: claims.email || claims.sub || claims.username,
    name: claims.name,
    designation: claims.designation,
    school: claims.school,
    role: claims.role,
    post: claims.post,
    currentAcademicYear: claims.currentAcademicYear,
    administrativePosts: claims.administrativePosts,
    universityId: claims.universityId,
    universityCode: claims.universityCode,
  });
};


export const clearAuthState = () => {
  sessionStorage.clear();
  localStorage.clear();
  delete apiClient.defaults.headers.common.Authorization;
};

const redirectToLogin = () => {
  if (globalThis.location?.pathname !== loginPath) {
    globalThis.location.replace(loginPath);
  }
};

const isDebugLoggingEnabled = () => {
  return import.meta.env.DEV || import.meta.env.VITE_API_DEBUG_LOGGING === "true";
};

const generateCorrelationId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "c-" + Math.random().toString(36).substring(2, 15) + "-" + Date.now().toString(36);
};

const SENSITIVE_KEYS = new Set([
  "password", "confirmpassword", "currentpassword", "newpassword",
  "token", "accesstoken", "refreshtoken", "jwt", "authorization",
  "cookie", "secret", "apikey", "clientsecret", "privatekey"
]);

export const sanitizePayload = (data, depth = 0) => {
  if (data == null || depth > 5) return data;
  if (typeof data === "string") {
    if (data.length > 50000) {
      return data.substring(0, 2000) + `... [TRUNCATED originalLength=${data.length}]`;
    }
    return data;
  }
  if (typeof data !== "object") return data;
  if (typeof FormData !== "undefined" && data instanceof FormData) {
    return "[FormData payload]";
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return `[Blob size=${data.size} type=${data.type}]`;
  }
  if (Array.isArray(data)) {
    return data.slice(0, 100).map((item) => sanitizePayload(item, depth + 1));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = sanitizePayload(value, depth + 1);
    }
  }
  return sanitized;
};

apiClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("token") || localStorage.getItem("token");
  config.headers = config.headers || {};
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const correlationId = config.headers["X-Correlation-Id"] || config.headers["X-Correlation-ID"] || generateCorrelationId();
  config.headers["X-Correlation-Id"] = correlationId;
  config.metadata = { startTime: Date.now(), correlationId };

  if (isDebugLoggingEnabled()) {
    try {
      console.groupCollapsed(`[API REQUEST] ${config.method?.toUpperCase()} ${config.url} (corr: ${correlationId})`);
      console.log({
        method: config.method?.toUpperCase(),
        url: config.url,
        baseURL: config.baseURL,
        params: config.params,
        body: sanitizePayload(config.data),
        correlationId,
        timestamp: new Date().toISOString()
      });
      console.groupEnd();
    } catch {
      // safe fallback
    }
  }

  return config;
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

const refreshAccessToken = async (storedRefreshToken) => {
  const res = await axios.post(`${apiBaseUrl}/api/auth/refresh`, {
    refreshToken: storedRefreshToken,
  });
  const newAccessToken = res.data?.token || res.data?.accessToken;
  if (!newAccessToken) {
    throw new Error("Refresh response is missing access token.");
  }

  const nextRefreshToken = res.data?.refreshToken || storedRefreshToken;
  storeTokenSession(newAccessToken, nextRefreshToken);
  return { token: newAccessToken, refreshToken: nextRefreshToken };
};

export const restoreAuthSession = async () => {
  const authKeys = [
    "token", "refreshToken", "userId", "email", "username", "name",
    "designation", "school", "post", "administrativePosts",
    "accountType", "category", "auditorType", "auditorRole", "role", "academicYear",
    "universityId", "universityCode"
  ];
  authKeys.forEach((key) => {
    const val = localStorage.getItem(key);
    if (val && !sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, val);
    }
  });


  const sessionToken = sessionStorage.getItem("token") || localStorage.getItem("token");
  const sessionRole = sessionStorage.getItem("role") || localStorage.getItem("role");

  if (sessionToken && sessionRole && !isJwtExpired(sessionToken)) {
    apiClient.defaults.headers.common.Authorization = `Bearer ${sessionToken}`;
    return true;
  }

  const storedRefreshToken = localStorage.getItem("refreshToken") || sessionStorage.getItem("refreshToken");
  if (!storedRefreshToken) return false;

  try {
    const { token } = await refreshAccessToken(storedRefreshToken);
    try {
      const profileResponse = await axios.get(`${apiBaseUrl}/api/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      storeUserProfile(profileResponse.data?.data || profileResponse.data?.user || profileResponse.data || {});
    } catch {
      // A valid refresh token is enough to restore the session; profile fetches can retry in-page.
    }
    return true;
  } catch {
    clearAuthState();
    return false;
  }
};

apiClient.interceptors.response.use(
  (response) => {
    const durationMs = response.config?.metadata?.startTime
      ? Date.now() - response.config.metadata.startTime
      : 0;
    const correlationId = response.headers?.["x-correlation-id"] || response.config?.metadata?.correlationId;

    if (isDebugLoggingEnabled()) {
      try {
        console.groupCollapsed(`[API RESPONSE] ${response.config?.method?.toUpperCase()} ${response.config?.url} → ${response.status} (${durationMs}ms) [corr: ${correlationId}]`);
        console.log({
          method: response.config?.method?.toUpperCase(),
          url: response.config?.url,
          status: response.status,
          durationMs,
          correlationId,
          data: sanitizePayload(response.data)
        });
        console.groupEnd();
      } catch {
        // safe fallback
      }
    }

    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const durationMs = originalRequest?.metadata?.startTime
      ? Date.now() - originalRequest.metadata.startTime
      : 0;
    const correlationId = error.response?.headers?.["x-correlation-id"] ||
                          error.response?.data?.correlationId ||
                          originalRequest?.metadata?.correlationId;

    // Structured error diagnostics
    try {
      console.groupCollapsed(`[API ERROR] ${originalRequest?.method?.toUpperCase()} ${originalRequest?.url} → ${error.response?.status || "NETWORK_ERROR"} (${durationMs}ms) [corr: ${correlationId}]`);
      console.error({
        method: originalRequest?.method?.toUpperCase(),
        url: originalRequest?.url,
        status: error.response?.status,
        durationMs,
        correlationId,
        params: originalRequest?.params,
        requestBody: sanitizePayload(originalRequest?.data),
        responseBody: sanitizePayload(error.response?.data),
        errorMessage: error.message,
        errorCode: error.response?.data?.code || "UNKNOWN_ERROR"
      });
      console.groupEnd();
    } catch {
      // safe fallback
    }

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/api/auth/")
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      const storedRefreshToken =
        sessionStorage.getItem("refreshToken") || localStorage.getItem("refreshToken");

      if (!storedRefreshToken) {
        clearAuthState();
        redirectToLogin();
        return Promise.reject(error);
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { token: newAccessToken } = await refreshAccessToken(storedRefreshToken);
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        processQueue(null, newAccessToken);
        return apiClient(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        clearAuthState();
        redirectToLogin();
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export const getApiErrorMessage = (error, fallback = "Something went wrong. Please try again.") => {
  if (!error) return fallback;

  // 1. Direct message from structured ApiErrorResponse
  if (error.response?.data?.message && typeof error.response.data.message === "string") {
    return error.response.data.message;
  }
  // 2. Direct error field from ApiErrorResponse
  if (error.response?.data?.error && typeof error.response.data.error === "string") {
    return error.response.data.error;
  }
  // 3. String response body (excluding HTML 404 pages)
  if (typeof error.response?.data === "string" && error.response.data.trim()) {
    const trimmed = error.response.data.trim();
    if (!trimmed.startsWith("<!DOCTYPE") && !trimmed.startsWith("<html")) {
      return trimmed;
    }
  }
  // 4. Specific HTTP status diagnostics
  if (error.response?.status === 404) {
    return "API endpoint not found (404). Please ensure API Gateway (port 9000) and auth service are running.";
  }
  if (error.response?.status === 401) {
    return "Invalid email address or password.";
  }
  if (error.response?.status === 403) {
    return "Access denied. You do not have permission to access this resource.";
  }
  if (error.response?.status === 429) {
    return "Too many login attempts. Please wait a minute and try again.";
  }
  if (error.response?.status >= 500) {
    return "Internal server error. Please check the backend service logs.";
  }
  if (error.code === "ERR_NETWORK" || error.message === "Network Error") {
    return "Unable to connect to backend server. Please verify API Gateway (port 9000) is running.";
  }

  return error.message || fallback;
};

export default apiClient;



