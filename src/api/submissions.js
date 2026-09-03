import apiClient from "./client";

const safeJsonParse = (value, fallback) => {
  if (value == null || value === "") return fallback;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const booleanOrNull = (value) => {
  if (value === true || value === false) return value;
  if (value == null || value === "") return null;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return null;
};

export const normalizeRole = (role = "") => String(role).trim().toLowerCase().replaceAll("_", "-");

export const SIGN_OFF_FIELD = "__auditSignOff";

export const normalizeAcademicYearForApi = (value = "") => {
  const match = String(value || "").match(/(\d{4})\D+(\d{2,4})/);
  if (!match) return String(value || "");

  const startYear = Number(match[1]);
  const endYear = match[2].length === 2
    ? Number(`${String(startYear).slice(0, 2)}${match[2]}`)
    : Number(match[2]);

  return `${startYear}-${endYear}`;
};

const compactAcademicYear = (value = "") => {
  const normalized = normalizeAcademicYearForApi(value);
  const match = normalized.match(/(\d{4})-(\d{4})/);
  return match ? `${match[1]}-${match[2].slice(-2)}` : normalized;
};

const uniqueAcademicYearAliases = (academicYear) => {
  if (!academicYear) return [];
  return [...new Set([
    normalizeAcademicYearForApi(academicYear),
    compactAcademicYear(academicYear),
    String(academicYear),
  ].filter(Boolean))];
};

const academicYearParams = (academicYear) => ({
  academicYear,
  auditCycle: academicYear,
  cycleId: academicYear,
});

const historicalDraftParams = {
  includeSubmitted: true,
  includeApproved: true,
  includeReviewed: true,
  includeHistorical: true,
  historical: true,
  readOnly: true,
  status: "all",
};

const responseHasDraftData = (payload) => {
  if (Array.isArray(payload)) return payload.some(responseHasDraftData);
  if (!payload || typeof payload !== "object") return false;

  const candidate = payload.submission ?? payload.draft ?? payload.data ?? payload;
  if (candidate && candidate !== payload) return responseHasDraftData(candidate);

  return Boolean(
    candidate.id ||
    candidate.submissionId ||
    candidate.valuesData ||
    candidate.values ||
    candidate.fieldsData ||
    candidate.fields ||
    candidate.tablesData ||
    candidate.tables ||
    candidate.attachments
  );
};

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

export const signOffProfileFromSession = (fallbackRole = "") => ({
  name: sessionStorage.getItem("name") || "",
  designation: sessionStorage.getItem("designation") || "",
  role: normalizeRole(sessionStorage.getItem("role") || fallbackRole),
});

export const withSubmitterSignOff = (values = {}, profile = signOffProfileFromSession(), submittedAt = new Date().toISOString()) => ({
  ...values,
  [SIGN_OFF_FIELD]: {
    ...(values[SIGN_OFF_FIELD] || {}),
    submittedBy: {
      ...(values[SIGN_OFF_FIELD]?.submittedBy || {}),
      name: profile.name,
      designation: profile.designation,
      role: profile.role,
      date: submittedAt,
    },
  },
});

export const withApproverSignOff = (values = {}, profile = signOffProfileFromSession(), approvedAt = new Date().toISOString()) => ({
  ...values,
  [SIGN_OFF_FIELD]: {
    ...(values[SIGN_OFF_FIELD] || {}),
    approvedBy: {
      name: profile.name,
      designation: profile.designation,
      role: profile.role,
      date: approvedAt,
    },
  },
});

export const getSubmissionSignOff = (submission = {}, values = {}) => {
  const stored = values[SIGN_OFF_FIELD] || {};
  const approvedRole = normalizeRole(
    stored.approvedBy?.role ||
    submission.reviewedByRole ||
    submission.reviewerRole ||
    submission.approvedByRole ||
    "",
  );

  return {
    submittedBy: {
      name: stored.submittedBy?.name || submission.submittedByName || (typeof submission.submittedBy === "string" ? submission.submittedBy : "") || submission.createdBy || submission.user?.name || "",
      designation: stored.submittedBy?.designation || submission.submittedByDesignation || submission.submitterDesignation || submission.user?.designation || "",
      role: normalizeRole(stored.submittedBy?.role || submission.submittedByRole || submission.user?.role || ""),
      date: stored.submittedBy?.date || submission.submittedOn || submission.submittedAt || submission.createdAt || "",
    },
    approvedBy: {
      name: stored.approvedBy?.name || submission.reviewedByName || submission.reviewedBy || submission.approvedBy || "",
      designation: stored.approvedBy?.designation || submission.reviewedByDesignation || submission.reviewerDesignation || submission.approvedByDesignation || "",
      role: approvedRole,
      date: stored.approvedBy?.date || submission.reviewedOn || submission.reviewedAt || submission.approvedOn || submission.approvedAt || "",
    },
  };
};

export const dashboardForRole = (role) => {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole.includes("auditor")) return "/auditor/dashboard";

  const dashboards = {
    director: "/director/dashboard",
    administrative: "/administrative/dashboard",
    "vice-chancellor": "/vice-chancellor/dashboard",
    iqac: "/iqac/dashboard",
  };

  return dashboards[normalizedRole] || "/login";
};

export const normalizeUserProfile = (payload = {}) => {
  const user = payload.user || payload.profile || payload.data?.user || payload.data || payload;
  const token = payload.token || payload.jwt || payload.accessToken || payload.data?.token || payload.data?.jwt || "";
  const refreshToken = payload.refreshToken || payload.data?.refreshToken || user.refreshToken || "";
  const rawRole = normalizeRole(user.role || payload.role || "");
  const accountType = normalizeRole(user.accountType || user.userType || user.type || payload.accountType || (rawRole.includes("auditor") ? "auditor" : ""));
  const category = normalizeRole(user.category || user.auditCategory || payload.category || payload.auditCategory || (
    rawRole.includes("administrative") ? "administrative" : rawRole.includes("academic") ? "academic" : ""
  ));
  const auditorType = normalizeRole(user.auditorType || user.auditorCategory || payload.auditorType || payload.auditorCategory || (
    rawRole.includes("external") ? "external" : rawRole.includes("internal") ? "internal" : ""
  ));
  const auditorRole = normalizeRole(
    user.auditorRole ||
    payload.auditorRole ||
    (accountType === "auditor" ? [category, auditorType, "auditor"].filter(Boolean).join("-") : rawRole),
  );

  return {
    token,
    refreshToken,
    id: user.id || user.userId || payload.id || payload.userId || "",
    email: user.email || user.username || payload.email || payload.username || "",
    name: user.name || user.fullName || payload.name || "",
    designation: user.designation || payload.designation || "",
    school: user.school || user.schoolName || payload.school || "",
    post: user.post || payload.post || "",
    administrativePosts: [
      user.administrativePosts,
      user.assignedPosts,
      user.posts,
      payload.administrativePosts,
      payload.assignedPosts,
      payload.posts,
      user.post,
      payload.post,
    ].map(normalizeListValue).find((posts) => posts.length) || [],
    accountType,
    category,
    auditorType,
    auditorRole,
    universityId: user.universityId || payload.universityId || user.university_id || payload.university_id || "",
    universityCode: user.universityCode || payload.universityCode || user.university_code || payload.university_code || "",
    universityName: user.universityName || payload.universityName || user.university_name || payload.university_name || "",
    academicYear: user.academicYear || user.currentAcademicYear || payload.academicYear || payload.currentAcademicYear || "",
    role: accountType === "auditor" ? auditorRole : rawRole,
  };
};

export const normalizeDraft = (payload = {}, fallbackValues = {}, fallbackTables = {}) => {
  const unwrapDraftPayload = (value = {}) => {
    if (Array.isArray(value)) return value[0] ? unwrapDraftPayload(value[0]) : {};
    if (!value || typeof value !== "object") return {};
    if (value.valuesData || value.values || value.fieldsData || value.fields || value.tablesData || value.tables || value.status || value.submissionId || value.id) {
      return value;
    }
    const inner = value.submission || value.draft || value.data;
    if (inner && typeof inner === "object" && inner !== value) {
      return unwrapDraftPayload(inner);
    }
    return value;
  };
  const draft = unwrapDraftPayload(payload);
  const valuesData = draft.valuesData ?? draft.values ?? draft.fieldsData ?? draft.fields;
  const tablesData = draft.tablesData ?? draft.tables;
  const values = {
    ...fallbackValues,
    ...safeJsonParse(valuesData, {}),
  };
  const status = String(draft.status || "").trim().toLowerCase().replaceAll("_", "-");
  const overallStatus = String(draft.overallStatus || status).trim().toLowerCase().replaceAll("_", "-");
  const permissions = safeJsonParse(draft.permissions, {});
  const reportCategory = normalizeRole(draft.reportCategory || draft.auditClassification || draft.approvedReportCategory || draft.category || "");
  const cycleType = normalizeRole(draft.cycleType || draft.auditCycleType || reportCategory || "");
  const contributionStatus = normalizeRole(
    draft.contributionStatus ||
    draft.myContributionStatus ||
    draft.userContributionStatus ||
    draft.currentContributionStatus ||
    "",
  );

  return {
    id: draft.id || draft.submissionId || null,
    cycleId: draft.cycleId || draft.auditCycleId || draft.currentCycleId || draft.academicYear || null,
    cycleType,
    reportCategory,
    version: Number(draft.version || draft.reportVersion || draft.cycleVersion || 1),
    exists: Boolean(
      draft.id ||
      draft.submissionId ||
      valuesData ||
      tablesData ||
      draft.attachments ||
      draft.status,
    ),
    status,
    overallStatus,
    contributionStatus,
    canEditContribution: booleanOrNull(draft.canEditContribution ?? permissions.canEditContribution),
    canForwardToAuditor: booleanOrNull(draft.canForwardToAuditor ?? permissions.canForwardToAuditor),
    allContributorsSubmitted: booleanOrNull(
      draft.allContributorsSubmitted ??
      draft.allAdministrativeContributorsSubmitted ??
      permissions.allContributorsSubmitted
    ),
    isSubmitted: ["submitted", "under-review", "auditor-completed", "approved"].includes(overallStatus),
    administrativeProgress: safeJsonParse(
      draft.administrativeProgress || draft.sectionProgress || draft.contributionProgress,
      {},
    ),
    values,
    tables: {
      ...fallbackTables,
      ...safeJsonParse(tablesData, {}),
    },
    attachments: extractAllUniqueAttachments(draft.attachments, tablesData, valuesData),
    auditorAssignments: safeJsonParse(draft.auditorAssignments || draft.auditorReviews || draft.assignments, []),
    versionHistory: safeJsonParse(draft.versionHistory || draft.previousVersions || draft.snapshots, []),
    remarks: draft.remarks || draft.iqacRemarks || draft.reviewRemarks || "",
    auditCycle: draft.auditCycle || draft.cycleLabel || draft.auditPeriod || draft.academicYear || "",
    auditorReviewedBy: draft.auditorReviewedBy || draft.auditedBy || "",
    auditorReviewedByDesignation: draft.auditorReviewedByDesignation || draft.auditorDesignation || "",
    auditorReviewedByRole: draft.auditorReviewedByRole || draft.auditorRole || "",
    auditorReviewedByEmail: draft.auditorReviewedByEmail || draft.auditorEmail || "",
    auditorReviewedOn: draft.auditorReviewedOn || draft.auditedOn || "",
  };
};

export const extractAllUniqueAttachments = (attachmentsPayload, tablesData, valuesData) => {
  const list = [];
  const seen = new Set();

  const addAttachment = (item) => {
    if (!item || typeof item !== "object") return;
    const url = item.url || item.publicUrl || item.downloadUrl || "";
    const fileName = item.fileName || item.filename || item.name || "";
    if (!url && !fileName) return;

    const key = (url || fileName).trim().toLowerCase();
    if (key && seen.has(key)) return;
    if (key) seen.add(key);

    list.push({
      name: fileName || "Attachment",
      fileName: fileName || "Attachment",
      url: url || "",
      ...item,
    });
  };

  const processNode = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(processNode);
    } else if (typeof node === "object") {
      if (node.url || node.publicUrl || node.downloadUrl || node.fileName || node.filename) {
        addAttachment(node);
      }
      Object.values(node).forEach(processNode);
    }
  };

  const rawAttachments = safeJsonParse(attachmentsPayload, []);
  if (Array.isArray(rawAttachments)) {
    rawAttachments.forEach(addAttachment);
  }

  processNode(safeJsonParse(tablesData, {}));
  processNode(safeJsonParse(valuesData, {}));

  return list;
};

export const extractAttachments = (tables) => {
  const attachments = [];

  Object.entries(tables || {}).forEach(([tableId, rows]) => {
    (rows || []).forEach((row, rowIndex) => {
      Object.entries(row || {}).forEach(([column, value]) => {
        const files = Array.isArray(value) ? value : [value];

        files.forEach((file) => {
          if (!file || typeof file !== "object" || !(file.url || file.publicUrl || file.fileName || file.name)) return;
          attachments.push({
            tableId,
            rowIndex,
            column,
            fileName: file.fileName || file.filename || file.name || "",
            name: file.name || file.fileName || file.filename || "",
            url: file.url || file.publicUrl || file.downloadUrl || "",
          });
        });
      });
    });
  });

  return attachments;
};

export const buildSubmissionPayload = ({ auditType, values, tables, attachments, academicYear }) => ({
  auditType,
  ...(academicYear ? {
    academicYear,
    auditCycle: academicYear,
    cycleId: academicYear,
  } : {}),
  valuesData: JSON.stringify(values || {}),
  tablesData: JSON.stringify(tables || {}),
  attachments: JSON.stringify(attachments || extractAttachments(tables)),
});

export const fetchMyDraft = (auditType, academicYear) =>
  fetchMyDraftForAcademicYearAliases(auditType, academicYear);

const fetchMyDraftVariant = (auditType, yearAlias, sharedParams, extraParams = {}) =>
  apiClient.get("/api/submissions/my-draft", {
    params: {
      auditType,
      ...(yearAlias ? academicYearParams(yearAlias) : {}),
      ...sharedParams,
      ...extraParams,
    },
  });

const fetchMyDraftForAcademicYearAliases = async (auditType, academicYear) => {
  const yearAliases = uniqueAcademicYearAliases(academicYear);
  const sharedParams = auditType === "administrative" ? { shared: true } : {};

  if (!yearAliases.length) {
    return fetchMyDraftVariant(auditType, "", sharedParams);
  }

  let fallbackResponse;
  for (const yearAlias of yearAliases) {
    const response = await fetchMyDraftVariant(auditType, yearAlias, sharedParams);
    fallbackResponse = fallbackResponse || response;
    if (responseHasDraftData(response.data)) return response;
  }

  if (auditType === "academic") {
    for (const yearAlias of yearAliases) {
      const response = await fetchMyDraftVariant(auditType, yearAlias, sharedParams, historicalDraftParams);
      fallbackResponse = fallbackResponse || response;
      if (responseHasDraftData(response.data)) return response;
    }
  }

  return fallbackResponse;
};

export const saveDraft = (payload, { isUpdate = false } = {}) =>
  apiClient.request({
    method: isUpdate ? "put" : "post",
    url: "/api/submissions/save-draft",
    data: payload,
  });

export const submitDraft = (payload, { isUpdate = false } = {}) =>
  apiClient.request({
    method: isUpdate ? "put" : "post",
    url: "/api/submissions/submit",
    data: payload,
  });

export const updateSubmissionById = (id, payload) =>
  apiClient.put(`/api/submissions/${id}`, payload);

export const updateTableData = (tableName, submissionId, rows) =>
  apiClient.put(
    `/api/tables/${encodeURIComponent(tableName)}/submission/${encodeURIComponent(submissionId)}`,
    rows,
  );

export const uploadAttachment = async (file) => {
  const formData = new FormData();
  formData.append("file", file);

  const { data } = await apiClient.post("/api/attachments/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  const uploaded = data.data || data;
  return {
    name: uploaded.name || uploaded.fileName || uploaded.filename || file.name,
    fileName: uploaded.fileName || uploaded.filename || uploaded.name || file.name,
    url: uploaded.url || uploaded.publicUrl || uploaded.downloadUrl || "",
  };
};

export const uploadAttachments = async (files) => {
  const selectedFiles = Array.from(files || []);
  const formData = new FormData();
  selectedFiles.forEach((file) => formData.append("files", file));

  const { data } = await apiClient.post("/api/attachments/upload-multiple", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  const uploadedFiles = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
  return uploadedFiles.map((uploaded, index) => ({
    name: uploaded.name || uploaded.fileName || uploaded.filename || selectedFiles[index]?.name || "",
    fileName: uploaded.fileName || uploaded.filename || uploaded.name || selectedFiles[index]?.name || "",
    url: uploaded.url || uploaded.publicUrl || uploaded.downloadUrl || "",
  }));
};

export const deleteAttachment = (attachment) =>
  apiClient.delete("/api/attachments/delete", {
    data: { url: attachment.url },
  });

export const fetchAllSubmissions = () => apiClient.get("/api/submissions/all");
export const fetchSubmissionById = (id) => apiClient.get(`/api/submissions/${id}`);
export const fetchSubmissionSnapshots = (id) => apiClient.get(`/api/submissions/${id}/snapshots`);
export const reviewSubmission = (id, payload) => apiClient.post(`/api/submissions/${id}/review`, payload);
export const submitAuditorReview = (id, payload) => apiClient.post(`/api/submissions/${id}/auditor-submit`, payload);
export const downloadSubmissionAttachments = (id, { includeAllContributors = false } = {}) =>
  apiClient.get(`/api/submissions/${id}/attachments/download`, {
    params: includeAllContributors ? { includeAllContributors: true } : undefined,
    responseType: "blob",
  });
export const createNextAuditCycle = (id, payload = {}) =>
  apiClient.post(`/api/submissions/${id}/next-cycle`, {
    preserveApprovedVersion: true,
    ...payload,
  });
export const fetchAuditCycles = () => apiClient.get("/api/audit-cycles");
export const fetchCurrentAuditCycle = () => apiClient.get("/api/audit-cycles/current");
export const startNextAcademicYear = (payload) =>
  apiClient.post("/api/audit-cycles/start-next", payload);

export const submitAdministrativePart = (cycleId) =>
  apiClient.post(`/api/submissions/administrative/${encodeURIComponent(cycleId)}/submit`);

export const fetchAdministrativeStatus = (cycleId) =>
  apiClient.get(`/api/submissions/administrative/${encodeURIComponent(cycleId)}/status`);

export const parseSubmissionFormData = (submission = {}) => {
  const values = safeJsonParse(submission.valuesData ?? submission.values ?? submission.fieldsData ?? submission.fields, {});
  const tables = safeJsonParse(submission.tablesData ?? submission.tables, {});
  const attachments = extractAllUniqueAttachments(submission.attachments, submission.tablesData, submission.valuesData);

  return {
    values,
    tables,
    attachments,
    hasSavedData: Boolean(submission.valuesData || submission.values || submission.fieldsData || submission.fields || submission.tablesData || submission.tables),
  };
};
