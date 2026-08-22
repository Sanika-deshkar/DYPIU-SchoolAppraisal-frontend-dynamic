import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { clearAuthState, getApiErrorMessage } from "../../../api/client";
import {
  SIGN_OFF_FIELD,
  buildSubmissionPayload,
  createNextAuditCycle,
  downloadSubmissionAttachments,
  fetchAllSubmissions,
  fetchSubmissionById,
  fetchSubmissionSnapshots,
  getSubmissionSignOff,
  parseSubmissionFormData,
  reviewSubmission,
  startNextAcademicYear,
  fetchCurrentAuditCycle,
  submitAuditorReview,
  updateSubmissionById,
  uploadAttachments,
  deleteAttachment,
  withApproverSignOff,
} from "../../../api/submissions";
import { fetchCurrentUser, fetchUsers } from "../../../api/users";
import universityLogo from "../../../assets/images/image.png";
import iqacLogo from "../../../assets/images/IQAS.png";
import AppSidebar from "../components/AppSidebar";
import AuditReportPanel from "../components/AuditReportPanel";
import { InlineSpinner, LoadingState, SkeletonList } from "../components/LoadingState";
import { columnsWithSerial } from "../components/tableHelpers";
import UserProfileModal from "../components/UserProfileModal";
import { administrativeAuditMeta, administrativeAuditModules } from "../administrativeAudit/administrativeAuditConfig";
import AdministrativeReportPanel from "../administrativeAudit/AdministrativeReportPanel";
import AdministrativePartE from "../administrativeAudit/AdministrativePartE";
import { academicAudit2025Schema } from "../formSchemas";
import UserManagementPanel from "../userManagement/UserManagementPanel";
import {
  ADMINISTRATIVE_POSTS,
  SCHOOL_OPTIONS,
  schoolGroupFor,
  canonicalSchoolCode,
  getStoredAcademicAuditorSchools,
  normalizeAcademicSchoolCodes,
} from "../userManagement/userManagementConfig";
import BackupRestorePanel from "./BackupRestorePanel";
import { formatDateDDMMYYYY } from "../../../utils/dateFormat";
import { getAttachmentUrl } from "../../../utils/attachment";
import { scrollPageToTop } from "../../../utils/scrollToTop";

const REVIEW_NAV_ITEMS = [
  { id: "overview", title: "Overview" },
  { id: "advanced-overview", title: "Advanced Overview" },
  { id: "academic", title: "Academic Audit" },
  { id: "administrative", title: "Administrative Audit" },
];
const AUDITOR_FINAL_REVIEW_NAV_ITEM = {
  id: "auditor-final-review",
  title: "Auditor Final Review",
  caption: "Completed auditor forms",
  group: "final-verification",
  groupLabel: "Final Verification",
};
const PREVIOUS_REPORTS_NAV_ITEM = {
  id: "previous-reports",
  title: "Previous Reports",
  caption: "Approved report history",
  group: "final-verification",
  groupLabel: "Final Verification",
};
const USER_MANAGEMENT_NAV_ITEM = { id: "user-management", title: "User Management" };
const REPORT_ARCHIVE_FIELD = "__reportArchive";
const ADMIN_SUBMISSION_STATUS_FIELD = "__administrativeSubmissionStatus";
const AUDITOR_ASSIGNMENT_STATUS_FIELD = "__auditorAssignmentStatus";
const START_NEXT_YEAR_NAV_ITEM = {
  id: "start-next-academic-year",
  title: "Start Next Academic Year",
  caption: "Create blank yearly forms",
  group: "audit-cycle",
  groupLabel: "Audit Cycle",
};
const BACKUP_RESTORE_NAV_ITEM = {
  id: "backup-restore",
  title: "Backup & Restore",
  caption: "Database & Uploads backup",
  group: "system-admin",
  groupLabel: "System Administration",
};
const REVIEW_ROUTE_VIEW_IDS = new Set([
  ...REVIEW_NAV_ITEMS.map((item) => item.id),
  AUDITOR_FINAL_REVIEW_NAV_ITEM.id,
  PREVIOUS_REPORTS_NAV_ITEM.id,
  USER_MANAGEMENT_NAV_ITEM.id,
  BACKUP_RESTORE_NAV_ITEM.id,
]);

const routeViewFor = (value, fallback) => {
  const normalized = String(value || "").trim();
  return REVIEW_ROUTE_VIEW_IDS.has(normalized) ? normalized : fallback;
};

const REVIEW_ROLE_CONFIG = {
  "vice-chancellor": {
    badge: "VC",
    title: "Vice Chancellor Dashboard",
    roleTitle: "Vice Chancellor",
    roleText: "School Appraisal Review",
  },
  iqac: {
    badge: "IQ",
    title: "IQAC Dashboard",
    roleTitle: "IQAC",
    roleText: "School Appraisal Review",
  },
  auditor: {
    badge: "AU",
    title: "Auditor Dashboard",
    roleTitle: "Auditor",
    roleText: "Assigned Audit Remarks",
  },
};

const SCHOOL_GROUPS = {
  engineering: "Engineering",
  nonEngineering: "Non-Engineering",
  all: "All Schools",
};

const statusLabels = {
  submitted: "Submitted",
  "under-review": "Under Review",
  "auditor-completed": "Auditor Completed",
  "external_auditor_completed": "Auditor Completed",
  "external-auditor-completed": "Auditor Completed",
  approved: "Approved",
};

const statusStyles = {
  submitted: { color: "#1d4ed8", background: "#dbeafe", border: "#bfdbfe" },
  "under-review": { color: "#92400e", background: "#fef3c7", border: "#fde68a" },
  "auditor-completed": { color: "#0f766e", background: "#ccfbf1", border: "#99f6e4" },
  "external_auditor_completed": { color: "#0f766e", background: "#ccfbf1", border: "#99f6e4" },
  "external-auditor-completed": { color: "#0f766e", background: "#ccfbf1", border: "#99f6e4" },
  approved: { color: "#166534", background: "#dcfce7", border: "#bbf7d0" },
};

const auditLabels = {
  academic: "Academic Audit",
  administrative: "Administrative Audit",
};

const groupTabs = [
  { id: "all", label: "All Schools" },
  { id: "engineering", label: "Engineering" },
  { id: "nonEngineering", label: "Non-Engineering" },
];

const initialsFor = (name = "") => name.split(" ").filter(Boolean).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
const titleCase = (value = "") => String(value).replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const normalizeAcademicYear = (value = "2025-2026") => {
  const match = String(value).match(/(\d{4})\D+(\d{2,4})/);
  if (!match) return "2025-2026";
  const startYear = Number(match[1]);
  const endYear = match[2].length === 2
    ? Number(`${String(startYear).slice(0, 2)}${match[2]}`)
    : Number(match[2]);
  return `${startYear}-${endYear}`;
};
const nextAcademicYearFor = (value) => {
  const [startYear, endYear] = normalizeAcademicYear(value).split("-").map(Number);
  return `${startYear + 1}-${endYear + 1}`;
};
const reportVersionForCategory = (category = "", fallbackVersion = 1) => {
  const normalized = normalizeUserRole(category);
  if (normalized === "internal") return 1;
  if (normalized === "external") return 2;
  return Number(fallbackVersion || 1);
};
const compactAcademicYear = (value) => {
  const [startYear, endYear] = normalizeAcademicYear(value).split("-");
  return `${startYear}-${endYear.slice(-2)}`;
};
const academicYearPeriod = (value) => {
  const [startYear, endYear] = normalizeAcademicYear(value).split("-");
  return `July, ${startYear} - June, ${endYear}`;
};
const hasAuditorAssignment = (submission = {}) => Boolean(
  submission.forwardedAt ||
  submission.forwardedToAuditorId ||
  submission.forwardedToAuditorName ||
  submission.forwardedToAuditorIds?.length ||
  submission.forwardedToAuditorEmails?.length ||
  ["under-review", "auditor-completed", "approved"].includes(submission.status)
);
const safeArchiveName = (value = "") => String(value).trim().replace(/[<>:"/\\|?*]+/g, "_").replace(/\s+/g, "_");
const archiveFileName = (submission, headers = {}) => {
  const disposition = headers["content-disposition"] || headers.get?.("content-disposition") || "";
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plainName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  if (encodedName) {
    try {
      return decodeURIComponent(encodedName);
    } catch {
      return encodedName;
    }
  }
  if (plainName) return plainName;

  const owner = submission.auditType === "academic"
    ? submission.school
    : submission.submittedByDesignation || submission.school;
  return `${submission.auditType === "academic" ? "Academic" : "Administrative"}_${safeArchiveName(owner)}_${safeArchiveName(submission.auditCycle || "Attachments")}.zip`;
};
const isAttachmentValue = (value) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  (value.url || value.publicUrl || value.downloadUrl || value.name || value.fileName);
const attachmentKeyFor = (attachment = {}) =>
  attachment.url || attachment.publicUrl || attachment.downloadUrl || attachment.fileName || attachment.filename || attachment.name || "";
const uniqueAttachments = (attachments = []) => {
  const seen = new Set();
  return attachments.filter((attachment) => {
    const key = attachmentKeyFor(attachment);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const attachmentsFromValues = (values = {}) =>
  Object.values(values).flatMap((value) => {
    if (Array.isArray(value)) return value.filter(isAttachmentValue);
    return isAttachmentValue(value) ? [value] : [];
  });
const extensionForFileName = (name = "") =>
  String(name).split("?")[0].split("#")[0].split(".").pop()?.toLowerCase() || "";
const attachmentFileName = (attachment = {}) =>
  attachment.name || attachment.fileName || attachment.filename || attachment.url || attachment.publicUrl || attachment.downloadUrl || "";
const isBrowserPreviewableAttachment = (attachment = {}) => {
  const contentType = String(attachment.contentType || attachment.mimeType || attachment.type || "").toLowerCase();
  const extension = extensionForFileName(attachmentFileName(attachment));
  return (
    contentType.includes("pdf") ||
    contentType.startsWith("image/") ||
    contentType.startsWith("text/") ||
    ["pdf", "png", "jpg", "jpeg", "gif", "webp", "svg", "txt", "csv"].includes(extension)
  );
};
const documentTypeLabel = (attachment = {}) => {
  const extension = extensionForFileName(attachmentFileName(attachment));
  const labels = {
    pdf: "PDF document",
    xls: "Excel workbook",
    xlsx: "Excel workbook",
    csv: "CSV file",
    doc: "Word document",
    docx: "Word document",
    zip: "ZIP archive",
  };
  return labels[extension] || "Document";
};
const directDownloadUrl = (url, name) => {
  const resolvedUrl = getAttachmentUrl(url);
  try {
    const downloadUrl = new URL(resolvedUrl);
    if (downloadUrl.hostname.includes("storage.googleapis.com") && !downloadUrl.searchParams.has("X-Goog-Signature")) {
      downloadUrl.searchParams.set("response-content-disposition", `attachment; filename="${name}"`);
      downloadUrl.searchParams.set("response-content-type", "application/octet-stream");
      return downloadUrl.toString();
    }
  } catch {
    return resolvedUrl;
  }
  return resolvedUrl;
};
const downloadAttachmentFile = async (url, name) => {
  const resolvedUrl = getAttachmentUrl(url);
  try {
    const response = await fetch(resolvedUrl);
    if (!response.ok) throw new Error("Download failed");
    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = objectUrl;
    downloadLink.download = name;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    window.open(directDownloadUrl(url, name), "_blank", "noopener,noreferrer");
  }
};

const blocksFor = (section) =>
  section.blocks || [
    ...(section.fields?.length ? [{ type: "fields", fields: section.fields }] : []),
    ...(section.tables?.length ? [{ type: "tables", tables: section.tables }] : []),
  ];

const sectionsForAudit = (auditType) => auditType === "academic" ? academicAudit2025Schema.sections : administrativeAuditModules;

const normalizeAuditType = (value = "") => String(value).toLowerCase().includes("admin") ? "administrative" : "academic";
const normalizeOptionalAuditType = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("admin")) return "administrative";
  if (normalized.includes("academic")) return "academic";
  return "";
};
const normalizeStatus = (value = "submitted") => String(value).toLowerCase().replaceAll("_", "-");
const backendStatusFor = (status) => status.toUpperCase().replaceAll("-", "_");
const isAuditorRole = (role = "") => String(role).includes("auditor");
function auditorTypeForReportCategory(value = "") {
  const category = normalizeUserRole(value);
  return ["internal", "external"].includes(category) ? category : "";
}
const ACADEMIC_PART_E_SECTION_ID = "part-e-observations";
const ACADEMIC_PART_E_FIELD_IDS = ["auditObservations", "auditRecommendations", "auditDocumentation"];
const auditorSectionNumberFor = (auditType) => auditType === "academic" ? "E" : "F";
const isAuditorSection = (section, auditType) =>
  section.number === auditorSectionNumberFor(auditType) ||
  new RegExp(`^Part\\s+${auditorSectionNumberFor(auditType)}\\b`, "i").test(section.title || "");
const hasAcademicPartEValues = (values = {}) =>
  ACADEMIC_PART_E_FIELD_IDS.some((fieldId) => {
    const value = values[fieldId];
    if (Array.isArray(value)) return value.length > 0;
    if (isAttachmentValue(value)) return true;
    if (value && typeof value === "object") return Object.keys(value).length > 0;
    return String(value || "").trim().length > 0;
  });
const comparablePartEValue = (value) => {
  if (Array.isArray(value)) return JSON.stringify(value.map(comparablePartEValue));
  if (isAttachmentValue(value)) return attachmentKeyFor(value);
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value || "").trim();
};
const academicPartEValuesMatch = (firstValues = {}, secondValues = {}) =>
  ACADEMIC_PART_E_FIELD_IDS.every((fieldId) =>
    comparablePartEValue(firstValues[fieldId]) === comparablePartEValue(secondValues[fieldId])
  );
const clearAcademicPartEValues = (values = {}) => ({
  ...values,
  auditObservations: "",
  auditRecommendations: "",
  auditDocumentation: [],
});
const hidePendingAuditorReviewValues = clearAcademicPartEValues;
const removeMatchingPartEAttachments = (attachments = [], previousValues = {}) => {
  const previousAttachmentKeys = new Set(
    valueList(previousValues.auditDocumentation)
      .filter(isAttachmentValue)
      .map(attachmentKeyFor)
      .filter(Boolean)
  );
  if (!previousAttachmentKeys.size) return attachments;
  return attachments.filter((attachment) => !previousAttachmentKeys.has(attachmentKeyFor(attachment)));
};
const withAuditorSignOff = (values = {}, profile = {}, auditedAt = new Date().toISOString()) => ({
  ...values,
  [SIGN_OFF_FIELD]: {
    ...(values[SIGN_OFF_FIELD] || {}),
    auditedBy: {
      name: profile.name,
      designation: profile.designation,
      role: profile.role,
      email: profile.email,
      date: auditedAt,
    },
  },
});
const getAuditorSignOff = (values = {}) => values[SIGN_OFF_FIELD]?.auditedBy || values[SIGN_OFF_FIELD]?.auditorBy || {};
const getSubmitterSignOff = (values = {}) => values[SIGN_OFF_FIELD]?.submittedBy || {};
const getSubmissionAuditorSignOff = (submission = {}) => {
  const storedSignOff = getAuditorSignOff(submission.values);
  return {
    name: storedSignOff.name || submission.auditorReviewedBy || "",
    designation: storedSignOff.designation || submission.auditorReviewedByDesignation || "",
    role: storedSignOff.role || submission.auditorReviewedByRole || "",
    email: storedSignOff.email || submission.auditorReviewedByEmail || "",
    date: storedSignOff.date || submission.auditorReviewedOn || "",
  };
};
const isApprovedReport = (submission = {}) => submission.status === "approved";
const isAuditorCorrectionRequested = (submission = {}) =>
  Boolean(
    submission.auditorCorrectionRequested ||
    submission.correctionRequestedForAuditor ||
    submission.requiresAuditorResubmission
  );
const DEFAULT_AUDITOR_CORRECTION_MESSAGE = "Please rectify the auditor observations/recommendations and submit the review again.";
const reviewRemarksForDisplay = (submission = {}) => {
  const remarks = submission.remarks || "";
  const correctionMessage = submission.auditorCorrectionMessage || "";
  if (remarks && (remarks === DEFAULT_AUDITOR_CORRECTION_MESSAGE || remarks === correctionMessage)) return "";
  return remarks;
};
function submittedAuditorAssignmentsForSubmission(submission = {}) {
  return (submission.auditorAssignments || []).filter((assignment) =>
    auditorAssignmentBelongsToSubmission(assignment, submission)
  );
}
function auditorAssignmentsForCorrection(submission = {}) {
  const assignments = submittedAuditorAssignmentsForSubmission(submission);
  const targetType = normalizeUserRole(
    submission.forwardedAuditorType ||
    auditorTypeForReportCategory(submission.reportCategory) ||
    ""
  );
  const matchingTypeAssignments = targetType
    ? assignments.filter((assignment) => normalizeUserRole(assignment.auditorType) === targetType)
    : [];
  return matchingTypeAssignments.length ? matchingTypeAssignments : assignments;
}
const allAuditorAssignmentsSubmitted = (submission = {}) => {
  const assignments = submittedAuditorAssignmentsForSubmission(submission);
  return assignments.length > 0 && assignments.every(auditorAssignmentSubmitted);
};
// A next-cycle submission (e.g. the external cycle spawned when IQAC clicks "Start External
// Cycle") is created from the prior, already-approved cycle via preserveApprovedVersion, and
// can carry that cycle's status/auditorReviewedOn/auditorReviewedBy/submittedOn forward as stale
// leftovers. Until this record has evidence of its own (a real assignment, or an actual sign-off
// recorded in its own values), don't let those inherited fields count as proof that THIS cycle
// was touched — otherwise a freshly started external cycle looks submitted/completed before the
// director has even opened the form.
const isFreshCycleSuccessor = (submission = {}) =>
  Boolean(submission.previousApprovedSubmissionId) &&
  submittedAuditorAssignmentsForSubmission(submission).length === 0 &&
  !Number(submission.auditorProgress?.total || 0);
const isAuditorCompleted = (submission = {}) => {
  if (submission.status === "submitted" || isAuditorCorrectionRequested(submission)) return false;

  const freshSuccessor = isFreshCycleSuccessor(submission);
  const ownSignOffDate = getAuditorSignOff(submission.values).date;

  if (["auditor-completed", "external_auditor_completed", "external-auditor-completed", "approved"].includes(submission.status)) {
    return freshSuccessor ? Boolean(ownSignOffDate) : true;
  }

  if (submission.auditType === "administrative") {
    const progress = submission.auditorProgress || {};
    return Boolean(
      submission.allAssignedAuditorsSubmitted ||
      submission.allAuditorsSubmitted ||
      progress.allSubmitted ||
      allAuditorAssignmentsSubmitted(submission)
    );
  }

  const progress = submission.auditorProgress || {};
  const assignments = submittedAuditorAssignmentsForSubmission(submission);
  const hasAssignmentProgress = assignments.length > 0 || Number(progress.total || 0) > 0;
  if (hasAssignmentProgress) {
    return Boolean(
      submission.allAssignedAuditorsSubmitted ||
      submission.allAuditorsSubmitted ||
      progress.allSubmitted ||
      allAuditorAssignmentsSubmitted(submission)
    );
  }

  return Boolean(
    (!freshSuccessor && (
      submission.allAuditorsSubmitted ||
      progress.allSubmitted ||
      submission.auditorReviewedOn ||
      submission.auditorReviewedBy
    )) ||
    ownSignOffDate
  );
};
const responseList = (payload) => {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.content)) return data.content;
  if (Array.isArray(data?.submissions)) return data.submissions;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};
const submissionPayload = (payload) => payload?.data?.submission || payload?.data || payload;
const userList = (payload) => {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.content)) return data.content;
  if (Array.isArray(data?.users)) return data.users;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};
const valueList = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value == null || value === "") return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [value].filter(Boolean);
};
const safeObjectValue = (value) => {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
};
const booleanOrNull = (value) => {
  if (value === true || value === false) return value;
  if (value == null || value === "") return null;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return null;
};
function normalizeUserRole(value = "") {
  return String(value).trim().toLowerCase().replaceAll("_", "-");
}
const contributorStageStatuses = new Set([
  "pending-contributor-submission",
  "external-contributor-pending",
  "contributor-pending",
  "pending-contribution",
  "external-draft",
]);
const normalizeSchoolGroup = (value = "", school = "", auditType = "academic") => {
  if (auditType !== "academic") return "all";

  const normalized = normalizeUserRole(value).replace(/\s+/g, "-");
  if (normalized.includes("non-engineering") || normalized === "nonengineering") return "nonEngineering";
  if (normalized.includes("engineering")) return "engineering";
  return schoolGroupFor(school) || "all";
};
const normalizeAuditAssignment = (value = "") => String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const uniqueValues = (values) => [...new Set(values.filter(Boolean))];
const AUDITOR_CORRECTION_STORAGE_KEY = "schoolAppraisal.auditorCorrections";
const readStoredAuditorCorrections = () => {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(AUDITOR_CORRECTION_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
};
const writeStoredAuditorCorrections = (value) => {
  try {
    globalThis.localStorage?.setItem(AUDITOR_CORRECTION_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Local correction state is a fallback when the API does not persist per-auditor flags.
  }
};
const auditorCorrectionKeyForSubmission = (submission = {}) => String(submission.id || submission.submissionId || "");
const correctionMatcherForAssignments = (assignments = []) => ({
  keys: uniqueValues(assignments.map((assignment) => assignment.key)),
  ids: uniqueValues(assignments.map((assignment) => String(assignment.auditorId || ""))),
  emails: uniqueValues(assignments.map((assignment) => normalizeAuditAssignment(assignment.auditorEmail || ""))),
});
const storeAuditorCorrections = (submission = {}, assignments = [], message = "", requestedOn = "", allAssignments = []) => {
  const submissionKey = auditorCorrectionKeyForSubmission(submission);
  if (!submissionKey || !assignments.length) return;
  const stored = readStoredAuditorCorrections();
  stored[submissionKey] = {
    ...correctionMatcherForAssignments(assignments),
    message,
    requestedOn,
    assignmentSnapshots: allAssignments.map((assignment) => ({ ...assignment })),
  };
  writeStoredAuditorCorrections(stored);
};
const removeStoredAuditorCorrections = (submission = {}, assignments = [], clearAll = false) => {
  const submissionKey = auditorCorrectionKeyForSubmission(submission);
  if (!submissionKey) return;
  const stored = readStoredAuditorCorrections();
  const current = stored[submissionKey];
  if (!current) return;
  if (clearAll) {
    delete stored[submissionKey];
    writeStoredAuditorCorrections(stored);
    return;
  }
  const completed = correctionMatcherForAssignments(assignments);
  const next = {
    ...current,
    keys: (current.keys || []).filter((key) => !completed.keys.includes(key)),
    ids: (current.ids || []).filter((id) => !completed.ids.includes(id)),
    emails: (current.emails || []).filter((email) => !completed.emails.includes(email)),
  };
  if (!next.keys.length && !next.ids.length && !next.emails.length) delete stored[submissionKey];
  else stored[submissionKey] = next;
  writeStoredAuditorCorrections(stored);
};
const storedAuditorCorrectionFor = (submission = {}) => {
  const submissionKey = auditorCorrectionKeyForSubmission(submission);
  if (!submissionKey) return null;
  return readStoredAuditorCorrections()[submissionKey] || null;
};
const assignmentMatchesStoredCorrection = (assignment = {}, stored = {}) => {
  const email = normalizeAuditAssignment(assignment.auditorEmail || "");
  return Boolean(
    (assignment.key && stored.keys?.includes(assignment.key)) ||
    (assignment.auditorId && stored.ids?.includes(String(assignment.auditorId))) ||
    (email && stored.emails?.includes(email))
  );
};
const storedAssignmentSnapshotFor = (assignment = {}, stored = {}) => {
  const email = normalizeAuditAssignment(assignment.auditorEmail || "");
  return arrayValue(stored.assignmentSnapshots).find((snapshot) =>
    (assignment.key && snapshot.key && assignment.key === snapshot.key) ||
    (assignment.auditorId && snapshot.auditorId && String(assignment.auditorId) === String(snapshot.auditorId)) ||
    (email && normalizeAuditAssignment(snapshot.auditorEmail || "") === email)
  );
};
const correctionTargetMatcherForSubmission = (submission = {}) => {
  const keys = uniqueValues([
    ...valueList(submission.returnedAuditorAssignmentKeys),
    ...valueList(submission.correctionAssignmentKeys),
    ...valueList(submission.assignmentKeys),
  ].map(String));
  const ids = uniqueValues([
    ...valueList(submission.returnedToAuditorIds),
    ...valueList(submission.correctionAuditorIds),
    ...valueList(submission.forwardedToAuditorIds),
    submission.forwardedToAuditorId,
  ].map(String));
  const emails = uniqueValues([
    ...valueList(submission.returnedToAuditorEmails),
    ...valueList(submission.correctionAuditorEmails),
    ...valueList(submission.forwardedToAuditorEmails),
    submission.forwardedToAuditorEmail,
  ].map(normalizeAuditAssignment));
  return {
    keys,
    ids,
    emails,
    hasTargets: Boolean(keys.length || ids.length || emails.length),
  };
};
const assignmentMatchesCorrectionTarget = (assignment = {}, matcher = {}) => {
  const email = normalizeAuditAssignment(assignment.auditorEmail || "");
  if (matcher.keys?.length) return Boolean(assignment.key && matcher.keys.includes(String(assignment.key)));
  return Boolean(
    (assignment.auditorId && matcher.ids?.includes(String(assignment.auditorId))) ||
    (email && matcher.emails?.includes(email))
  );
};
const assignmentHasReviewContent = (assignment = {}) =>
  Boolean(
    assignment.submittedAt ||
    hasAcademicPartEValues(safeObjectValue(assignment.values || assignment.valuesData || assignment.reviewValues || assignment.reviewValuesData)) ||
    arrayValue(assignment.attachments).length
  );
const isAdministrativeContributorStage = (submission = {}) =>
  submission.auditType === "administrative" &&
  contributorStageStatuses.has(normalizeStatus(submission.overallStatus || submission.status));
const canForwardSubmissionToAuditor = (submission = {}) => {
  // A fresh cycle record (e.g. one just spawned for a new academic year) can carry a non-draft
  // status and even forwarding-related fields inherited from the approved cycle it succeeded,
  // before the director has opened this cycle's form at all. Forwarding must never be possible
  // until the submitter has genuinely submitted THIS record — this overrides any backend
  // canForwardToAuditor flag, since that flag isn't aware of this inherited-status case.
  if (normalizeStatus(submission.status) === "draft" || !getSubmitterSignOff(submission.values).date) return false;
  if (submission.canForwardToAuditor !== null && submission.canForwardToAuditor !== undefined) {
    return submission.canForwardToAuditor;
  }
  if (isAdministrativeContributorStage(submission)) return false;
  if (
    submission.auditType === "administrative" &&
    String(submission.reportCategory || "").toLowerCase() === "external" &&
    submission.allContributorsSubmitted === false
  ) {
    return false;
  }
  return true;
};
const schoolAliasesFor = (value = "") => {
  const normalized = normalizeAuditAssignment(value);
  const option = SCHOOL_OPTIONS.find((school) =>
    normalizeAuditAssignment(school.name) === normalized ||
    normalizeAuditAssignment(school.code) === normalized
  );
  return uniqueValues([
    normalized,
    option ? normalizeAuditAssignment(option.name) : "",
    option ? normalizeAuditAssignment(option.code) : "",
  ]);
};
const postAliasesFor = (value = "") => {
  const normalized = normalizeAuditAssignment(value);
  const option = ADMINISTRATIVE_POSTS.find((post) =>
    normalizeAuditAssignment(post.value) === normalized ||
    normalizeAuditAssignment(post.label) === normalized
  );
  return uniqueValues([
    normalized,
    option ? normalizeAuditAssignment(option.value) : "",
    option ? normalizeAuditAssignment(option.label) : "",
  ]);
};
const administrativeStatusKeyForPost = (post = "") => {
  const normalized = normalizeAuditAssignment(post);
  if (normalized === "hr" || normalized.includes("human resource")) return "hr";
  if (normalized.includes("student welfare") || normalized === "dsw" || normalized === "dean student welfare") return "deanStudentWelfare";
  if (normalized.includes("placement") || normalized === "dean placement") return "deanPlacement";
  if (normalized.includes("registrar")) return "registrar";
  return "";
};
const administrativePostsFor = (user = {}) => {
  const rawPosts = [
    user.administrativePosts,
    user.assignedPosts,
    user.posts,
    user.post,
  ].map(valueList).find((posts) => posts.length) || [];
  return uniqueValues(rawPosts.map((value) => {
    const normalized = normalizeAuditAssignment(value);
    const option = ADMINISTRATIVE_POSTS.find((post) =>
      normalizeAuditAssignment(post.value) === normalized ||
      normalizeAuditAssignment(post.label) === normalized
    );
    return option?.value || value;
  }));
};
const assignmentMatches = (left, right, aliasesFor = (value) => uniqueValues([normalizeAuditAssignment(value)])) => {
  const leftAliases = aliasesFor(left);
  const rightAliases = aliasesFor(right);
  return leftAliases.some((leftAlias) =>
    rightAliases.some((rightAlias) => leftAlias === rightAlias || leftAlias.includes(rightAlias) || rightAlias.includes(leftAlias))
  );
};
const administrativeSubmittedPostsFor = (submission = {}) => {
  const progress = safeObjectValue(submission.administrativeProgress || submission.sectionProgress || submission.contributionProgress);
  const status = safeObjectValue(submission.values?.[ADMIN_SUBMISSION_STATUS_FIELD]);
  const submittedKeys = new Set();
  const sectionPostMap = {
    A: "registrar",
    B: "hr",
    C: "registrar",
    D: "dean-student-welfare",
    E: "dean-placement",
  };

  [
    submission.contributorPost,
    submission.contributorPosts,
    submission.administrativePosts,
    submission.assignedPosts,
    submission.posts,
  ].flatMap(valueList).forEach((post) => {
    if (post) submittedKeys.add(post);
  });

  valueList(submission.contributorSections || submission.submittedSections || submission.sectionNumbers).forEach((section) => {
    const post = sectionPostMap[String(section).trim().toUpperCase()];
    if (post) submittedKeys.add(post);
  });

  Object.entries(progress).forEach(([post, state]) => {
    if (["submitted", "approved", "under-review", "auditor-completed"].includes(String(state).toLowerCase())) {
      submittedKeys.add(administrativeStatusKeyForPost(post) || post);
    }
  });

  Object.entries(status).forEach(([key, info]) => {
    const details = safeObjectValue(info);
    if (details.submitted || details.submittedAt) submittedKeys.add(key);
  });

  return uniqueValues([...submittedKeys].map((key) => {
    if (key === "deanStudentWelfare") return "dean-student-welfare";
    if (key === "deanPlacement") return "dean-placement";
    return key;
  }));
};
const arrayValue = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
      if (parsed && typeof parsed === "object") return [parsed];
    } catch {
      return [];
    }
  }
  if (typeof value === "object") return [value];
  return [];
};
const academicSchoolValueFor = (value) => {
  if (!value) return "";
  if (typeof value === "object") {
    return value.code || value.schoolCode || value.school || value.schoolName || value.name || "";
  }
  return value;
};
const schoolLabelFor = (value = "") => {
  const code = canonicalSchoolCode(value) || String(value || "").trim().toUpperCase();
  const school = SCHOOL_OPTIONS.find((option) => option.code.toUpperCase() === code);
  return school ? `${school.name} (${school.code})` : code;
};
const academicSchoolsFor = (user = {}) => {
  const storedSchools = getStoredAcademicAuditorSchools(user);
  const rawSchools = [
    user.schools,
    user.assignedSchools,
    user.academicSchools,
    user.schoolCodes,
    user.schoolIds,
    user.school,
    user.schoolName,
    user.assignment,
  ].flatMap((value) => normalizeAcademicSchoolCodes(value).length ? normalizeAcademicSchoolCodes(value) : valueList(value));
  const apiSchools = rawSchools
    .map(academicSchoolValueFor)
    .flatMap((school) => normalizeAcademicSchoolCodes(school))
    .filter(Boolean);
  return uniqueValues([...apiSchools, ...storedSchools]);
};
const canonicalAdministrativePost = (value = "") => {
  const normalized = normalizeAuditAssignment(value);
  if (!normalized) return "";
  const option = ADMINISTRATIVE_POSTS.find((post) =>
    normalizeAuditAssignment(post.value) === normalized ||
    normalizeAuditAssignment(post.label) === normalized
  );
  return option?.value || "";
};
const assignmentSourceList = (source) => {
  if (!source) return [];
  if (Array.isArray(source) || typeof source === "string") return arrayValue(source);
  if (typeof source !== "object") return [];

  const direct = arrayValue(source.assignments || source.auditorAssignments || source.reviews || source.items);
  if (direct.length) return direct;

  return Object.entries(source).flatMap(([group, value]) =>
    arrayValue(value).map((item) => ({
      ...item,
      auditorType: item.auditorType || item.type || group,
    }))
  );
};
const normalizeAuditorAssignment = (assignment = {}, index = 0) => {
  const auditor = safeObjectValue(assignment.auditor || assignment.user || assignment.reviewer);
  const auditorId = String(
    assignment.auditorId ||
    assignment.userId ||
    assignment.id ||
    auditor.id ||
    auditor.userId ||
    "",
  );
  const post = canonicalAdministrativePost(
    assignment.post || assignment.rolePost || assignment.administrativePost || assignment.assignment || "",
  );
  const assignmentSchools = academicSchoolsFor(assignment);
  const school = canonicalSchoolCode(assignment.school || assignment.schoolName || assignment.schoolCode) || assignmentSchools[0] || "";
  const explicitAuditCategory = normalizeOptionalAuditType(
    assignment.auditCategory ||
    assignment.auditType ||
    assignment.category ||
    assignment.forwardedAuditCategory ||
    auditor.auditCategory ||
    auditor.auditType ||
    auditor.category ||
    "",
  );
  const submittedAt = assignment.submittedAt || assignment.reviewedAt || assignment.completedAt || "";
  const status = normalizeStatus(assignment.status || assignment.reviewStatus || (submittedAt ? "submitted" : "pending"));
  return {
    key: assignment.key || assignment.assignmentId || `${auditorId || "auditor"}-${post || "assignment"}-${index}`,
    auditorId,
    auditorName: assignment.auditorName || assignment.name || assignment.fullName || auditor.name || auditor.fullName || "-",
    auditorEmail: assignment.auditorEmail || assignment.email || assignment.username || auditor.email || auditor.username || "",
    auditorType: normalizeUserRole(assignment.auditorType || assignment.type || auditor.auditorType || auditor.auditorCategory || ""),
    auditCategory: explicitAuditCategory || (post ? "administrative" : school ? "academic" : ""),
    post,
    school,
    status,
    submittedAt,
    auditorCorrectionRequested: Boolean(assignment.auditorCorrectionRequested),
    correctionRequestedForAuditor: Boolean(assignment.correctionRequestedForAuditor),
    requiresAuditorResubmission: Boolean(assignment.requiresAuditorResubmission),
    auditorCorrectionMessage: assignment.auditorCorrectionMessage || assignment.correctionRemarks || "",
    auditorCorrectionRequestedOn: assignment.auditorCorrectionRequestedOn || assignment.correctionRequestedOn || "",
    auditorCorrectionRequestedBy: assignment.auditorCorrectionRequestedBy || assignment.correctionRequestedBy || "",
    values: safeObjectValue(assignment.values || assignment.valuesData || assignment.reviewValues || assignment.reviewValuesData),
    attachments: arrayValue(assignment.attachments),
  };
};
const auditorAssignmentSubmitted = (assignment = {}) =>
  !(
    assignment.auditorCorrectionRequested ||
    assignment.correctionRequestedForAuditor ||
    assignment.requiresAuditorResubmission
  ) && (
    ["submitted", "completed", "auditor-completed", "approved"].includes(normalizeStatus(assignment.status)) ||
    Boolean(assignment.submittedAt)
  );
function auditorAssignmentBelongsToSubmission(assignment = {}, submission = {}) {
  const submissionAuditType = normalizeOptionalAuditType(submission.auditType || submission.type);
  if (!submissionAuditType) return true;

  if (submissionAuditType === "administrative") {
    if (assignment.auditCategory === "academic" || !canonicalAdministrativePost(assignment.post)) return false;
    const submissionAuditorType = normalizeUserRole(submission.forwardedAuditorType || "");
    const assignmentAuditorType = normalizeUserRole(assignment.auditorType || "");
    return !submissionAuditorType || !assignmentAuditorType || assignmentAuditorType === submissionAuditorType;
  }

  if (assignment.auditCategory) return assignment.auditCategory === submissionAuditType;

  const assignmentSchools = academicSchoolsFor(assignment).length ? academicSchoolsFor(assignment) : [assignment.school].filter(Boolean);
  return assignmentSchools.some((school) =>
    school && (!submission.school || assignmentMatches(school, submission.school, schoolAliasesFor))
  );
}
const normalizeAuditorAssignments = (submission = {}, values = {}) => {
  const progressSource = submission.auditorProgress;
  const progressHasAssignments = Array.isArray(progressSource) ||
    Array.isArray(progressSource?.assignments) ||
    Array.isArray(progressSource?.auditorAssignments) ||
    Array.isArray(progressSource?.reviews) ||
    Array.isArray(progressSource?.items);
  const source = submission.auditorAssignments ||
    submission.auditorAssignmentStatus ||
    (progressHasAssignments ? progressSource : null) ||
    submission.auditorReviews ||
    values[AUDITOR_ASSIGNMENT_STATUS_FIELD];
  return assignmentSourceList(source)
    .map(normalizeAuditorAssignment)
    .filter((assignment) => auditorAssignmentBelongsToSubmission(assignment, submission));
};
const buildAuditorProgress = (assignments = []) => {
  const total = assignments.length;
  const submitted = assignments.filter(auditorAssignmentSubmitted).length;
  const pending = Math.max(total - submitted, 0);
  const byPost = assignments.reduce((posts, assignment) => {
    const postKey = assignment.post || assignment.school || "general";
    const current = posts[postKey] || { post: postKey, total: 0, submitted: 0, pending: 0 };
    current.total += 1;
    if (auditorAssignmentSubmitted(assignment)) current.submitted += 1;
    current.pending = current.total - current.submitted;
    posts[postKey] = current;
    return posts;
  }, {});
  return { total, submitted, pending, allSubmitted: total > 0 && pending === 0, byPost: Object.values(byPost) };
};
const auditorAssignmentMatchesProfile = (assignment = {}, submission = {}, profile = {}) => {
  const userId = String(profile.id || sessionStorage.getItem("userId") || "");
  const email = normalizeAuditAssignment(profile.email || sessionStorage.getItem("email") || sessionStorage.getItem("username") || "");
  const assignmentAuditorId = String(assignment.auditorId || "");
  const idMatches = userId && String(assignment.auditorId) === userId;
  const emailMatches = email && normalizeAuditAssignment(assignment.auditorEmail) === email;
  if (userId && assignmentAuditorId) return idMatches;
  if (idMatches || emailMatches) return true;
  if ((submission.auditorAssignments || []).length) return false;

  const profileType = normalizeUserRole(profile.auditorType || auditorTypeFromRole(profile.role));
  const assignmentType = normalizeUserRole(assignment.auditorType);
  if (assignmentType && profileType && assignmentType !== profileType) return false;

  if (submission.auditType === "academic") {
    const profileSchools = academicSchoolsFor(profile);
    const assignmentSchools = academicSchoolsFor(assignment).length
      ? academicSchoolsFor(assignment)
      : [assignment.school || submission.school].filter(Boolean);
    return profileSchools.some((profileSchool) =>
      assignmentSchools.some((assignmentSchool) => assignmentMatches(profileSchool, assignmentSchool, schoolAliasesFor))
    );
  }

  const profilePosts = administrativePostsFor(profile);
  return Boolean(
    assignment.post &&
    profilePosts.some((post) => assignmentMatches(post, assignment.post, postAliasesFor))
  );
};
const auditorAssignmentsForCurrentUser = (submission = {}, profile = {}) =>
  (submission.auditorAssignments || []).filter((assignment) =>
    auditorAssignmentMatchesProfile(assignment, submission, profile)
  );
const currentAuditorSubmitted = (submission = {}, profile = {}) => {
  const assignments = auditorAssignmentsForCurrentUser(submission, profile);
  return assignments.length > 0 && assignments.every(auditorAssignmentSubmitted);
};
const currentAuditorCorrectionRequested = (submission = {}, profile = {}) => {
  const assignments = auditorAssignmentsForCurrentUser(submission, profile);
  if (!assignments.length) return isAuditorCorrectionRequested(submission);
  const currentAssignmentHasCorrection = assignments.some((assignment) =>
    assignment.auditorCorrectionRequested ||
    assignment.correctionRequestedForAuditor ||
    assignment.requiresAuditorResubmission
  );
  return currentAssignmentHasCorrection;
};
const auditorPostsForCurrentSubmission = (submission = {}, profile = {}) => {
  const assignedPosts = auditorAssignmentsForCurrentUser(submission, profile).map((assignment) => assignment.post).filter(Boolean);
  if (assignedPosts.length) return uniqueValues(assignedPosts);
  if (submission.auditType === "administrative") {
    const submittedPosts = administrativeSubmittedPostsFor(submission);
    const profilePosts = administrativePostsFor(profile);
    if (submittedPosts.length) {
      return profilePosts.filter((post) =>
        submittedPosts.some((submittedPost) => assignmentMatches(post, submittedPost, postAliasesFor))
      );
    }
    return profilePosts;
  }
  return [];
};
const buildAuditorAssignmentsForForwarding = (submission = {}, auditorType = "", matchingAuditors = []) => {
  if (submission.auditType === "academic") {
    const school = canonicalSchoolCode(submission.school) || submission.school;
    return matchingAuditors.map((auditor, index) => ({
      key: `${auditor.id}-${school || "school"}-${auditorType}-${index}`,
      auditorId: auditor.id,
      auditorName: auditor.name,
      auditorEmail: auditor.email,
      auditorType,
      auditCategory: "academic",
      school,
      post: "",
      status: "pending",
      submittedAt: null,
    }));
  }

  const submittedPosts = administrativeSubmittedPostsFor(submission);
  return matchingAuditors.flatMap((auditor) => {
    const matchedPosts = administrativePostsFor(auditor).filter((auditorPost) =>
      !submittedPosts.length ||
      submittedPosts.some((submittedPost) => assignmentMatches(auditorPost, submittedPost, postAliasesFor))
    );
    return matchedPosts.map((post) => ({
      key: `${auditor.id}-${post}`,
      auditorId: auditor.id,
      auditorName: auditor.name,
      auditorEmail: auditor.email,
      auditorType,
      auditCategory: "administrative",
      post,
      school: "",
      status: "pending",
      submittedAt: null,
    }));
  });
};
const auditCategoryFromRole = (role = "") => role.includes("administrative") ? "administrative" : role.includes("academic") ? "academic" : "";
const auditorTypeFromRole = (role = "") => role.includes("external") ? "external" : role.includes("internal") ? "internal" : "";
const normalizeAuditor = (user = {}, index = 0) => {
  const role = normalizeUserRole(user.role || user.auditorRole);
  const accountType = normalizeUserRole(user.accountType || user.userType || user.type || (role.includes("auditor") ? "auditor" : ""));
  const auditorType = normalizeUserRole(user.auditorType || user.auditorCategory || (
    role.includes("external") ? "external" : role.includes("internal") ? "internal" : ""
  ));
  const category = normalizeUserRole(user.category || user.auditCategory || (
    role.includes("administrative") ? "administrative" : role.includes("academic") || role === "director" ? "academic" : ""
  ));
  const designation = user.designation || user.post || "";
  const administrativePosts = category === "administrative" ? administrativePostsFor(user) : [];

  return {
    ...user,
    id: user.id || user.userId || user.email || `auditor-${index}`,
    name: user.name || user.fullName || "-",
    email: user.email || user.username || "-",
    accountType,
    auditorType,
    category,
    schools: academicSchoolsFor(user),
    school: academicSchoolsFor(user)[0] || user.school || user.schoolName || "",
    administrativePosts,
    assignment: category === "academic"
      ? (academicSchoolsFor(user).length ? academicSchoolsFor(user).join(", ") : (user.school || user.schoolName || ""))
      : administrativePosts.length
        ? administrativePosts.map((post) => ADMINISTRATIVE_POSTS.find((option) => option.value === post)?.label || post).join(", ")
        : (designation || ""),
    designation,
  };
};
const matchesSubmissionAssignment = (auditor, submission) => {
  if (auditor.accountType !== "auditor" || auditor.category !== submission.auditType) return false;
  if (submission.auditType === "academic") {
    return academicSchoolsFor(auditor).some((school) =>
      assignmentMatches(school, submission.school, schoolAliasesFor)
    );
  }

  const auditorPosts = administrativePostsFor(auditor);
  const submittedPosts = administrativeSubmittedPostsFor(submission);
  if (submittedPosts.length) {
    return auditorPosts.some((auditorPost) =>
      submittedPosts.some((submittedPost) => assignmentMatches(auditorPost, submittedPost, postAliasesFor))
    );
  }

  const submissionPost = normalizeAuditAssignment(submission.submittedByDesignation || submission.post || submission.department || submission.school);
  return Boolean(
    submissionPost &&
    auditorPosts.some((post) => assignmentMatches(post, submissionPost, postAliasesFor))
  );
};

const matchesAuditorResponsibility = (submission, profile) => {
  const auditorCategory = normalizeUserRole(profile.category || auditCategoryFromRole(profile.role));
  const auditorType = normalizeUserRole(profile.auditorType || auditorTypeFromRole(profile.role));
  const forwardedCategory = normalizeUserRole(submission.forwardedAuditCategory);
  const forwardedType = normalizeUserRole(submission.forwardedAuditorType);

  if (auditorCategory && auditorCategory !== submission.auditType) return false;
  if (forwardedCategory && auditorCategory && forwardedCategory !== auditorCategory) return false;
  if (forwardedType && auditorType && forwardedType !== auditorType) return false;

  if (submission.auditType === "academic") {
    return academicSchoolsFor(profile).some((school) =>
      assignmentMatches(school, submission.school, schoolAliasesFor)
    );
  }

  const auditorPosts = administrativePostsFor(profile);
  const submittedPosts = administrativeSubmittedPostsFor(submission);
  if (submittedPosts.length) {
    return auditorPosts.some((auditorPost) =>
      submittedPosts.some((submittedPost) => assignmentMatches(auditorPost, submittedPost, postAliasesFor))
    );
  }

  const submissionPost = submission.submittedByDesignation || submission.post || submission.department || submission.school;
  return auditorPosts.some((post) => assignmentMatches(post, submissionPost, postAliasesFor));
};

const matchesAuditorSession = (submission, profile) => {
  const userId = sessionStorage.getItem("userId") || "";
  const email = normalizeAuditAssignment(profile.email || sessionStorage.getItem("email") || sessionStorage.getItem("username") || "");
  const auditorType = normalizeUserRole(profile.auditorType || auditorTypeFromRole(profile.role));
  const explicitAssignments = submission.auditorAssignments || [];
  if (explicitAssignments.length) {
    return auditorAssignmentsForCurrentUser(submission, profile).length > 0;
  }
  const forwardedId = String(submission.forwardedToAuditorId || "");
  const forwardedEmail = normalizeAuditAssignment(submission.forwardedToAuditorEmail || "");
  const forwardedIds = valueList(submission.forwardedToAuditorIds).map(String);
  const forwardedEmails = valueList(submission.forwardedToAuditorEmails).map(normalizeAuditAssignment);
  const directMatch = Boolean(
    (userId && forwardedId && userId === forwardedId) ||
    (email && forwardedEmail && email === forwardedEmail) ||
    (userId && forwardedIds.includes(userId)) ||
    (email && forwardedEmails.includes(email))
  );
  const hasDirectAssignment = Boolean(forwardedId || forwardedEmail || forwardedIds.length || forwardedEmails.length);
  const hasForwardingMetadata = Boolean(
    submission.forwardedAt ||
    submission.forwardedToAuditorName ||
    submission.forwardedAuditorType ||
    submission.forwardedAuditCategory ||
    ["under-review", "auditor-completed", "approved"].includes(submission.status)
  );

  if (hasDirectAssignment) return directMatch;
  if (!hasForwardingMetadata && submission.status === "submitted" && auditorType === "internal") {
    return matchesAuditorResponsibility(submission, profile);
  }
  return hasForwardingMetadata && matchesAuditorResponsibility(submission, profile);
};

const submissionVisibleForRole = (submission, role, profile) => {
  if (role === "iqac") return true;
  if (role === "vice-chancellor") return true;
  if (isAuditorRole(role)) return matchesAuditorSession(submission, profile);
  return false;
};

const normalizeSubmission = (submission = {}) => {
  const auditType = normalizeAuditType(submission.auditType || submission.type);
  const formData = parseSubmissionFormData(submission);
  const signOff = getSubmissionSignOff(submission, formData.values);
  const storedSignOff = formData.values[SIGN_OFF_FIELD] || {};
  const values = { ...formData.values, [SIGN_OFF_FIELD]: { ...storedSignOff, ...signOff } };
  const auditorSignOff = getAuditorSignOff(values);
  const archiveMetadata = values[REPORT_ARCHIVE_FIELD] || {};
  const school = submission.school || submission.schoolName || submission.department || "School";
  const administrativeProgress = safeObjectValue(
    submission.administrativeProgress || submission.sectionProgress || submission.contributionProgress,
  );
  const storedCorrection = storedAuditorCorrectionFor(submission);
  const rawAuditorAssignments = normalizeAuditorAssignments(submission, values);
  const storedCorrectionApplies = Boolean(
    storedCorrection &&
    rawAuditorAssignments.some((assignment) => assignmentMatchesStoredCorrection(assignment, storedCorrection))
  );
  const backendCorrectionHasMetadata = Boolean(
    submission.auditorCorrectionRequestedOn ||
    submission.correctionRequestedOn ||
    submission.auditorCorrectionRequestedBy ||
    submission.correctionRequestedBy ||
    submission.auditorCorrectionMessage ||
    submission.correctionRemarks
  );
  const globalCorrectionRequested = Boolean(
    storedCorrectionApplies ||
    (
      backendCorrectionHasMetadata &&
      (
        submission.auditorCorrectionRequested ||
        submission.correctionRequestedForAuditor ||
        submission.requiresAuditorResubmission
      )
    )
  );
  const assignmentSpecificCorrectionExists = rawAuditorAssignments.some((assignment) =>
    assignment.auditorCorrectionRequested ||
    assignment.correctionRequestedForAuditor ||
    assignment.requiresAuditorResubmission
  );
  const correctionAuditorType = normalizeUserRole(
    submission.forwardedAuditorType ||
    auditorTypeForReportCategory(submission.reportCategory || submission.auditClassification || submission.approvedReportCategory) ||
    ""
  );
  const correctionTargetMatcher = globalCorrectionRequested
    ? correctionTargetMatcherForSubmission(submission)
    : { keys: [], ids: [], emails: [], hasTargets: false };
  const auditorAssignments = rawAuditorAssignments.map((assignment) => {
    const storedCorrectionMatches = storedCorrectionApplies && assignmentMatchesStoredCorrection(assignment, storedCorrection);
    const selectedCorrectionMatches =
      correctionTargetMatcher.hasTargets &&
      assignmentMatchesCorrectionTarget(assignment, correctionTargetMatcher);
    const storedSnapshot = storedCorrectionApplies ? storedAssignmentSnapshotFor(assignment, storedCorrection) : null;
    const restoredNonReturnedAssignment =
      (
        storedCorrectionApplies &&
        !storedCorrectionMatches &&
        (storedSnapshot || assignmentHasReviewContent(assignment))
      ) ||
      (
        correctionTargetMatcher.hasTargets &&
        !selectedCorrectionMatches &&
        globalCorrectionRequested
      );
    const assignmentBase = restoredNonReturnedAssignment
      ? {
          ...assignment,
          ...(storedSnapshot || {}),
          status: "submitted",
          reviewStatus: "submitted",
          submittedAt: storedSnapshot?.submittedAt || assignment.submittedAt,
          auditorCorrectionRequested: false,
          correctionRequestedForAuditor: false,
          requiresAuditorResubmission: false,
        }
      : assignment;
    const globalCorrectionMatches =
      !storedCorrectionApplies &&
      globalCorrectionRequested &&
      (
        selectedCorrectionMatches ||
        (!correctionTargetMatcher.hasTargets && !assignmentSpecificCorrectionExists)
      ) &&
      (!correctionAuditorType || normalizeUserRole(assignment.auditorType) === correctionAuditorType);

    return storedCorrectionMatches || globalCorrectionMatches
      ? {
          ...assignmentBase,
          status: "pending",
          reviewStatus: "pending",
          auditorCorrectionRequested: true,
          correctionRequestedForAuditor: true,
          requiresAuditorResubmission: true,
        }
      : assignmentBase;
  });
  const backendAuditorProgress = safeObjectValue(submission.auditorProgress);
  // The backend's own auditorAssignments feed intentionally merges the current submission's
  // assignments with its parent/root cycle's (so peer-review "reference" panels can show a prior
  // cycle's completed review as context). backendAuditorProgress.total/submitted, however, is
  // computed backend-side scoped to THIS submission's own assignment rows only. Recomputing
  // progress by counting every entry in the merged array (as buildAuditorProgress does) double
  // counts a prior cycle's already-completed review as if it belonged to this fresh cycle — e.g.
  // a brand-new external cycle showing "1/2 reviews submitted" from an internal auditor who only
  // ever reviewed the OLD cycle it was spawned from. Prefer the backend's pre-scoped total
  // whenever it's present; only fall back to recomputing from the merged list when the backend
  // hasn't provided one at all.
  const computedAuditorProgress = buildAuditorProgress(auditorAssignments);
  // Check for the key's presence, not a truthy value — the backend legitimately reports an
  // all-zero progress object (no live assignments on this submission yet), which must NOT fall
  // through to recomputing from the merged (possibly ancestor-polluted) list.
  const hasBackendAuditorProgress = Object.keys(backendAuditorProgress).length > 0;
  const auditorProgress = hasBackendAuditorProgress
    ? {
        total: Number(backendAuditorProgress.total || backendAuditorProgress.required || 0),
        submitted: Number(backendAuditorProgress.submitted || backendAuditorProgress.completed || 0),
        pending: Number(backendAuditorProgress.pending || 0),
        allSubmitted: Boolean(backendAuditorProgress.allSubmitted || backendAuditorProgress.allAuditorsSubmitted),
        byPost: arrayValue(backendAuditorProgress.byPost || backendAuditorProgress.posts),
      }
    : computedAuditorProgress;
  if (auditorProgress.total && !auditorProgress.pending) {
    auditorProgress.pending = Math.max(auditorProgress.total - auditorProgress.submitted, 0);
  }
  if (auditorProgress.total) auditorProgress.allSubmitted = auditorProgress.pending === 0;
  const permissions = safeObjectValue(submission.permissions);
  const status = normalizeStatus(submission.status);
  const overallStatus = normalizeStatus(submission.overallStatus || submission.workflowStatus || status);

  return {
    ...submission,
    ...formData,
    values,
    id: submission.id || submission.submissionId,
    auditType,
    group: normalizeSchoolGroup(submission.group || submission.schoolGroup, school, auditType),
    school,
    administrativeProgress,
    auditorAssignments,
    auditorProgress,
    submittedBy: signOff.submittedBy.name || submission.userName || "-",
    submittedByDesignation: signOff.submittedBy.designation || (auditType === "academic" ? "Director" : ""),
    submittedOn: signOff.submittedBy.date || new Date().toISOString(),
    reviewedBy: signOff.approvedBy.name,
    reviewedByDesignation: signOff.approvedBy.designation,
    reviewedByRole: signOff.approvedBy.role,
    reviewedOn: signOff.approvedBy.date,
    forwardedToAuditorId: submission.forwardedToAuditorId || submission.auditorId || "",
    forwardedToAuditorName: submission.forwardedToAuditorName || submission.auditorName || "",
    forwardedToAuditorEmail: submission.forwardedToAuditorEmail || submission.auditorEmail || "",
    forwardedToAuditorIds: valueList(submission.forwardedToAuditorIds || submission.auditorIds),
    forwardedToAuditorNames: valueList(submission.forwardedToAuditorNames || submission.auditorNames),
    forwardedToAuditorEmails: valueList(submission.forwardedToAuditorEmails || submission.auditorEmails),
    forwardedAuditorType: normalizeUserRole(submission.forwardedAuditorType || submission.auditorType || ""),
    forwardedAuditCategory: normalizeUserRole(submission.forwardedAuditCategory || submission.auditCategory || ""),
    forwardedAt: submission.forwardedAt || "",
    auditorCorrectionRequested: globalCorrectionRequested,
    auditorCorrectionMessage: storedCorrectionApplies ? storedCorrection?.message || "" : submission.auditorCorrectionMessage || submission.correctionRemarks || "",
    auditorCorrectionRequestedOn: storedCorrectionApplies ? storedCorrection?.requestedOn || "" : submission.auditorCorrectionRequestedOn || submission.correctionRequestedOn || "",
    auditorCorrectionRequestedBy: submission.auditorCorrectionRequestedBy || submission.correctionRequestedBy || "",
    overallStatus,
    contributionStatus: normalizeStatus(submission.contributionStatus || submission.myContributionStatus || submission.userContributionStatus || ""),
    canForwardToAuditor: booleanOrNull(submission.canForwardToAuditor ?? permissions.canForwardToAuditor),
    allContributorsSubmitted: booleanOrNull(
      submission.allContributorsSubmitted ??
      submission.allAdministrativeContributorsSubmitted ??
      permissions.allContributorsSubmitted
    ),
    allAuditorsSubmitted: auditorAssignments.length
      ? auditorProgress.allSubmitted
      : booleanOrNull(
          submission.allAuditorsSubmitted ??
          submission.allAssignedAuditorsSubmitted ??
          permissions.allAuditorsSubmitted
        ) ?? (auditorProgress.total ? auditorProgress.allSubmitted : null),
    auditorReviewedBy: auditorSignOff.name || submission.auditorReviewedBy || submission.auditedBy || "",
    auditorReviewedByDesignation: auditorSignOff.designation || submission.auditorReviewedByDesignation || submission.auditorDesignation || "",
    auditorReviewedByRole: auditorSignOff.role || submission.auditorReviewedByRole || submission.auditorRole || "",
    auditorReviewedByEmail: auditorSignOff.email || submission.auditorReviewedByEmail || submission.auditorEmail || "",
    auditorReviewedOn: auditorSignOff.date || submission.auditorReviewedOn || submission.auditedOn || "",
    reportCategory: normalizeUserRole(
      submission.reportCategory ||
      submission.auditClassification ||
      submission.approvedReportCategory ||
      archiveMetadata.category ||
      submission.forwardedAuditorType ||
      submission.auditorType ||
      "",
    ),
    auditCycle: submission.auditCycle || submission.cycleLabel || submission.auditPeriod || submission.academicYear || archiveMetadata.auditCycle || "2025-26",
    version: Number(submission.version || submission.reportVersion || submission.cycleVersion || archiveMetadata.version || 1),
    rootSubmissionId: submission.rootSubmissionId || submission.auditRootId || submission.id || submission.submissionId,
    parentSubmissionId: submission.parentSubmissionId || submission.previousSubmissionId || null,
    previousApprovedSubmissionId: submission.previousApprovedSubmissionId || submission.sourceApprovedSubmissionId || null,
    hasNextCycle: Boolean(submission.hasNextCycle || submission.nextCycleStarted || submission.nextVersionId),
    sections: (Array.isArray(submission.sections) && submission.sections.length && typeof submission.sections[0] === "object") ? submission.sections : sectionsForAudit(auditType),
    attachments: formData.attachments.length ? formData.attachments : submission.attachments || [],
    status,
    remarks: submission.remarks || "",
  };
};

const normalizeHistoryEntry = (entry = {}, index = 0) => {
  const snapshot = entry.submission || entry.snapshot || entry.data || entry;
  const normalized = normalizeSubmission(snapshot);
  return {
    ...normalized,
    id: normalized.id || entry.id || `history-${index}`,
    version: Number(entry.version || entry.snapshotVersion || normalized.version || index + 1),
    auditCycle: entry.auditCycle || entry.cycleLabel || normalized.auditCycle,
    reportCategory: normalizeUserRole(entry.reportCategory || normalized.reportCategory),
    approvedOn: entry.approvedOn || entry.createdAt || normalized.reviewedOn || "",
  };
};

export default function ReviewDashboard({ dashboardKind = "review" }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = String(sessionStorage.getItem("role") || "iqac").toLowerCase().replaceAll("_", "-");
  const isAuditor = dashboardKind === "auditor" || isAuditorRole(role);
  const isIqacDashboard = role === "iqac" && !isAuditor;
  const initialAuditorCategory = sessionStorage.getItem("category") || auditCategoryFromRole(role) || "academic";
  const defaultActiveView = isAuditor ? initialAuditorCategory : "overview";
  const routeActiveView = routeViewFor(searchParams.get("view"), defaultActiveView);
  const routeSubmissionId = searchParams.get("submission") || "";
  const activeView = routeActiveView;
  const [activeGroup, setActiveGroup] = useState({ academic: "all", administrative: "all" });
  const [submissions, setSubmissions] = useState({ academic: [], administrative: [] });
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);
  const [loadingSubmissionId, setLoadingSubmissionId] = useState("");
  const [reviewingStatus, setReviewingStatus] = useState("");
  const [error, setError] = useState("");
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileOverrides, setProfileOverrides] = useState({});
  const [auditors, setAuditors] = useState([]);
  const [loadingAuditors, setLoadingAuditors] = useState(false);
  const [directoryUsers, setDirectoryUsers] = useState([]);
  const [forwardTarget, setForwardTarget] = useState(null);
  const [forwardAuditorType, setForwardAuditorType] = useState("");
  const [forwardingId, setForwardingId] = useState("");
  const [approvalTarget, setApprovalTarget] = useState(null);
  const [approvalCategory, setApprovalCategory] = useState("");
  const [correctionTarget, setCorrectionTarget] = useState(null);
  const [correctionMessage, setCorrectionMessage] = useState("");
  const [correctionAssignmentKeys, setCorrectionAssignmentKeys] = useState([]);
  const [startingNextCycleId, setStartingNextCycleId] = useState("");
  const [downloadingAttachmentsId, setDownloadingAttachmentsId] = useState("");
  const [academicYear, setAcademicYear] = useState(
    normalizeAcademicYear(sessionStorage.getItem("academicYear") || "2025-2026"),
  );
  const [activeAcademicYear, setActiveAcademicYear] = useState("");
  const [availableYears, setAvailableYears] = useState(["2025-26", "2026-27"]);
  const [refreshKey, setRefreshKey] = useState(0);

  const setDashboardRouteState = useCallback((viewId, { submissionId = "", replace = false } = {}) => {
    const nextParams = new URLSearchParams(searchParams);
    if (viewId && viewId !== defaultActiveView) {
      nextParams.set("view", viewId);
    } else {
      nextParams.delete("view");
    }

    if (submissionId) {
      nextParams.set("submission", String(submissionId));
    } else {
      nextParams.delete("submission");
    }

    setSearchParams(nextParams, { replace });
  }, [defaultActiveView, searchParams, setSearchParams]);

  useEffect(() => {
    let isActive = true;
    const loadAuditCycles = async () => {
      try {
        const { data } = await fetchCurrentAuditCycle();
        if (!isActive) return;
        const activeLabel = data.activeYear || "2025-2026";
        setActiveAcademicYear(compactAcademicYear(activeLabel));
        const rawYears = data.availableYears || [activeLabel];
        const formattedYears = Array.from(new Set(rawYears.map(compactAcademicYear))).sort();
        setAvailableYears(formattedYears);

        const stored = sessionStorage.getItem("academicYear");
        const selected = isIqacDashboard || !stored ? compactAcademicYear(activeLabel) : compactAcademicYear(stored);
        setAcademicYear(normalizeAcademicYear(selected));
        sessionStorage.setItem("academicYear", selected);
      } catch {
        // Fallback
      }
    };
    loadAuditCycles();
    return () => {
      isActive = false;
    };
  }, [isIqacDashboard, refreshKey]);

  const [showNextYearModal, setShowNextYearModal] = useState(false);
  const [startingAcademicYear, setStartingAcademicYear] = useState(false);
  const [auditorProfile, setAuditorProfile] = useState(null);
  const [accountProfile, setAccountProfile] = useState(null);
  const canManageUsers = role === "iqac";
  const roleConfig = isAuditor ? REVIEW_ROLE_CONFIG.auditor : REVIEW_ROLE_CONFIG[role] || REVIEW_ROLE_CONFIG.iqac;
  const sessionProfile = useMemo(() => ({
    id: sessionStorage.getItem("userId") || "",
    name: sessionStorage.getItem("name") || roleConfig.roleTitle,
    designation: sessionStorage.getItem("designation") || roleConfig.roleTitle,
    school: sessionStorage.getItem("school") || (isAuditor ? "" : "D Y Patil International University"),
    post: sessionStorage.getItem("post") || "",
    administrativePosts: valueList(sessionStorage.getItem("administrativePosts")),
    category: sessionStorage.getItem("category") || auditCategoryFromRole(role),
    auditorType: sessionStorage.getItem("auditorType") || auditorTypeFromRole(role),
    auditorRole: sessionStorage.getItem("auditorRole") || role,
    email: sessionStorage.getItem("email") || sessionStorage.getItem("username") || "",
    role,
  }), [isAuditor, role, roleConfig.roleTitle]);
  const profile = useMemo(() => ({
    ...sessionProfile,
    ...(auditorProfile || {}),
    ...(accountProfile || {}),
    role,
    auditorRole: auditorProfile?.auditorRole || sessionProfile.auditorRole,
    ...profileOverrides,
  }), [auditorProfile, accountProfile, role, sessionProfile, profileOverrides]);

  const allSubmissions = useMemo(() => [...submissions.academic, ...submissions.administrative], [submissions]);
  const metrics = useMemo(() => buildMetrics(allSubmissions), [allSubmissions]);

  useEffect(() => {
    let isActive = true;
    fetchUsers()
      .then(({ data }) => {
        if (isActive) setDirectoryUsers(userList(data).map(normalizeAuditor));
      })
      .catch(() => {
        if (isActive) setDirectoryUsers([]);
      });
    return () => {
      isActive = false;
    };
  }, []);

  const directorsBySchoolForAvatars = useMemo(
    () => mapUsersBySchool(usersForCategory(directoryUsers, "academic")),
    [directoryUsers]
  );
  const adminUsersByPostForAvatars = useMemo(
    () => mapUsersByPost(usersForCategory(directoryUsers, "administrative")),
    [directoryUsers]
  );
  const resolveSubmitterAvatar = (submission) => {
    if (!submission) return "";
    if (submission.auditType === "administrative") {
      const postCode = canonicalAdministrativePost(submission.post || submission.department || submission.school);
      return getAttachmentUrl(adminUsersByPostForAvatars[postCode]?.avatarUrl || "");
    }

    const code = canonicalSchoolCode(submission.school) || String(submission.school || "").trim().toUpperCase();
    return getAttachmentUrl(directorsBySchoolForAvatars[code]?.avatarUrl || "");
  };
  const navigationItems = useMemo(() => {
    if (isAuditor) {
      const auditItems = REVIEW_NAV_ITEMS.filter((item) => {
        if (!["academic", "administrative"].includes(item.id)) return false;
        return !profile.category || item.id === profile.category;
      });
      return auditItems;
    }

    if (isIqacDashboard) {
      return REVIEW_NAV_ITEMS.filter((item) => item.id !== "advanced-overview");
    }

    return REVIEW_NAV_ITEMS;
  }, [isAuditor, isIqacDashboard, profile.category]);
  const pinnedNavigationItems = useMemo(() => {
    if (isAuditor || !canManageUsers) return [];
    return [USER_MANAGEMENT_NAV_ITEM];
  }, [canManageUsers, isAuditor]);
  const standaloneNavigationItems = useMemo(() => {
    if (isAuditor) return [];
    const items = [];
    if (["iqac", "vice-chancellor"].includes(role)) {
      items.push(AUDITOR_FINAL_REVIEW_NAV_ITEM, PREVIOUS_REPORTS_NAV_ITEM, START_NEXT_YEAR_NAV_ITEM);
    }
    if (role === "iqac") {
      items.push(BACKUP_RESTORE_NAV_ITEM);
    }
    return items;
  }, [isAuditor, role]);
  const visibleActiveView = !canManageUsers && activeView === "user-management" ? "overview" : activeView;
  const auditorReviewedSubmissions = useMemo(
    () => allSubmissions.filter((submission) => isAuditorCompleted(submission) && !isApprovedReport(submission)),
    [allSubmissions],
  );
  const previousReports = useMemo(
    () => allSubmissions.filter(isApprovedReport).map((report) => {
      const reportId = String(report.id);
      const reportRootId = String(report.rootSubmissionId || report.id || "");
      const reportCategory = String(report.reportCategory || "").toLowerCase();
      const reportOwner = report.auditType === "academic"
        ? report.school
        : report.submittedByDesignation || report.school;
      const hasSuccessor = allSubmissions.some((submission) => {
        if (submission.id === report.id || submission.auditType !== report.auditType) return false;

        const submissionCategory = String(submission.reportCategory || "").toLowerCase();
        const isExternalSuccessor = reportCategory !== "internal" || submissionCategory === "external";
        const hasDirectLink =
          String(submission.parentSubmissionId || "") === reportId ||
          String(submission.previousApprovedSubmissionId || "") === reportId;
        const hasSameRootNextVersion =
          Boolean(reportRootId) &&
          String(submission.rootSubmissionId || "") === reportRootId &&
          Number(submission.version || 1) > Number(report.version || 1);
        const submissionOwner = submission.auditType === "academic"
          ? submission.school
          : submission.submittedByDesignation || submission.school;
        const hasSameOwnerExternalCycle =
          reportCategory === "internal" &&
          submissionCategory === "external" &&
          (
            report.auditType === "administrative" ||
            assignmentMatches(reportOwner, submissionOwner, schoolAliasesFor)
          ) &&
          compactAcademicYear(submission.auditCycle || "") === compactAcademicYear(report.auditCycle || "") &&
          Number(submission.version || 1) >= Number(report.version || 1);

        return isExternalSuccessor && (hasDirectLink || hasSameRootNextVersion || hasSameOwnerExternalCycle);
      });
      return { ...report, hasNextCycle: Boolean(report.hasNextCycle || hasSuccessor) };
    }),
    [allSubmissions],
  );
  const intakeSubmissions = useMemo(() => ({
    academic: isAuditor ? submissions.academic : submissions.academic.filter((submission) => !isAuditorCompleted(submission)),
    administrative: isAuditor ? submissions.administrative : submissions.administrative.filter((submission) => !isAuditorCompleted(submission)),
  }), [isAuditor, submissions]);

  useEffect(() => {
    if (!isAuditor) return undefined;

    let isActive = true;
    const loadAuditorProfile = async () => {
      try {
        const { data } = await fetchUsers();
        const sessionId = String(sessionProfile.id || "");
        const sessionEmail = normalizeAuditAssignment(sessionProfile.email || "");
        const matchedUser = userList(data)
          .map(normalizeAuditor)
          .find((user) =>
            (sessionId && String(user.id) === sessionId) ||
            (sessionEmail && normalizeAuditAssignment(user.email) === sessionEmail)
          );

        if (isActive && matchedUser) {
          setAuditorProfile({
            ...matchedUser,
            role,
            auditorRole: matchedUser.role || sessionProfile.auditorRole,
          });
        }
      } catch {
        if (isActive) setAuditorProfile(null);
      }
    };

    loadAuditorProfile();

    return () => {
      isActive = false;
    };
  }, [isAuditor, role, sessionProfile.auditorRole, sessionProfile.email, sessionProfile.id]);

  // sessionStorage never carries the avatar, and profileOverrides is only populated for the
  // rest of this session after a save in UserProfileModal — so without this, the sidebar
  // avatar reverts to initials on every reload/re-login even though the picture was saved.
  useEffect(() => {
    let isActive = true;
    fetchCurrentUser()
      .then(({ data }) => {
        if (!isActive) return;
        const remote = data?.data || data || {};
        if (remote.avatarUrl) setAccountProfile((prev) => ({ ...prev, avatarUrl: remote.avatarUrl }));
      })
      .catch(() => {});
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadSubmissions = async () => {
      setLoadingSubmissions(true);
      setError("");

      try {
        const { data } = await fetchAllSubmissions();
        const next = { academic: [], administrative: [] };
        responseList(data).map(normalizeSubmission).forEach((submission) => {
          if (submissionVisibleForRole(submission, role, profile)) {
            next[submission.auditType].push(submission);
          }
        });

        if (isActive) setSubmissions(next);
      } catch (loadError) {
        if (isActive) setError(getApiErrorMessage(loadError, "Could not load submissions for review."));
      } finally {
        if (isActive) setLoadingSubmissions(false);
      }
    };

    loadSubmissions();

    return () => {
      isActive = false;
    };
  }, [profile, refreshKey, role]);

  const updateSubmission = (auditType, submissionId, patch) => {
    setSubmissions((current) => {
      const next = {
        ...current,
        [auditType]: current[auditType].map((submission) =>
          submission.id === submissionId ? { ...submission, ...patch } : submission
        ),
      };
      return next;
    });

    setSelectedSubmission((current) =>
      current?.id === submissionId ? { ...current, ...patch } : current
    );
  };

  const openSubmission = useCallback(async (submission, { syncUrl = true } = {}) => {
    if (syncUrl) {
      setDashboardRouteState(submission.auditType, { submissionId: submission.id });
    }

    setLoadingSubmissionId(submission.id);
    setError("");

    try {
      const [detailResult, historyResult] = await Promise.allSettled([
        fetchSubmissionById(submission.id),
        fetchSubmissionSnapshots(submission.id),
      ]);
      if (detailResult.status === "rejected") throw detailResult.reason;
      const detailData = detailResult.value.data;
      const historyPayload = historyResult.status === "fulfilled" ? historyResult.value.data : [];
      const embeddedHistory = submissionPayload(detailData)?.versionHistory || submissionPayload(detailData)?.previousVersions || [];
      const historyEntries = [
        ...responseList(historyPayload),
        ...(Array.isArray(embeddedHistory) ? embeddedHistory : []),
      ].map(normalizeHistoryEntry);
      const detailedSubmission = normalizeSubmission({
        ...submission,
        ...submissionPayload(detailData),
        versionHistory: historyEntries,
      });
      if (!submissionVisibleForRole(detailedSubmission, role, profile)) {
        setError("This submission is no longer available for your role.");
        return;
      }
      setSelectedSubmission(detailedSubmission);
    } catch (openError) {
      setError(getApiErrorMessage(openError, "Could not load submission details."));
    } finally {
      setLoadingSubmissionId("");
    }
  }, [profile, role, setDashboardRouteState]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!routeSubmissionId) {
        setSelectedSubmission((current) => (current ? null : current));
        return;
      }
      if (loadingSubmissions) return;
      if (selectedSubmission && String(selectedSubmission.id) === routeSubmissionId) return;

      const matchingSubmission = allSubmissions.find((submission) => String(submission.id) === routeSubmissionId);
      if (matchingSubmission) {
        openSubmission(matchingSubmission, { syncUrl: false });
      } else {
        setSelectedSubmission(null);
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [allSubmissions, loadingSubmissions, openSubmission, routeSubmissionId, selectedSubmission]);

  const approveSubmission = async (submission, reportCategory) => {
    setReviewingStatus("approved");
    setError("");

    try {
      const reviewedOn = new Date().toISOString();
      const visibleAuditorAssignments = submittedAuditorAssignmentsForSubmission(submission);
      const visibleAuditorProgress = buildAuditorProgress(visibleAuditorAssignments);
      const shouldReconcileAuditorCompletion =
        submission.status === "under-review" &&
        visibleAuditorProgress.total > 0 &&
        visibleAuditorProgress.allSubmitted;
      if (shouldReconcileAuditorCompletion) {
        await updateSubmissionById(submission.id, {
          status: backendStatusFor("auditor-completed"),
          submissionStatus: backendStatusFor("auditor-completed"),
          overallStatus: backendStatusFor("auditor-completed"),
          workflowStatus: backendStatusFor("auditor-completed"),
          auditorAssignments: submission.auditorAssignments || [],
          auditorProgress: visibleAuditorProgress,
          allAuditorsSubmitted: true,
          allAssignedAuditorsSubmitted: true,
          auditorReviewedOn: submission.auditorReviewedOn || reviewedOn,
          auditorReviewedBy: submission.auditorReviewedBy || visibleAuditorAssignments.map((assignment) => assignment.auditorName).filter(Boolean).join(", "),
        });
      }
      const reviewer = { ...profile, role };
      const approvedVersion = reportVersionForCategory(reportCategory, submission.version);
      const baseSignedValues = withApproverSignOff(submission.values, reviewer, reviewedOn);
      const signedValues = {
        ...baseSignedValues,
        [REPORT_ARCHIVE_FIELD]: {
          category: reportCategory,
          auditCycle: submission.auditCycle,
          version: approvedVersion,
          approvedOn: reviewedOn,
        },
      };
      const { valuesData, tablesData, attachments } = buildSubmissionPayload({
        auditType: submission.auditType,
        values: signedValues,
        tables: submission.tables,
        attachments: submission.attachments,
      });

      await reviewSubmission(submission.id, {
        status: backendStatusFor("approved"),
        remarks: submission.remarks,
        reportCategory: reportCategory.toUpperCase(),
        auditClassification: reportCategory.toUpperCase(),
        approvedReportCategory: reportCategory.toUpperCase(),
        category: reportCategory.toUpperCase(),
        auditorType: reportCategory.toUpperCase(),
        forwardedAuditorType: reportCategory.toUpperCase(),
        cycleType: reportCategory.toUpperCase(),
        auditCycleType: reportCategory.toUpperCase(),
        auditCycle: submission.auditCycle,
        version: approvedVersion,
        reportVersion: approvedVersion,
        cycleVersion: approvedVersion,
        valuesData,
        tablesData,
        attachments,
      });

      updateSubmission(submission.auditType, submission.id, {
        status: "approved",
        values: signedValues,
        reviewedBy: profile.name,
        reviewedByDesignation: profile.designation,
        reviewedByRole: role,
        reviewedOn,
        reportCategory,
        auditClassification: reportCategory,
        approvedReportCategory: reportCategory,
        auditorType: reportCategory,
        forwardedAuditorType: reportCategory,
        cycleType: reportCategory,
        auditCycleType: reportCategory,
        version: approvedVersion,
      });

      setApprovalTarget(null);
      setApprovalCategory("");
      setSelectedSubmission(null);
      setDashboardRouteState("previous-reports");
    } catch (reviewError) {
      setError(getApiErrorMessage(reviewError, "Could not update review status."));
    } finally {
      setReviewingStatus("");
    }
  };

  const openApprovalModal = (submission) => {
    const submittedAuditorTypes = uniqueValues(
      (submission.auditorAssignments || [])
        .filter(auditorAssignmentSubmitted)
        .map((assignment) => normalizeUserRole(assignment.auditorType))
        .filter((type) => ["internal", "external"].includes(type))
    );
    const inferredAuditorType = submittedAuditorTypes.length === 1 ? submittedAuditorTypes[0] : "";
    setApprovalTarget(submission);
    setApprovalCategory(
      inferredAuditorType ||
      (["internal", "external"].includes(submission.forwardedAuditorType)
        ? submission.forwardedAuditorType
        : ""),
    );
  };

  const openCorrectionModal = (submission) => {
    if (!submission?.id) return;
    setCorrectionTarget(submission);
    setCorrectionMessage(
      submission.auditorCorrectionMessage ||
      "Please rectify the auditor observations/recommendations and submit the review again."
    );
    setCorrectionAssignmentKeys([]);
  };

  const closeCorrectionModal = () => {
    if (reviewingStatus === "auditor-correction") return;
    setCorrectionTarget(null);
    setCorrectionMessage("");
    setCorrectionAssignmentKeys([]);
  };

  const returnToAuditorForCorrection = async () => {
    const submission = correctionTarget;
    if (!submission?.id) return;

    const trimmedMessage = correctionMessage.trim() ||
      "Please rectify the auditor observations/recommendations and submit the review again.";

    setReviewingStatus("auditor-correction");
    setError("");

    try {
      const requestedOn = new Date().toISOString();
      const correctionAuditorType =
        submission.forwardedAuditorType ||
        auditorTypeForReportCategory(submission.reportCategory) ||
        "internal";
      const selectableCorrectionAssignments = auditorAssignmentsForCorrection(submission);
      const selectedCorrectionKeySet = new Set(correctionAssignmentKeys.map(String));
      const correctionAssignments = selectableCorrectionAssignments.filter((assignment) =>
        selectedCorrectionKeySet.has(String(assignment.key))
      );
      if (!correctionAssignments.length) {
        setError("Select at least one auditor to return this review for correction.");
        setReviewingStatus("");
        return;
      }
      const assignmentAuditorIds = correctionAssignments
        .map((assignment) => Number(assignment.auditorId))
        .filter((id) => Number.isSafeInteger(id) && id > 0);
      const assignmentAuditorNames = correctionAssignments.map((assignment) => assignment.auditorName).filter(Boolean);
      const assignmentAuditorEmails = correctionAssignments.map((assignment) => assignment.auditorEmail).filter(Boolean);
      const selectedAssignmentKeys = correctionAssignments.map((assignment) => assignment.key).filter(Boolean);
      const forwardedToAuditorIds = uniqueValues(assignmentAuditorIds);
      const forwardedToAuditorNames = uniqueValues(assignmentAuditorNames);
      const forwardedToAuditorEmails = uniqueValues(assignmentAuditorEmails);
      const returnedAssignmentKeySet = new Set(correctionAssignments.map((assignment) => assignment.key).filter(Boolean));
      const correctionAssignmentIds = new Set(correctionAssignments.map((assignment) => String(assignment.auditorId || "")).filter(Boolean));
      const correctionAssignmentEmails = new Set(
        correctionAssignments
          .map((assignment) => normalizeAuditAssignment(assignment.auditorEmail || ""))
          .filter(Boolean)
      );
      const returnedAuditorAssignments = (submission.auditorAssignments || []).map((assignment) => {
        const assignmentEmail = normalizeAuditAssignment(assignment.auditorEmail || "");
        const isCorrectionTarget = returnedAssignmentKeySet.size
          ? Boolean(assignment.key && returnedAssignmentKeySet.has(assignment.key))
          : Boolean(
              (assignment.auditorId && correctionAssignmentIds.has(String(assignment.auditorId))) ||
              (assignmentEmail && correctionAssignmentEmails.has(assignmentEmail))
            );
        return isCorrectionTarget
          ? {
              ...assignment,
              status: "pending",
              reviewStatus: "pending",
              auditorCorrectionRequested: true,
              correctionRequestedForAuditor: true,
              requiresAuditorResubmission: true,
            }
          : assignment;
      });
      const returnedAuditorProgress = returnedAuditorAssignments.length
        ? buildAuditorProgress(returnedAuditorAssignments)
        : submission.auditorProgress;
      storeAuditorCorrections(submission, correctionAssignments, trimmedMessage, requestedOn, returnedAuditorAssignments);
      const payload = {
        status: backendStatusFor("under-review"),
        remarks: "",
        forwardedToAuditorId: forwardedToAuditorIds[0] || submission.forwardedToAuditorId || "",
        forwardedToAuditorName: forwardedToAuditorNames[0] || submission.forwardedToAuditorName || "",
        forwardedToAuditorEmail: forwardedToAuditorEmails[0] || submission.forwardedToAuditorEmail || "",
        forwardedToAuditorIds,
        forwardedToAuditorNames,
        forwardedToAuditorEmails,
        assignmentKeys: selectedAssignmentKeys,
        auditorAssignmentKeys: selectedAssignmentKeys,
        correctionAssignmentKeys: selectedAssignmentKeys,
        returnedAuditorAssignmentKeys: selectedAssignmentKeys,
        ...(returnedAuditorAssignments.length ? {
          auditorAssignments: returnedAuditorAssignments,
          auditorProgress: returnedAuditorProgress,
        } : {}),
        allAuditorsSubmitted: false,
        allAssignedAuditorsSubmitted: false,
        forwardedAuditorType: correctionAuditorType,
        forwardedAuditCategory: submission.forwardedAuditCategory || submission.auditType,
        auditorCorrectionRequested: true,
        correctionRequestedForAuditor: true,
        requiresAuditorResubmission: true,
        auditorCorrectionMessage: trimmedMessage,
        auditorCorrectionRequestedBy: profile.name,
        auditorCorrectionRequestedByRole: role,
        auditorCorrectionRequestedOn: requestedOn,
      };

      await updateSubmissionById(submission.id, payload);
      updateSubmission(submission.auditType, submission.id, {
        status: "under-review",
        remarks: "",
        forwardedToAuditorId: forwardedToAuditorIds[0] || submission.forwardedToAuditorId || "",
        forwardedToAuditorName: forwardedToAuditorNames[0] || submission.forwardedToAuditorName || "",
        forwardedToAuditorEmail: forwardedToAuditorEmails[0] || submission.forwardedToAuditorEmail || "",
        forwardedToAuditorIds,
        forwardedToAuditorNames,
        forwardedToAuditorEmails,
        assignmentKeys: selectedAssignmentKeys,
        auditorAssignmentKeys: selectedAssignmentKeys,
        correctionAssignmentKeys: selectedAssignmentKeys,
        returnedAuditorAssignmentKeys: selectedAssignmentKeys,
        ...(returnedAuditorAssignments.length ? {
          auditorAssignments: returnedAuditorAssignments,
          auditorProgress: returnedAuditorProgress,
        } : {}),
        allAuditorsSubmitted: false,
        allAssignedAuditorsSubmitted: false,
        forwardedAuditorType: correctionAuditorType,
        forwardedAuditCategory: submission.forwardedAuditCategory || submission.auditType,
        auditorCorrectionRequested: true,
        correctionRequestedForAuditor: true,
        requiresAuditorResubmission: true,
        auditorCorrectionMessage: trimmedMessage,
        auditorCorrectionRequestedBy: profile.name,
        auditorCorrectionRequestedOn: requestedOn,
      });
      setCorrectionTarget(null);
      setCorrectionMessage("");
      setCorrectionAssignmentKeys([]);
    } catch (correctionError) {
      setError(getApiErrorMessage(correctionError, "Could not return this review to the auditor for correction."));
    } finally {
      setReviewingStatus("");
    }
  };

  const startNextAuditCycle = async (submission) => {
    if (String(submission.reportCategory || "").toLowerCase() !== "internal" || submission.hasNextCycle) {
      setError("Only an Internal Audit report without an existing successor can start the next cycle.");
      return;
    }

    const ok = window.confirm(
      `Start the next audit cycle for ${submission.school}? The approved Version ${submission.version} report will remain unchanged.`,
    );
    if (!ok) return;

    setStartingNextCycleId(submission.id);
    setError("");
    try {
      await createNextAuditCycle(submission.id, {
        nextAuditorType: "external",
        previousApprovedSubmissionId: submission.id,
        nextVersion: Number(submission.version || 1) + 1,
      });
      updateSubmission(submission.auditType, submission.id, { hasNextCycle: true });
      setDashboardRouteState(submission.auditType);
      setRefreshKey((current) => current + 1);
    } catch (cycleError) {
      const message = getApiErrorMessage(cycleError, "Could not start the next audit cycle.");
      if (/next cycle already exists/i.test(message)) {
        updateSubmission(submission.auditType, submission.id, { hasNextCycle: true });
        setRefreshKey((current) => current + 1);
      }
      setError(message);
    } finally {
      setStartingNextCycleId("");
    }
  };

  const handleDownloadAttachments = async (submission) => {
    setDownloadingAttachmentsId(submission.id);
    setError("");

    try {
      const response = await downloadSubmissionAttachments(submission.id, {
        includeAllContributors: submission.auditType === "administrative",
      });
      const archive = response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: "application/zip" });
      if (!archive.size) throw new Error("The attachment archive is empty.");

      const objectUrl = window.URL.createObjectURL(archive);
      const downloadLink = document.createElement("a");
      downloadLink.href = objectUrl;
      downloadLink.download = archiveFileName(submission, response.headers);
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
    } catch (downloadError) {
      setError(getApiErrorMessage(downloadError, "Could not download the attachment archive."));
    } finally {
      setDownloadingAttachmentsId("");
    }
  };

  const handleStartNextAcademicYear = async () => {
    const nextAcademicYear = nextAcademicYearFor(academicYear);
    setStartingAcademicYear(true);
    setError("");

    try {
      const { data } = await startNextAcademicYear({
        currentAcademicYear: academicYear,
        nextAcademicYear,
        preserveApprovedHistory: true,
        resetActiveForms: true,
      });
      const confirmedYear = normalizeAcademicYear(
        data?.data?.academicYear ||
        data?.data?.nextAcademicYear ||
        data?.data?.currentAcademicYear ||
        data?.academicYear ||
        data?.nextAcademicYear ||
        data?.currentAcademicYear ||
        nextAcademicYear,
      );
      sessionStorage.setItem("academicYear", confirmedYear);
      setAcademicYear(confirmedYear);
      setShowNextYearModal(false);
      setSelectedSubmission(null);
      setDashboardRouteState(defaultActiveView);
      setRefreshKey((current) => current + 1);
    } catch (cycleError) {
      setError(getApiErrorMessage(cycleError, "Could not start the next academic year."));
    } finally {
      setStartingAcademicYear(false);
    }
  };

  const handleLogout = () => {
    clearAuthState();
    navigate("/login", { replace: true });
  };

  const openForwardModal = async (submission) => {
    if (!canForwardSubmissionToAuditor(submission)) {
      setError("Administrative contributors must submit the current cycle before forwarding to auditors.");
      return;
    }

    setForwardTarget(submission);
    setForwardAuditorType(auditorTypeForReportCategory(submission.reportCategory) || submission.forwardedAuditorType || "");
    setError("");

    if (auditors.length) return;

    setLoadingAuditors(true);
    try {
      const { data } = await fetchUsers();
      setAuditors(userList(data).map(normalizeAuditor).filter((user) => user.accountType === "auditor"));
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, "Could not load auditor accounts."));
    } finally {
      setLoadingAuditors(false);
    }
  };

  const closeForwardModal = () => {
    setForwardTarget(null);
    setForwardAuditorType("");
    setForwardingId("");
  };

  const forwardToAuditors = async (auditorType, matchingAuditors = []) => {
    if (!forwardTarget?.id || !auditorType || !matchingAuditors.length) return;
    const requiredAuditorType = auditorTypeForReportCategory(forwardTarget.reportCategory);
    if (requiredAuditorType && auditorType !== requiredAuditorType) {
      setError(`${titleCase(forwardTarget.reportCategory)} Audit can only be forwarded to ${requiredAuditorType} auditors.`);
      return;
    }

    setForwardingId(auditorType);
    setError("");
    const auditorIds = matchingAuditors
      .map((auditor) => Number(auditor.id))
      .filter((id) => Number.isSafeInteger(id) && id > 0);
    if (!auditorIds.length) {
      setError("Matching auditor accounts must have valid numeric IDs before forwarding.");
      setForwardingId("");
      return;
    }
    const auditorNames = matchingAuditors.map((auditor) => auditor.name).filter(Boolean);
    const auditorEmails = matchingAuditors.map((auditor) => auditor.email).filter(Boolean);
    const submittedAdministrativePosts = forwardTarget.auditType === "administrative"
      ? administrativeSubmittedPostsFor(forwardTarget)
      : [];
    const auditorAdministrativePosts = forwardTarget.auditType === "administrative"
      ? uniqueValues(matchingAuditors.flatMap(administrativePostsFor))
      : [];
    const auditorAssignments = buildAuditorAssignmentsForForwarding(forwardTarget, auditorType, matchingAuditors);
    const groupLabel = `${auditorNames.length} ${auditorType} ${forwardTarget.auditType} auditor${auditorNames.length === 1 ? "" : "s"}`;

    const payload = {
      status: backendStatusFor("under-review"),
      forwardedToAuditorIds: auditorIds,
      forwardedToAuditorNames: auditorNames,
      forwardedToAuditorEmails: auditorEmails,
      auditorAssignments,
      forwardedAuditorType: auditorType,
      forwardedAuditCategory: forwardTarget.auditType,
      ...(forwardTarget.auditType === "administrative" ? {
        forwardedAdministrativePosts: submittedAdministrativePosts,
        forwardedToAuditorPosts: auditorAdministrativePosts,
      } : {}),
    };

    try {
      await updateSubmissionById(forwardTarget.id, payload);
      const forwardedAt = new Date().toISOString();
      updateSubmission(forwardTarget.auditType, forwardTarget.id, {
        status: "under-review",
        forwardedToAuditorId: "",
        forwardedToAuditorName: groupLabel,
        forwardedToAuditorEmail: "",
        forwardedToAuditorIds: auditorIds,
        forwardedToAuditorNames: auditorNames,
        forwardedToAuditorEmails: auditorEmails,
        auditorAssignments,
        auditorProgress: buildAuditorProgress(auditorAssignments),
        allAuditorsSubmitted: false,
        forwardedAuditorType: auditorType,
        forwardedAuditCategory: forwardTarget.auditType,
        forwardedAt,
      });
      closeForwardModal();
    } catch (forwardError) {
      setError(getApiErrorMessage(forwardError, "Could not forward this submission to the matching auditors."));
      setForwardingId("");
    }
  };

  const completeAuditorReview = async (submission, values, auditorAttachments = submission.attachments) => {
    const ok = window.confirm(`Submit your ${auditLabels[submission.auditType]} auditor review? The form will move to IQAC only after every assigned auditor submits.`);
    if (!ok) return;

    setReviewingStatus("auditor-submit");
    setError("");

    try {
      const auditorReviewedOn = new Date().toISOString();
      const signedValues = withAuditorSignOff(values, profile, auditorReviewedOn);
      const assignedPosts = auditorPostsForCurrentSubmission(submission, profile);
      const currentAssignments = auditorAssignmentsForCurrentUser(submission, profile);
      const assignmentKeys = currentAssignments.map((assignment) => assignment.key).filter(Boolean);
      const { valuesData, tablesData, attachments } = buildSubmissionPayload({
          auditType: submission.auditType,
          values: signedValues,
          tables: submission.tables,
          attachments: uniqueAttachments([
            ...(auditorAttachments || []),
            ...attachmentsFromValues(signedValues),
          ]),
        });
      const payload = {
        auditorId: Number(profile.id) || profile.id,
        auditorName: profile.name,
        auditorEmail: profile.email,
        auditorType: profile.auditorType || auditorTypeFromRole(profile.role),
        auditCategory: submission.auditType,
        postsSubmitted: assignedPosts,
        submittedPosts: assignedPosts,
        administrativePosts: assignedPosts,
        assignedPosts,
        posts: assignedPosts,
        post: assignedPosts[0] || "",
        postSubmitted: assignedPosts[0] || "",
        assignmentKeys,
        auditorAssignmentKeys: assignmentKeys,
        submittedAt: auditorReviewedOn,
        reviewStatus: "submitted",
        valuesData,
        tablesData,
        attachments,
        auditorCorrectionRequested: false,
        correctionRequestedForAuditor: false,
        requiresAuditorResubmission: false,
        auditorResubmittedAt: auditorReviewedOn,
      };

      const { data } = await submitAuditorReview(submission.id, payload);
      const responseSubmission = data?.submission || submissionPayload(data);
      const returnedAssignments = normalizeAuditorAssignments(responseSubmission, signedValues);
      const currentAssignmentKeys = new Set(currentAssignments.map((assignment) => assignment.key).filter(Boolean));
      const currentAssignmentIds = new Set(currentAssignments.map((assignment) => String(assignment.auditorId || "")).filter(Boolean));
      const currentAssignmentEmails = new Set(
        currentAssignments
          .map((assignment) => normalizeAuditAssignment(assignment.auditorEmail || ""))
          .filter(Boolean)
      );
      const assignmentMatchesCurrentUser = (assignment = {}) => {
        const assignmentEmail = normalizeAuditAssignment(assignment.auditorEmail || "");
        if (assignment.key && currentAssignmentKeys.size) return currentAssignmentKeys.has(assignment.key);
        if (assignment.auditorId && currentAssignmentIds.size) return currentAssignmentIds.has(String(assignment.auditorId));
        return assignmentEmail && currentAssignmentEmails.has(assignmentEmail);
      };
      const previousAssignmentFor = (assignment = {}) => {
        const assignmentEmail = normalizeAuditAssignment(assignment.auditorEmail || "");
        return (submission.auditorAssignments || []).find((previous) =>
          assignment.key && previous.key
            ? previous.key === assignment.key
            : assignment.auditorId && previous.auditorId
              ? String(previous.auditorId || "") === String(assignment.auditorId)
              : assignmentEmail && normalizeAuditAssignment(previous.auditorEmail || "") === assignmentEmail
        );
      };
      const reconciledReturnedAssignments = returnedAssignments.map((assignment) => {
        if (assignmentMatchesCurrentUser(assignment)) {
          return {
            ...assignment,
            status: "submitted",
            reviewStatus: "submitted",
            submittedAt: assignment.submittedAt || auditorReviewedOn,
            values: assignment.values && Object.keys(assignment.values).length ? assignment.values : signedValues,
            attachments: assignment.attachments?.length ? assignment.attachments : attachments,
            auditorCorrectionRequested: false,
            correctionRequestedForAuditor: false,
            requiresAuditorResubmission: false,
            auditorResubmittedAt: auditorReviewedOn,
          };
        }

        const previous = previousAssignmentFor(assignment);
        if (!previous) return assignment;
        return {
          ...assignment,
          auditorCorrectionRequested: previous.auditorCorrectionRequested,
          correctionRequestedForAuditor: previous.correctionRequestedForAuditor,
          requiresAuditorResubmission: previous.requiresAuditorResubmission,
        };
      });
      const fallbackAssignments = (submission.auditorAssignments || []).map((assignment) =>
        assignmentMatchesCurrentUser(assignment)
          ? {
              ...assignment,
              status: "submitted",
              reviewStatus: "submitted",
              submittedAt: auditorReviewedOn,
              values: signedValues,
              attachments,
              auditorCorrectionRequested: false,
              correctionRequestedForAuditor: false,
              requiresAuditorResubmission: false,
              auditorResubmittedAt: auditorReviewedOn,
            }
          : assignment
      );
      const auditorAssignments = reconciledReturnedAssignments.length ? reconciledReturnedAssignments : fallbackAssignments;
      const auditorProgress = buildAuditorProgress(auditorAssignments);
      const allAuditorsSubmitted = booleanOrNull(
        responseSubmission.allAuditorsSubmitted ??
        responseSubmission.allAssignedAuditorsSubmitted
      );
      const allAssignedAuditorsSubmitted = auditorAssignments.length
        ? auditorProgress.allSubmitted
        : Boolean(allAuditorsSubmitted);
      const auditorCorrectionPending = auditorAssignments.some((assignment) =>
        assignment.auditorCorrectionRequested ||
        assignment.correctionRequestedForAuditor ||
        assignment.requiresAuditorResubmission
      );
      removeStoredAuditorCorrections(submission, currentAssignments, allAssignedAuditorsSubmitted);
      // Persist this auditor's assignment update even when other assigned posts/auditors
      // haven't finished yet — otherwise a partial submission never reaches the backend and
      // dashboards that re-fetch submissions (e.g. the AO's overview) keep showing this
      // auditor as "Not Submitted" indefinitely, since only the fully-complete case used to
      // call updateSubmissionById.
      if (allAssignedAuditorsSubmitted) {
        await updateSubmissionById(submission.id, {
          status: backendStatusFor("auditor-completed"),
          submissionStatus: backendStatusFor("auditor-completed"),
          overallStatus: backendStatusFor("auditor-completed"),
          workflowStatus: backendStatusFor("auditor-completed"),
          auditorAssignments,
          auditorProgress,
          allAuditorsSubmitted: true,
          allAssignedAuditorsSubmitted: true,
          auditorReviewedBy: profile.name,
          auditorReviewedByDesignation: profile.designation,
          auditorReviewedByRole: role,
          auditorReviewedOn,
          auditorReviewedByEmail: profile.email,
          valuesData,
          tablesData,
          attachments,
        });
      } else {
        await updateSubmissionById(submission.id, {
          auditorAssignments,
          auditorProgress,
        });
      }
      const nextStatus = allAssignedAuditorsSubmitted
        ? normalizeStatus(responseSubmission.status || responseSubmission.submissionStatus || "auditor-completed")
        : "under-review";

      updateSubmission(submission.auditType, submission.id, {
        status: nextStatus,
        values: responseSubmission.values ? parseSubmissionFormData(responseSubmission).values : signedValues,
        auditorAssignments,
        auditorProgress,
        allAuditorsSubmitted: allAssignedAuditorsSubmitted,
        ...(allAssignedAuditorsSubmitted ? {
          auditorReviewedBy: profile.name,
          auditorReviewedByDesignation: profile.designation,
          auditorReviewedByRole: role,
          auditorReviewedOn,
        } : {}),
        auditorCorrectionRequested: auditorCorrectionPending,
        correctionRequestedForAuditor: auditorCorrectionPending,
        requiresAuditorResubmission: auditorCorrectionPending,
        auditorCorrectionMessage: auditorCorrectionPending ? submission.auditorCorrectionMessage : "",
      });
    } catch (reviewError) {
      setError(getApiErrorMessage(reviewError, "Could not submit your auditor review."));
    } finally {
      setReviewingStatus("");
    }
  };

  return (
    <>
      <PrintStyles />
      <div className="review-dashboard-shell" style={styles.shell}>
        <AppSidebar
          title={roleConfig.title}
          subtitle="D Y Patil International University"
          badge={roleConfig.badge}
          roleTitle={roleConfig.roleTitle}
          roleText={roleConfig.roleText}
          academicYear={compactAcademicYear(academicYear)}
          currentAcademicYear={activeAcademicYear}
          availableYears={availableYears}
          onYearChange={isIqacDashboard ? undefined : (newYear) => {
            sessionStorage.setItem("academicYear", newYear);
            setAcademicYear(normalizeAcademicYear(newYear));
          }}
          items={navigationItems}
          pinnedItems={pinnedNavigationItems}
          standaloneItems={standaloneNavigationItems}
          activeId={visibleActiveView}
          onChange={(viewId) => {
            if (viewId === START_NEXT_YEAR_NAV_ITEM.id) {
              setShowNextYearModal(true);
              return;
            }
            if (viewId === "user-management" && !canManageUsers) return;
            setSelectedSubmission(null);
            setDashboardRouteState(viewId);
          }}
          profile={profile}
          onLogout={() => setShowLogoutModal(true)}
          onOpenProfile={() => setShowProfileModal(true)}
        />

        <main className="review-dashboard-main" style={styles.page}>
          {!selectedSubmission && (
            <header style={styles.header}>
              <div style={styles.headerContent}>
                <div style={styles.logoWrap}>
                  <img src={universityLogo} alt="DYPIU Logo" style={styles.logo} />
                </div>
                <div>
                  <p style={styles.kicker}>D Y Patil International University Akurdi Pune</p>
                  <h1 style={styles.title}>{roleConfig.title}</h1>
                  <p style={styles.meta}>School Appraisal Review - Academic Year {academicYearPeriod(academicYear)}</p>
                </div>
              </div>
              <img src={iqacLogo} alt="IQAC Logo" style={styles.headerIqacLogo} />
            </header>
          )}

          {selectedSubmission ? (
            <FullFormReview
              key={`${selectedSubmission.id}-${profile.id || profile.email || profile.auditorRole || role}`}
              submission={selectedSubmission}
              onBack={() => {
                setSelectedSubmission(null);
                setDashboardRouteState(activeView, { replace: true });
              }}
              onRemarksChange={(remarks) => updateSubmission(selectedSubmission.auditType, selectedSubmission.id, { remarks })}
              onApprove={() => openApprovalModal(selectedSubmission)}
              onReturnToAuditor={() => openCorrectionModal(selectedSubmission)}
              onCompleteAuditorReview={(values, attachments) => completeAuditorReview(selectedSubmission, values, attachments)}
              reviewingStatus={reviewingStatus}
              canApprove={!isAuditor && isAuditorCompleted(selectedSubmission)}
              canReturnToAuditor={
                !isAuditor &&
                isAuditorCompleted(selectedSubmission) &&
                !isApprovedReport(selectedSubmission) &&
                (
                  selectedSubmission.forwardedAuditorType === "internal" ||
                  String(selectedSubmission.auditorReviewedByRole || "").includes("internal")
                )
              }
              canEditAuditorSection={
                isAuditor &&
                matchesAuditorSession(selectedSubmission, profile) &&
                !isAuditorCompleted(selectedSubmission) &&
                (!currentAuditorSubmitted(selectedSubmission, profile) || currentAuditorCorrectionRequested(selectedSubmission, profile))
              }
              auditorReviewReadOnly={
                isAuditor &&
                (isAuditorCompleted(selectedSubmission) || currentAuditorSubmitted(selectedSubmission, profile)) &&
                !currentAuditorCorrectionRequested(selectedSubmission, profile)
              }
              auditorCorrectionMode={isAuditor && currentAuditorCorrectionRequested(selectedSubmission, profile)}
              showPreviousAuditorReference={isAuditor && profile.auditorType === "external"}
              currentProfile={profile}
              submitterAvatarUrl={resolveSubmitterAvatar(selectedSubmission)}
            />
          ) : visibleActiveView === "overview" && isIqacDashboard ? (
            <AcademicAdministrativeSubmissionsPanel
              academicSubmissions={submissions.academic}
              administrativeSubmissions={submissions.administrative}
              loading={loadingSubmissions}
              academicYear={academicYear}
              availableYears={availableYears}
            />
          ) : visibleActiveView === "overview" ? (
            <OverviewPanel
              metrics={metrics}
              submissions={allSubmissions}
              loading={loadingSubmissions}
              onOpen={(submission) => {
                openSubmission(submission);
              }}
            />
          ) : visibleActiveView === "advanced-overview" ? (
            <AdvancedOverviewPanel metrics={metrics} submissions={allSubmissions} loading={loadingSubmissions} />
          ) : visibleActiveView === "user-management" && canManageUsers ? (
            <UserManagementPanel />
          ) : visibleActiveView === "auditor-final-review" ? (
            <AuditorFinalReviewPanel
              submissions={auditorReviewedSubmissions}
              loading={loadingSubmissions}
              onOpen={openSubmission}
              onDownload={handleDownloadAttachments}
              downloadingAttachmentsId={downloadingAttachmentsId}
              resolveSubmitterAvatar={resolveSubmitterAvatar}
            />
          ) : visibleActiveView === "previous-reports" ? (
            <PreviousReportsPanel
              key={academicYear}
              submissions={previousReports}
              academicYear={academicYear}
              loading={loadingSubmissions}
              onOpen={openSubmission}
              onStartNextCycle={startNextAuditCycle}
              startingNextCycleId={startingNextCycleId}
              onDownload={handleDownloadAttachments}
              downloadingAttachmentsId={downloadingAttachmentsId}
              resolveSubmitterAvatar={resolveSubmitterAvatar}
            />
          ) : visibleActiveView === "backup-restore" ? (
            <BackupRestorePanel />
          ) : null}

          {error && <div className="review-error-notice" style={styles.errorNotice}>{error}</div>}
          {loadingSubmissionId && <LoadingState label="Loading submission details..." compact />}

          {!selectedSubmission && visibleActiveView === "academic" && (
            <AuditReviewPanel
              key={academicYear}
              auditType="academic"
              submissions={intakeSubmissions.academic}
              academicYear={academicYear}
              activeGroup={activeGroup.academic}
              onGroupChange={(group) => setActiveGroup((current) => ({ ...current, academic: group }))}
              onOpen={openSubmission}
              onForward={canManageUsers ? openForwardModal : null}
              onDownload={!isAuditor ? handleDownloadAttachments : null}
              downloadingAttachmentsId={downloadingAttachmentsId}
              loading={loadingSubmissions}
              resolveSubmitterAvatar={resolveSubmitterAvatar}
            />
          )}

          {!selectedSubmission && visibleActiveView === "administrative" && (
            <AuditReviewPanel
              key={academicYear}
              auditType="administrative"
              submissions={intakeSubmissions.administrative}
              academicYear={academicYear}
              activeGroup={activeGroup.administrative}
              onGroupChange={(group) => setActiveGroup((current) => ({ ...current, administrative: group }))}
              onOpen={openSubmission}
              onForward={canManageUsers ? openForwardModal : null}
              onDownload={!isAuditor ? handleDownloadAttachments : null}
              downloadingAttachmentsId={downloadingAttachmentsId}
              loading={loadingSubmissions}
              resolveSubmitterAvatar={resolveSubmitterAvatar}
            />
          )}
        </main>

        {forwardTarget && (
          <ForwardAuditorModal
            submission={forwardTarget}
            auditors={auditors}
            loading={loadingAuditors}
            selectedType={forwardAuditorType}
            onTypeChange={setForwardAuditorType}
            forwardingId={forwardingId}
            onForward={forwardToAuditors}
            onCancel={closeForwardModal}
          />
        )}
        {approvalTarget && (
          <ApprovalCategoryModal
            submission={approvalTarget}
            selectedCategory={approvalCategory}
            onCategoryChange={setApprovalCategory}
            approving={reviewingStatus === "approved"}
            onApprove={() => approveSubmission(approvalTarget, approvalCategory)}
            onCancel={() => {
              setApprovalTarget(null);
              setApprovalCategory("");
            }}
          />
        )}
        {correctionTarget && (
          <ReturnToAuditorModal
            submission={correctionTarget}
            message={correctionMessage}
            onMessageChange={setCorrectionMessage}
            selectedAssignmentKeys={correctionAssignmentKeys}
            onSelectedAssignmentKeysChange={setCorrectionAssignmentKeys}
            returning={reviewingStatus === "auditor-correction"}
            onReturn={returnToAuditorForCorrection}
            onCancel={closeCorrectionModal}
          />
        )}
        {showNextYearModal && (
          <NextAcademicYearModal
            currentAcademicYear={academicYear}
            nextAcademicYear={nextAcademicYearFor(academicYear)}
            loading={startingAcademicYear}
            onConfirm={handleStartNextAcademicYear}
            onCancel={() => setShowNextYearModal(false)}
          />
        )}
        {showLogoutModal && <LogoutModal onCancel={() => setShowLogoutModal(false)} onConfirm={handleLogout} />}
        {showProfileModal && (
          <UserProfileModal
            profile={profile}
            onClose={() => setShowProfileModal(false)}
            onSaved={(updates) => {
              if (updates.name) sessionStorage.setItem("name", updates.name);
              if (updates.email) sessionStorage.setItem("email", updates.email);
              setProfileOverrides((prev) => ({ ...prev, ...updates }));
            }}
          />
        )}
      </div>
    </>
  );
}

function buildMetrics(submissions) {
  return submissions.reduce(
    (metrics, submission) => {
      metrics.total += 1;
      if (metrics[submission.status] != null) metrics[submission.status] += 1;
      if (metrics[submission.auditType] != null) metrics[submission.auditType] += 1;
      return metrics;
    },
    { total: 0, submitted: 0, "under-review": 0, "auditor-completed": 0, approved: 0, academic: 0, administrative: 0 }
  );
}

function OverviewPanel({ metrics, submissions, loading, onOpen }) {
  const pendingSubmissions = submissions.filter((submission) => submission.status !== "approved");
  const approvalRate = metrics.total ? Math.round((metrics.approved / metrics.total) * 100) : 0;
  const schoolProgress = buildSchoolProgress(submissions);

  return (
    <section style={styles.panel}>
      <div className="review-overview-hero" style={styles.overviewHero}>
        <div style={styles.overviewHeroCopy}>
          <span style={styles.overviewEyebrow}>Review command center</span>
          <h2 className="review-overview-title" style={styles.overviewTitle}>Institutional Audit Overview</h2>
          <p style={styles.overviewDescription}>Track submissions, prioritize pending reviews, and monitor approval progress across every school.</p>
          <div style={styles.overviewHeroPills}>
            <span style={styles.overviewHeroPill}>{metrics.academic} Academic</span>
            <span style={styles.overviewHeroPill}>{metrics.administrative} Administrative</span>
            <span style={styles.overviewHeroPill}>{schoolProgress.length} Schools</span>
          </div>
        </div>
        <div style={{ ...styles.approvalRing, background: `conic-gradient(#38bdf8 ${approvalRate}%, rgba(255,255,255,.16) 0)` }}>
          <div style={styles.approvalRingInner}>
            <strong>{approvalRate}%</strong>
            <span>approved</span>
          </div>
        </div>
      </div>

      <div style={styles.metricGrid}>
        <MetricCard label="Total submissions" value={metrics.total} hint="Across both audit types" tone="blue" />
        <MetricCard label="Pending review" value={metrics.submitted + metrics["under-review"]} hint="Requires reviewer action" tone="amber" />
        <MetricCard label="Auditor completed" value={metrics["auditor-completed"]} hint="Awaiting final approval" tone="teal" />
        <MetricCard label="Approved" value={metrics.approved} hint={`${approvalRate}% completion rate`} tone="green" />
      </div>

      {loading && <SkeletonList rows={3} />}

      <div className="review-overview-split" style={styles.splitGrid}>
        <div className="app-surface-card" style={styles.card}>
          <span style={styles.cardEyebrow}>Coverage</span>
          <h3 style={styles.cardTitle}>Audit Portfolio</h3>
          <div style={styles.auditSummaryRows}>
            <SummaryRow label="Academic Audit" value={metrics.academic} />
            <SummaryRow label="Administrative Audit" value={metrics.administrative} />
          </div>
        </div>

        <div className="app-surface-card" style={styles.card}>
          <div style={styles.queueHeader}>
            <div><span style={styles.cardEyebrow}>Priority</span><h3 style={styles.cardTitle}>Pending Review Queue</h3></div>
            <span style={styles.queueCount}>{pendingSubmissions.length}</span>
          </div>
          <div style={styles.queueList}>
            {!loading && !pendingSubmissions.length && <div style={styles.emptyDraftNotice}>All available submissions are reviewed.</div>}
            {pendingSubmissions.slice(0, 6).map((submission) => (
              <button className="review-queue-item" key={submission.id} type="button" style={styles.queueItem} onClick={() => onOpen(submission)}>
                <span>
                  <strong>{submission.school}</strong>
                  <small>{auditLabels[submission.auditType]}</small>
                </span>
                <StatusBadge status={submission.status} />
              </button>
            ))}
          </div>
        </div>
      </div>

    </section>
  );
}

function buildSchoolProgress(submissions) {
  const schoolMap = {};
  
  // Pre-initialize all 8 official university schools
  SCHOOL_OPTIONS.forEach((opt) => {
    const code = opt.code.toUpperCase();
    schoolMap[code] = { school: code, total: 0, approved: 0, pending: 0 };
  });

  (submissions || []).forEach((submission) => {
    const rawSchool = submission.school;
    const school = rawSchool ? canonicalSchoolCode(rawSchool) || rawSchool.trim().toUpperCase() : "Unknown school";
    if (!schoolMap[school]) {
      schoolMap[school] = { school, total: 0, approved: 0, pending: 0 };
    }
    schoolMap[school].total += 1;
    if (submission.status === "approved" || submission.status === "APPROVED" || submission.status === "FINAL") {
      schoolMap[school].approved += 1;
    } else {
      schoolMap[school].pending += 1;
    }
  });

  return Object.values(schoolMap).sort((a, b) => b.total - a.total || a.school.localeCompare(b.school));
}

function usersForCategory(users = [], category) {
  return users.filter((user) => user.category === category && !String(user.role || user.accountType || "").includes("auditor"));
}

function mapUsersBySchool(users = []) {
  const map = {};
  users.forEach((user) => {
    const codes = user.schools.length ? user.schools : [canonicalSchoolCode(user.school)];
    codes.filter(Boolean).forEach((code) => {
      if (!map[code]) map[code] = user;
    });
  });
  return map;
}

function mapUsersByPost(users = []) {
  const map = {};
  users.forEach((user) => {
    user.administrativePosts.forEach((post) => {
      if (!map[post]) map[post] = user;
    });
  });
  return map;
}

function resolvedAuditorTypeFor(submission = {}) {
  return normalizeUserRole(
    submission.forwardedAuditorType ||
    auditorTypeForReportCategory(submission.reportCategory) ||
    ""
  );
}

function classifiedAcademicSchoolCodes(academicSubmissions = []) {
  return new Set(
    academicSubmissions
      .filter((submission) => ["internal", "external"].includes(resolvedAuditorTypeFor(submission)))
      .map((submission) => canonicalSchoolCode(submission.school) || String(submission.school || "").trim().toUpperCase())
  );
}

function appendUnclassifiedAccounts(notSubmittedRows, classifiedKeys, accountsByKey, secondaryFor) {
  Object.entries(accountsByKey).forEach(([key, account]) => {
    if (classifiedKeys.has(key)) return;
    notSubmittedRows.push({
      name: account.name || "-",
      email: account.email || "-",
      secondary: secondaryFor(key, account),
      date: null,
    });
  });
}

// IQAC starting the external cycle (SubmissionCard's "Start External Cycle" action) marks
// the source APPROVED INTERNAL submission with hasNextCycle so the button doesn't show twice —
// it doesn't guarantee the backend has (yet) handed back a classified "external" submission row
// for that school/post. Without this, a school sits in neither bucket right after IQAC starts
// its external cycle, even though it's clearly awaiting the director's external submission.
function appendStartedButUnfiledExternalCycles(notSubmittedRows, coveredKeys, submissions, keyFor, resolveContact) {
  submissions.forEach((submission) => {
    if (normalizeUserRole(submission.reportCategory) !== "internal" || !submission.hasNextCycle) return;
    const key = keyFor(submission);
    if (!key || coveredKeys.has(key)) return;
    coveredKeys.add(key);
    const contact = resolveContact(submission) || {};
    notSubmittedRows.push({
      name: contact.name || "-",
      email: contact.email || "-",
      secondary: contact.secondary || "-",
      date: null,
    });
  });
}

// Auditor accounts are hard-deleted (no soft-delete/year scoping on the backend), so once an
// auditor is removed they vanish from the live `users` roster for every year, past and future.
// Without this, their completed work would disappear from a past year's overview the moment
// they're deleted, even though that work is still on record inside the submissions themselves.
// These two helpers reconstruct "ghost" rows for auditors evidenced by (year-filtered)
// submission data but absent from the live roster — so a deleted auditor's completed
// schools/posts stay visible for the year they actually did them, while a fresh year (which
// has no submissions referencing them) naturally shows nothing for them at all.
function academicGhostAuditorRows(academicSubmissions = [], auditorType, knownEmails) {
  const byEmail = new Map();
  academicSubmissions.forEach((submission) => {
    if (resolvedAuditorTypeFor(submission) !== auditorType || !isAuditorCompleted(submission)) return;
    const emailKey = normalizeAuditAssignment(submission.auditorReviewedByEmail || "");
    if (!emailKey || knownEmails.has(emailKey)) return;
    const code = canonicalSchoolCode(submission.school) || String(submission.school || "").trim().toUpperCase();
    if (!code) return;
    const entry = byEmail.get(emailKey) || {
      name: submission.auditorReviewedBy || "-",
      email: submission.auditorReviewedByEmail,
      keys: new Set(),
      dates: [],
    };
    entry.keys.add(code);
    const date = submission.auditorReviewedOn || submission.submittedOn;
    if (date) entry.dates.push(date);
    byEmail.set(emailKey, entry);
  });
  return [...byEmail.values()].map((entry) => ({
    name: entry.name,
    email: entry.email,
    secondary: [...entry.keys].join(", "),
    date: entry.dates.sort().slice(-1)[0] || null,
  }));
}

function administrativeGhostAuditorRows(administrativeSubmissions = [], auditorType, knownEmails) {
  const postLabel = (code) => ADMINISTRATIVE_POSTS.find((post) => post.value === code)?.label || code;
  const byEmail = new Map();

  administrativeSubmissions.forEach((submission) => {
    const assignments = submission.auditorAssignments || submission.auditorAssignmentStatus || submission.auditorReviews || [];
    if (assignments.length) {
      assignments.forEach((assignment) => {
        const assType = assignment.auditorType ? String(assignment.auditorType).toLowerCase() : "";
        if (assType && assType !== auditorType) return;
        if (!auditorAssignmentSubmitted(assignment)) return;
        const emailKey = normalizeAuditAssignment(assignment.auditorEmail || "");
        if (!emailKey || knownEmails.has(emailKey)) return;
        const postCode = canonicalAdministrativePost(assignment.post) || assignment.post;
        if (!postCode) return;
        const entry = byEmail.get(emailKey) || {
          name: assignment.auditorName || "-",
          email: assignment.auditorEmail,
          keys: new Set(),
          dates: [],
        };
        entry.keys.add(postCode);
        if (assignment.submittedAt) entry.dates.push(assignment.submittedAt);
        byEmail.set(emailKey, entry);
      });
      return;
    }

    if (resolvedAuditorTypeFor(submission) !== auditorType || !isAuditorCompleted(submission)) return;
    const emailKey = normalizeAuditAssignment(submission.auditorReviewedByEmail || "");
    if (!emailKey || knownEmails.has(emailKey)) return;
    const entry = byEmail.get(emailKey) || {
      name: submission.auditorReviewedBy || "-",
      email: submission.auditorReviewedByEmail,
      keys: new Set(),
      dates: [],
    };
    administrativeSubmittedPostsFor(submission).forEach((post) => {
      const postCode = canonicalAdministrativePost(post) || post;
      if (postCode) entry.keys.add(postCode);
    });
    const date = submission.auditorReviewedOn || submission.submittedOn;
    if (date) entry.dates.push(date);
    byEmail.set(emailKey, entry);
  });

  return [...byEmail.values()].map((entry) => ({
    name: entry.name,
    email: entry.email,
    secondary: [...entry.keys].map(postLabel).join(", "),
    date: entry.dates.sort().slice(-1)[0] || null,
  }));
}

// Internal/External auditor coverage is driven by actual auditor ACCOUNTS and their
// assigned schools/posts — not by whatever a submission's forwardedAuditorType/reportCategory
// happens to say (those can be pre-classified before any real auditor has been created or
// assigned). A school/post only counts once a matching auditor account exists and lists it
// among their assignments; an auditor with multiple assignments is one row per status bucket
// (their completed schools/posts joined together, and separately their pending ones).
function auditorAccountCoverage(users = [], auditorType, academicSubmissions = [], administrativeSubmissions = [], categoryFilter = null) {
  const auditors = users.filter(
    (user) =>
      user.accountType === "auditor" &&
      user.auditorType === auditorType &&
      (!categoryFilter || user.category === categoryFilter)
  );

  const academicCompletion = new Map();
  const academicDates = new Map();
  academicSubmissions.forEach((submission) => {
    if (resolvedAuditorTypeFor(submission) !== auditorType) return;
    const code = canonicalSchoolCode(submission.school) || String(submission.school || "").trim().toUpperCase();
    if (!code) return;
    const completed = isAuditorCompleted(submission);
    if (completed || !academicCompletion.has(code)) academicCompletion.set(code, completed);
    if (completed) academicDates.set(code, submission.auditorReviewedOn || submission.submittedOn);
  });

  const postLabel = (code) => ADMINISTRATIVE_POSTS.find((post) => post.value === code)?.label || code;

  const submittedRows = [];
  const notSubmittedRows = [];

  auditors.forEach((auditor) => {
    const isAcademic = auditor.category === "academic";

    if (isAcademic) {
      const rawKeys = auditor.schools || [];
      const keys = rawKeys.map((s) => canonicalSchoolCode(s) || String(s || "").trim().toUpperCase()).filter(Boolean);
      if (!keys.length) return;

      const completedKeys = keys.filter((key) => academicCompletion.get(key) === true);
      const pendingKeys = keys.filter((key) => {
        if (academicCompletion.get(key) === true) return false;
        return auditorType === "internal" || academicCompletion.has(key);
      });

      if (completedKeys.length) {
        const dates = completedKeys.map((key) => academicDates.get(key)).filter(Boolean).sort();
        submittedRows.push({
          name: auditor.name || "-",
          email: auditor.email || "-",
          secondary: completedKeys.join(", "),
          date: dates.length ? dates[dates.length - 1] : null,
        });
      }
      if (pendingKeys.length) {
        notSubmittedRows.push({
          name: auditor.name || "-",
          email: auditor.email || "-",
          secondary: pendingKeys.join(", "),
          date: null,
        });
      }
    } else {
      // Administrative Auditor: match explicit assignments for this auditor across administrativeSubmissions
      const auditorIdStr = String(auditor.id || "");
      const auditorEmailNorm = (auditor.email || "").trim().toLowerCase();

      const myAssignments = [];
      administrativeSubmissions.forEach((submission) => {
        const assignments = submission.auditorAssignments || submission.auditorAssignmentStatus || submission.auditorReviews || [];
        assignments.forEach((assignment) => {
          const assType = assignment.auditorType ? String(assignment.auditorType).toLowerCase() : "";
          if (assType && assType !== auditorType) return;

          const assIdStr = String(assignment.auditorId || "");
          const assEmailNorm = (assignment.auditorEmail || "").trim().toLowerCase();

          const idMatch = auditorIdStr && assIdStr && auditorIdStr === assIdStr;
          const emailMatch = auditorEmailNorm && assEmailNorm && auditorEmailNorm === assEmailNorm;

          if (idMatch || emailMatch) {
            myAssignments.push(assignment);
          }
        });
      });

      const assignedPostCodes = myAssignments.length > 0
        ? Array.from(
          new Set(
            myAssignments
              .map((a) => canonicalAdministrativePost(a.post) || a.post)
              .filter(Boolean)
          )
        )
        : Array.from(
          new Set(
            (auditor.administrativePosts || (auditor.post ? [auditor.post] : []))
              .map((p) => canonicalAdministrativePost(p) || p)
              .filter(Boolean)
          )
        );

      if (!assignedPostCodes.length) return;

      const completedPosts = [];
      const pendingPosts = [];
      const postDates = new Map();

      assignedPostCodes.forEach((postCode) => {
        const matchingAss = myAssignments.find(
          (a) => (canonicalAdministrativePost(a.post) || a.post) === postCode
        );

        if (matchingAss) {
          if (auditorAssignmentSubmitted(matchingAss)) {
            completedPosts.push(postCode);
            if (matchingAss.submittedAt) {
              postDates.set(postCode, matchingAss.submittedAt);
            }
          } else {
            pendingPosts.push(postCode);
          }
        } else {
          let globalCompleted = false;
          let globalDate = null;
          administrativeSubmissions.forEach((submission) => {
            const assignments = submission.auditorAssignments || submission.auditorAssignmentStatus || submission.auditorReviews || [];
            assignments.forEach((a) => {
              const aType = a.auditorType ? String(a.auditorType).toLowerCase() : "";
              if (aType === auditorType && (canonicalAdministrativePost(a.post) || a.post) === postCode) {
                if (auditorAssignmentSubmitted(a)) {
                  globalCompleted = true;
                  if (a.submittedAt) globalDate = a.submittedAt;
                }
              }
            });
            if (!assignments.length && resolvedAuditorTypeFor(submission) === auditorType) {
              if (isAuditorCompleted(submission)) {
                globalCompleted = true;
                globalDate = submission.auditorReviewedOn || submission.submittedOn;
              }
            }
          });

          if (globalCompleted) {
            completedPosts.push(postCode);
            if (globalDate) postDates.set(postCode, globalDate);
          } else {
            if (auditorType === "internal" || myAssignments.length > 0) {
              pendingPosts.push(postCode);
            }
          }
        }
      });

      if (completedPosts.length) {
        const dates = completedPosts.map((p) => postDates.get(p)).filter(Boolean).sort();
        submittedRows.push({
          name: auditor.name || "-",
          email: auditor.email || "-",
          secondary: completedPosts.map(postLabel).join(", "),
          date: dates.length ? dates[dates.length - 1] : null,
        });
      }
      if (pendingPosts.length) {
        notSubmittedRows.push({
          name: auditor.name || "-",
          email: auditor.email || "-",
          secondary: pendingPosts.map(postLabel).join(", "),
          date: null,
        });
      }
    }
  });

  const knownEmails = new Set(auditors.map((auditor) => normalizeAuditAssignment(auditor.email || "")).filter(Boolean));
  if (!categoryFilter || categoryFilter === "academic") {
    submittedRows.push(...academicGhostAuditorRows(academicSubmissions, auditorType, knownEmails));
  }
  if (!categoryFilter || categoryFilter === "administrative") {
    submittedRows.push(...administrativeGhostAuditorRows(administrativeSubmissions, auditorType, knownEmails));
  }

  return { submittedRows, notSubmittedRows };
}

// Posts on an administrative submission that have been submitted but have no auditor
// assignment recorded yet. Shared by pendingForwardCount and the SubmissionCard "Forwarded"
// banner so both agree on what's actually still outstanding — an office can show a
// "Forwarded to auditor" banner for one post while several others were never forwarded at
// all, which looked like a completed submission until this was surfaced explicitly.
function administrativeUnassignedPostsFor(submission = {}) {
  const assignedPosts = new Set(
    (submission.auditorAssignments || []).map((assignment) => canonicalAdministrativePost(assignment.post) || assignment.post)
  );
  const submittedPosts = administrativeSubmittedPostsFor(submission).map((post) => canonicalAdministrativePost(post) || post);
  return submittedPosts.filter((postCode) => !assignedPosts.has(postCode));
}

// How many items (academic submissions, or individual administrative posts) are ready for
// IQAC to forward to an auditor of the given type — i.e. the director/post-holder has
// submitted, but nobody has forwarded it to a specific auditor yet. A submission/post with
// no resolved track at all defaults to the "internal" queue (internal is always the first
// stage); a submission already resolved to "external" (e.g. a next-cycle successor) only
// counts toward the external queue.
function pendingForwardCount(academicSubmissions = [], administrativeSubmissions = [], auditorType) {
  let count = 0;

  academicSubmissions.forEach((submission) => {
    if (normalizeStatus(submission.status) === "draft") return;
    if (hasAuditorAssignment(submission)) return;
    // A freshly spawned next-cycle submission (e.g. right after IQAC starts the external cycle)
    // can carry a non-draft status forward from the cycle it succeeded, even though the
    // director hasn't opened/submitted this cycle's form yet. Only count it once the director
    // has genuinely submitted THIS record (its own submitter sign-off is recorded).
    if (isFreshCycleSuccessor(submission) && !getSubmitterSignOff(submission.values).date) return;
    const track = resolvedAuditorTypeFor(submission);
    if (track === auditorType || (!track && auditorType === "internal")) count += 1;
  });

  administrativeSubmissions.forEach((submission) => {
    // Already-approved/completed submissions are done — their per-post auditorAssignments
    // history can be sparse or stale (e.g. predating the per-post assignment feature), which
    // would otherwise look like an unassigned post still awaiting a forward.
    if (isAuditorCompleted(submission)) return;
    const track = resolvedAuditorTypeFor(submission);
    if (track !== auditorType && !(!track && auditorType === "internal")) return;
    // Administrative posts share a single office-wide form, so a pending forward counts as
    // one item (not one per contributing post) once any submitted post lacks an auditor.
    if (administrativeUnassignedPostsFor(submission).length) count += 1;
  });

  return count;
}

// How many items an auditor of the given type has finished reviewing but IQAC hasn't
// approved yet — reuses the same isAuditorCompleted/isApprovedReport signals the "Auditor
// Final Review" list elsewhere in this dashboard is already built from.
function pendingApproveCount(allSubmissions = [], auditorType) {
  return allSubmissions.filter((submission) =>
    resolvedAuditorTypeFor(submission) === auditorType &&
    isAuditorCompleted(submission) &&
    !isApprovedReport(submission)
  ).length;
}

// Whether a submission counts as "submitted" for a given auditor-type track is about the
// DIRECTOR's own action — did they submit their form for this track — not whether an
// auditor has since reviewed/completed it. A submission with status "draft" exists only
// because IQAC started this track for them (e.g. via "Start Next Cycle") but the director
// hasn't actually filled/submitted it yet, so it counts as not-submitted.
//
// For the internal track, directors with no matching submission at all are additionally
// folded into "not submitted" via appendUnclassifiedAccounts (every director starts here).
// For the external track, that fallback is deliberately NOT applied — a school only shows
// up here once its external track has actually been started (a draft/submission for it
// exists); schools whose external cycle hasn't started yet aren't counted at all.
function auditorTypeCoverageWithRows(submissions = [], auditorType, resolveContact) {
  const relevant = submissions.filter((submission) => resolvedAuditorTypeFor(submission) === auditorType);
  const submittedRows = [];
  const notSubmittedRows = [];

  relevant.forEach((submission) => {
    const contact = resolveContact(submission) || {};
    // A freshly spawned cycle record — whether from "Start External Cycle" on a single
    // submission or the bulk "Start Next Academic Year" action — can be cloned from an
    // already-approved prior cycle and inherit its non-draft status and submittedOn date, even
    // though the director hasn't opened this cycle's form yet. isFreshCycleSuccessor only
    // catches the per-submission clone path (it keys off previousApprovedSubmissionId, which the
    // bulk yearly reset doesn't set), so fall back to the one signal that's true regardless of how
    // the record got its status: whether THIS record has ever actually been run through the
    // director's own submit action (values.__auditSignOff.submittedBy.date, set only by
    // withSubmitterSignOff at genuine submit time).
    const isDraft = normalizeStatus(submission.status) === "draft" || !getSubmitterSignOff(submission.values).date;
    // Not-submitted rows haven't actually been signed this cycle, so any submittedBy on the
    // record is leftover from a cloned prior cycle (see comment above) — show the CURRENT
    // director instead of that stale name. Submitted rows keep the frozen submittedBy: it's
    // the historical record of who actually signed that cycle's form, which should stay
    // correct even if the school's director has since changed (e.g. last year's report was
    // signed by the outgoing director, not whoever holds the role now).
    const row = {
      name: (isDraft ? contact.name : submission.submittedBy) || contact.name || "-",
      email: contact.email || "-",
      secondary: contact.secondary || "-",
      date: isDraft ? null : submission.submittedOn,
    };
    (isDraft ? notSubmittedRows : submittedRows).push(row);
  });

  return { submittedRows, notSubmittedRows };
}

// The "Administrative Posts" overview card tracks the 4 administrative posts
// (Registrar/HR/Dean Student Welfare/Dean Placement), not submission records — all 4 posts
// share a single administrative form per audit track, and each post contributes its own
// section into it. So unlike auditorTypeCoverageWithRows (one row per submission), this
// counts one row per post: "Not Submitted" starts at all 4 posts and moves a post into
// "Submitted" only once administrativeSubmittedPostsFor reports that post's section as
// submitted on the track's submission. The external track only becomes visible (0 of 4,
// counting up as posts submit) once IQAC has actually started it — either a submission
// already resolved to "external" exists, or an approved internal submission has been marked
// hasNextCycle; internal is always visible since it's the track every post starts on.
function administrativePostCoverageWithRows(administrativeSubmissions = [], auditorType, adminUsersByPost = {}) {
  const relevant = administrativeSubmissions.filter((submission) => resolvedAuditorTypeFor(submission) === auditorType);
  const cycleStarted =
    auditorType === "internal" ||
    relevant.length > 0 ||
    administrativeSubmissions.some(
      (submission) => normalizeUserRole(submission.reportCategory) === "internal" && submission.hasNextCycle
    );

  const submittedRows = [];
  const notSubmittedRows = [];
  if (!cycleStarted) return { submittedRows, notSubmittedRows };

  const submittedPostDates = new Map();
  relevant.forEach((submission) => {
    administrativeSubmittedPostsFor(submission).forEach((post) => {
      const postCode = canonicalAdministrativePost(post) || post;
      if (postCode && !submittedPostDates.has(postCode)) submittedPostDates.set(postCode, submission.submittedOn || null);
    });
  });

  Object.keys(adminUsersByPost).forEach((postCode) => {
    const adminUser = adminUsersByPost[postCode];
    const row = {
      name: adminUser?.name || "-",
      email: adminUser?.email || "-",
      secondary: ADMINISTRATIVE_POSTS.find((post) => post.value === postCode)?.label || postCode,
      date: submittedPostDates.get(postCode) || null,
    };
    (submittedPostDates.has(postCode) ? submittedRows : notSubmittedRows).push(row);
  });

  return { submittedRows, notSubmittedRows };
}

// Flattens a { submittedRows, notSubmittedRows } coverage object into a single list, tagging
// each row with its status so a table can render one status column instead of two buckets.
function combinedStatusRows(coverage) {
  return [
    ...coverage.submittedRows.map((row) => ({ ...row, status: "submitted" })),
    ...coverage.notSubmittedRows.map((row) => ({ ...row, status: "not_submitted" })),
  ];
}

const CARD_TONE_EYEBROW_COLOR = {
  forward: "#2563eb",
  approve: "#16a34a",
  academic: "#2563eb",
  administrative: "#2563eb",
  auditors: "#2563eb",
};

const TILE_TONE_COLORS = {
  blue: { bg: "#dbeafe", fg: "#2563eb" },
  green: { bg: "#dcfce7", fg: "#16a34a" },
  orange: { bg: "#ffedd5", fg: "#ea580c" },
};

function StatTileIcon({ name }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, style: { width: 18, height: 18 } };
  switch (name) {
    case "person":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.6" />
          <path d="M4.5 20c.6-4 3.8-6.5 7.5-6.5s6.9 2.5 7.5 6.5" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3l7 2.6v5.4c0 4.6-3 8.4-7 9.6-4-1.2-7-5-7-9.6V5.6L12 3z" />
        </svg>
      );
    case "checkCircle":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.6" />
          <path d="M8.2 12.2l2.6 2.6 5-5.2" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.6" />
          <path d="M12 7.4V12l3.2 1.9" />
        </svg>
      );
    case "document":
    default:
      return (
        <svg {...common}>
          <path d="M6 2.75h8l4 4V21.25H6z" />
          <path d="M14 2.75v4h4" />
        </svg>
      );
  }
}

function SubmissionStatCard({ eyebrow, title, tone = "forward", pills }) {
  const eyebrowColor = CARD_TONE_EYEBROW_COLOR[tone] || "#2563eb";
  const defaultTileTone = tone === "approve" ? "green" : "blue";
  return (
    <div className="app-surface-card submission-stat-card" style={styles.submissionStatCard}>
      {eyebrow && <span style={{ ...styles.submissionStatEyebrow, color: eyebrowColor }}>{eyebrow}</span>}
      <span style={styles.submissionStatTitle}>{title}</span>
      <div style={styles.submissionStatPills}>
        {pills.map((pill) => {
          const tileColors = TILE_TONE_COLORS[pill.tone] || TILE_TONE_COLORS[defaultTileTone];
          const tileContent = (
            <>
              <span style={{ ...styles.statTileIcon, background: tileColors.bg, color: tileColors.fg }}>
                <StatTileIcon name={pill.icon} />
              </span>
              <span style={styles.statTileText}>
                <strong style={styles.submissionStatValue}>{pill.value}</strong>
                <small style={styles.submissionStatLabel}>{pill.label}</small>
              </span>
            </>
          );
          return pill.onClick ? (
            <button key={pill.label} type="button" className="stat-tile-button" style={styles.submissionStatPillButton} onClick={pill.onClick}>
              {tileContent}
            </button>
          ) : (
            <span key={pill.label} style={styles.submissionStatPill}>
              {tileContent}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function SubmissionStatusBadge({ status }) {
  const submitted = status === "submitted";
  return (
    <span
      style={{
        ...styles.submissionStatusBadge,
        ...(submitted ? styles.submissionStatusBadgeSubmitted : styles.submissionStatusBadgeNotSubmitted),
      }}
    >
      <StatTileIcon name={submitted ? "checkCircle" : "clock"} />
      {submitted ? "Submitted" : "Not Submitted"}
    </span>
  );
}

// Renders one scrollable table for the given rows/column config. Shared by both the plain
// tabs (auditor lists) and the nested cycle sub-tabs (director/post lists) below.
function SubmissionsTable({ secondaryLabel, statusLabel, rows }) {
  return (
    <div style={styles.submissionsTableWrap}>
      <table style={styles.submissionsTable}>
        <thead>
          <tr>
            <th style={styles.submissionsTableTh}>Name</th>
            <th style={styles.submissionsTableTh}>Email</th>
            <th style={styles.submissionsTableTh}>{secondaryLabel}</th>
            <th style={styles.submissionsTableTh}>{statusLabel}</th>
            <th style={styles.submissionsTableTh}>Submitted On</th>
          </tr>
        </thead>
        <tbody>
          {!rows.length && (
            <tr>
              <td style={styles.submissionsTableEmpty} colSpan={5}>No records to show.</td>
            </tr>
          )}
          {rows.map((row, index) => (
            <tr key={`${row.email}-${row.secondary}-${index}`}>
              <td style={{ ...styles.submissionsTableTd, ...styles.submissionsTableTdStrong }}>{row.name || "-"}</td>
              <td style={styles.submissionsTableTd}>{row.email || "-"}</td>
              <td style={styles.submissionsTableTd}>{row.secondary || "-"}</td>
              <td style={styles.submissionsTableTd}><SubmissionStatusBadge status={row.status} /></td>
              <td style={styles.submissionsTableTd}>{row.status === "submitted" ? formatDate(row.date) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// A card with a row of top-level tabs. A tab either carries its own `rows` directly (the
// auditor tabs), or a `subTabs` list (the Director/Posts tab's Internal Cycle / External
// Cycle split) — each track is rendered from its own untouched coverage list rather than
// merging internal+external together, so a school/post/auditor never appears twice just
// because it has activity on both tracks, and one track's cast doesn't hide the other's.
function SubmissionsTableCard({ tabs }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeSubIndex, setActiveSubIndex] = useState(0);
  const activeTab = tabs[Math.min(activeIndex, tabs.length - 1)];
  const hasSubTabs = Array.isArray(activeTab.subTabs);
  const activeSubTab = hasSubTabs ? activeTab.subTabs[Math.min(activeSubIndex, activeTab.subTabs.length - 1)] : null;
  const leaf = hasSubTabs ? activeSubTab : activeTab;

  return (
    <div className="app-surface-card submissions-table-card" style={styles.submissionsTableCard}>
      <div style={styles.submissionsTableTabs}>
        {tabs.map((tab, index) => (
          <button
            key={tab.key}
            type="button"
            style={{ ...styles.submissionsTableTab, ...(index === activeIndex ? styles.submissionsTableTabActive : {}) }}
            onClick={(event) => {
              event.currentTarget.blur();
              setActiveIndex(index);
              setActiveSubIndex(0);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {hasSubTabs && (
        <div style={styles.submissionsTableSubTabs}>
          {activeTab.subTabs.map((subTab, index) => (
            <button
              key={subTab.key}
              type="button"
              style={{ ...styles.submissionsTableSubTab, ...(index === activeSubIndex ? styles.submissionsTableSubTabActive : {}) }}
              onClick={(event) => {
                event.currentTarget.blur();
                setActiveSubIndex(index);
              }}
            >
              {subTab.label}
            </button>
          ))}
        </div>
      )}
      <SubmissionsTable secondaryLabel={leaf.secondaryLabel} statusLabel={leaf.statusLabel} rows={leaf.rows} />
    </div>
  );
}

function AcademicAdministrativeSubmissionsPanel({
  academicSubmissions = [],
  administrativeSubmissions = [],
  loading = false,
  academicYear,
  availableYears: cycleAvailableYears = [],
}) {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  useEffect(() => {
    let isActive = true;
    fetchUsers()
      .then(({ data }) => {
        if (isActive) setUsers(userList(data).map(normalizeAuditor));
      })
      .catch(() => {
        if (isActive) setUsers([]);
      })
      .finally(() => {
        if (isActive) setLoadingUsers(false);
      });
    return () => {
      isActive = false;
    };
  }, []);

  const directorsBySchool = useMemo(() => mapUsersBySchool(usersForCategory(users, "academic")), [users]);
  const adminUsersByPost = useMemo(() => mapUsersByPost(usersForCategory(users, "administrative")), [users]);

  // Every year's IQAC dashboard route runs the same coverage math over the same
  // fetchAllSubmissions() feed — nothing upstream scopes it to a single academic year, so
  // starting a new year previously left last year's "Submitted" schools sitting alongside this
  // year's fresh "Not Submitted" ones (and left the external cycle showing only stale prior-year
  // rows instead of an honest empty state). Scoping both submission lists to one selected year
  // before any coverage function sees them fixes both at the source.
  const currentYear = compactAcademicYear(academicYear || "");
  const availableYears = useMemo(() => {
    const years = new Set(cycleAvailableYears.map(compactAcademicYear));
    if (currentYear) years.add(currentYear);
    academicSubmissions.forEach((submission) => years.add(compactAcademicYear(submission.auditCycle || currentYear)));
    administrativeSubmissions.forEach((submission) => years.add(compactAcademicYear(submission.auditCycle || currentYear)));
    return [...years].filter(Boolean).sort((first, second) => Number(second.slice(0, 4)) - Number(first.slice(0, 4)));
  }, [cycleAvailableYears, currentYear, academicSubmissions, administrativeSubmissions]);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  // The active academic year only ever changes when IQAC starts a new one (there's no other
  // way to get here mid-session) — when that happens, snap the dropdown to the new year so the
  // overview shows the fresh (all "Not Submitted") year by default instead of quietly staying
  // parked on whichever year was selected before the switch. Adjusted during render (React's
  // recommended pattern for syncing state to a changed prop) rather than in an effect, so the
  // switch is visible on the very render that receives the new year instead of one render later.
  const [trackedCurrentYear, setTrackedCurrentYear] = useState(currentYear);
  if (currentYear && currentYear !== trackedCurrentYear) {
    setTrackedCurrentYear(currentYear);
    setSelectedYear(currentYear);
  }
  const effectiveSelectedYear = selectedYear || currentYear;

  const yearAcademicSubmissions = useMemo(
    () => academicSubmissions.filter((submission) => compactAcademicYear(submission.auditCycle || currentYear) === effectiveSelectedYear),
    [academicSubmissions, currentYear, effectiveSelectedYear]
  );
  const yearAdministrativeSubmissions = useMemo(
    () => administrativeSubmissions.filter((submission) => compactAcademicYear(submission.auditCycle || currentYear) === effectiveSelectedYear),
    [administrativeSubmissions, currentYear, effectiveSelectedYear]
  );

  // Submissions and the auditor account list load via separate async fetches. Computing
  // "Submitted"/"Not Submitted" coverage before either has arrived would read empty arrays
  // and render every row as "Not Submitted" — a wrong-looking flash on every reload rather
  // than an honest loading state. Show a skeleton until both are in.
  if (loading || loadingUsers) {
    return (
      <section style={styles.panel}>
        <div style={styles.iqacOverviewHeader}>
          <div>
            <h1 style={styles.iqacOverviewTitle}>IQAC Dashboard Overview</h1>
            <p style={styles.iqacOverviewSubtitle}>Monitor forward items, approvals, submissions and auditor activities</p>
          </div>
        </div>
        <SkeletonList rows={5} />
      </section>
    );
  }

  const resolveSchoolContact = (submission) => {
    const code = canonicalSchoolCode(submission.school) || String(submission.school || "").trim().toUpperCase();
    const director = directorsBySchool[code];
    return { name: director?.name, email: director?.email, secondary: submission.school || director?.school || code };
  };
  const schoolsInternal = auditorTypeCoverageWithRows(yearAcademicSubmissions, "internal", resolveSchoolContact);
  const schoolsExternal = auditorTypeCoverageWithRows(yearAcademicSubmissions, "external", resolveSchoolContact);
  const adminInternal = administrativePostCoverageWithRows(yearAdministrativeSubmissions, "internal", adminUsersByPost);
  const adminExternal = administrativePostCoverageWithRows(yearAdministrativeSubmissions, "external", adminUsersByPost);

  // Director accounts that don't have a submission classified into an auditor cycle yet
  // (brand-new accounts, or a submitted-but-not-yet-forwarded form) default into the
  // "Internal ... Not Submitted" bucket instead of being invisible on the dashboard.
  // (Administrative posts don't need this fallback: administrativePostCoverageWithRows
  // already puts every post without a submitted section into "Not Submitted" directly.)
  appendUnclassifiedAccounts(
    schoolsInternal.notSubmittedRows,
    classifiedAcademicSchoolCodes(yearAcademicSubmissions),
    directorsBySchool,
    (code, director) => director.school || code
  );

  const externalCoveredSchoolCodes = new Set(
    yearAcademicSubmissions
      .filter((submission) => resolvedAuditorTypeFor(submission) === "external")
      .map((submission) => canonicalSchoolCode(submission.school) || String(submission.school || "").trim().toUpperCase())
  );
  appendStartedButUnfiledExternalCycles(
    schoolsExternal.notSubmittedRows,
    externalCoveredSchoolCodes,
    yearAcademicSubmissions,
    (submission) => canonicalSchoolCode(submission.school) || String(submission.school || "").trim().toUpperCase(),
    resolveSchoolContact
  );

  const academicInternalAuditor = auditorAccountCoverage(users, "internal", yearAcademicSubmissions, yearAdministrativeSubmissions, "academic");
  const academicExternalAuditor = auditorAccountCoverage(users, "external", yearAcademicSubmissions, yearAdministrativeSubmissions, "academic");
  const adminInternalAuditor = auditorAccountCoverage(users, "internal", yearAcademicSubmissions, yearAdministrativeSubmissions, "administrative");
  const adminExternalAuditor = auditorAccountCoverage(users, "external", yearAcademicSubmissions, yearAdministrativeSubmissions, "administrative");

  // Each track (internal/external) keeps its own untouched row list — nothing here merges
  // schoolsInternal with schoolsExternal, so a school/post/auditor can't show up twice just
  // because it has activity on both tracks.
  const schoolsInternalRows = combinedStatusRows(schoolsInternal);
  const schoolsExternalRows = combinedStatusRows(schoolsExternal);
  const postsInternalRows = combinedStatusRows(adminInternal);
  const postsExternalRows = combinedStatusRows(adminExternal);
  const academicInternalAuditorRows = combinedStatusRows(academicInternalAuditor);
  const academicExternalAuditorRows = combinedStatusRows(academicExternalAuditor);
  const adminInternalAuditorRows = combinedStatusRows(adminInternalAuditor);
  const adminExternalAuditorRows = combinedStatusRows(adminExternalAuditor);

  const allSubmissionsForApproval = [...yearAcademicSubmissions, ...yearAdministrativeSubmissions];
  const forwardInternalCount = pendingForwardCount(yearAcademicSubmissions, yearAdministrativeSubmissions, "internal");
  const forwardExternalCount = pendingForwardCount(yearAcademicSubmissions, yearAdministrativeSubmissions, "external");
  const approveInternalCount = pendingApproveCount(allSubmissionsForApproval, "internal");
  const approveExternalCount = pendingApproveCount(allSubmissionsForApproval, "external");

  const today = new Date();
  const todayLabel = today.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const weekdayLabel = today.toLocaleDateString("en-GB", { weekday: "long" });

  return (
    <section style={styles.panel}>
      <div style={styles.iqacOverviewHeader}>
        <div>
          <h1 style={styles.iqacOverviewTitle}>IQAC Dashboard Overview</h1>
          <p style={styles.iqacOverviewSubtitle}>Monitor forward items, approvals, submissions and auditor activities</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <label style={styles.yearFilter}>
            <span>Academic year</span>
            <select
              className="audit-control"
              value={effectiveSelectedYear}
              onChange={(event) => setSelectedYear(event.target.value)}
              style={styles.yearSelect}
            >
              {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <div style={styles.iqacDateCard}>
            <span style={styles.iqacDateIconWrap} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 18, height: 18 }}>
                <rect x="3" y="4.5" width="18" height="16" rx="2" />
                <path d="M16 2.5v4M8 2.5v4M3 10h18" />
              </svg>
            </span>
            <span>
              <strong style={styles.iqacDateStrong}>{todayLabel}</strong>
              <small style={styles.iqacDateWeekday}>{weekdayLabel}</small>
            </span>
          </div>
        </div>
      </div>

      <div style={styles.submissionsOverviewGrid}>
        <SubmissionStatCard
          eyebrow="Forward"
          title="Auditor Forward"
          tone="forward"
          pills={[
            { label: "Pending Forwards to Internal auditor", value: forwardInternalCount, icon: "document" },
            { label: "Pending Forwards to External auditor", value: forwardExternalCount, icon: "person" },
          ]}
        />
        <SubmissionStatCard
          eyebrow="Approve"
          title="IQAC Review Approval"
          tone="approve"
          pills={[
            { label: "Pending Approvals for Internal's review", value: approveInternalCount, icon: "shield" },
            { label: "Pending Approvals for External's review", value: approveExternalCount, icon: "shield" },
          ]}
        />
      </div>

      <h2 style={styles.iqacSectionHeading}>
        Academic Submissions
        <span style={styles.iqacSectionHeadingAccent} />
      </h2>
      <SubmissionsTableCard
        tabs={[
          {
            key: "directors",
            label: "Director",
            subTabs: [
              {
                key: "internal",
                label: "Internal Cycle",
                secondaryLabel: "School",
                statusLabel: "Internal Cycle Submission Status",
                rows: schoolsInternalRows,
              },
              {
                key: "external",
                label: "External Cycle",
                secondaryLabel: "School",
                statusLabel: "External Cycle Submission Status",
                rows: schoolsExternalRows,
              },
            ],
          },
          {
            key: "internalAuditor",
            label: "Internal Auditor",
            secondaryLabel: "Schools Assigned",
            statusLabel: "Submission Status",
            rows: academicInternalAuditorRows,
          },
          {
            key: "externalAuditor",
            label: "External Auditor",
            secondaryLabel: "Schools Assigned",
            statusLabel: "Submission Status",
            rows: academicExternalAuditorRows,
          },
        ]}
      />

      <h2 style={styles.iqacSectionHeading}>
        Administrative Submissions
        <span style={styles.iqacSectionHeadingAccent} />
      </h2>
      <SubmissionsTableCard
        tabs={[
          {
            key: "posts",
            label: "Posts",
            subTabs: [
              {
                key: "internal",
                label: "Internal Cycle",
                secondaryLabel: "Post",
                statusLabel: "Internal Cycle Submission Status",
                rows: postsInternalRows,
              },
              {
                key: "external",
                label: "External Cycle",
                secondaryLabel: "Post",
                statusLabel: "External Cycle Submission Status",
                rows: postsExternalRows,
              },
            ],
          },
          {
            key: "internalAuditor",
            label: "Internal Auditor",
            secondaryLabel: "Posts Assigned",
            statusLabel: "Submission Status",
            rows: adminInternalAuditorRows,
          },
          {
            key: "externalAuditor",
            label: "External Auditor",
            secondaryLabel: "Posts Assigned",
            statusLabel: "Submission Status",
            rows: adminExternalAuditorRows,
          },
        ]}
      />
    </section>
  );
}

function AdvancedOverviewPanel({ metrics, submissions, loading }) {
  const schoolProgress = buildSchoolProgress(submissions);
  const approvalRate = metrics.total ? Math.round((metrics.approved / metrics.total) * 100) : 0;

  return (
    <section style={styles.panel}>
      <div style={styles.pageTitleRow}>
        <div style={styles.blueHeading}>
          <span style={styles.cardEyebrow}>Detailed analytics</span>
          <h2 style={styles.sectionTitle}>Advanced Overview</h2>
          <p style={styles.progressIntro}>Expanded review status and school-level completion analysis.</p>
        </div>
        <span style={styles.schoolCount}>{schoolProgress.length} schools</span>
      </div>

      <div style={styles.metricGrid}>
        <MetricCard label="Submitted" value={metrics.submitted} hint="Waiting to enter review" tone="blue" />
        <MetricCard label="Under review" value={metrics["under-review"]} hint="Currently being assessed" tone="amber" />
        <MetricCard label="Auditor completed" value={metrics["auditor-completed"]} hint="Ready for final verification" tone="teal" />
        <MetricCard label="Approved" value={metrics.approved} hint={`${approvalRate}% overall approval`} tone="green" />
      </div>

      <SchoolProgressPanel schools={schoolProgress} loading={loading} />
    </section>
  );
}

function SchoolProgressPanel({ schools, loading }) {
  return (
    <div className="app-surface-card" style={styles.card}>
      <div style={styles.progressHeader}>
        <div>
          <span style={styles.cardEyebrow}>School analytics</span>
          <h3 style={styles.cardTitle}>School-wise Review Progress</h3>
          <p style={styles.progressIntro}>Approval progress across Academic and Administrative Audit submissions.</p>
        </div>
        <span style={styles.schoolCount}>{schools.length} schools</span>
      </div>
      <div style={styles.schoolProgressList}>
        {loading && <SkeletonList rows={3} />}
        {!loading && !schools.length && <div style={styles.emptyDraftNotice}>No school submissions available yet.</div>}
        {!loading && schools.map((school) => {
          const percentage = school.total ? Math.round((school.approved / school.total) * 100) : 0;
          return (
            <div className="review-school-progress-row" key={school.school} style={styles.schoolProgressRow}>
              <div style={styles.schoolProgressIdentity}>
                <span style={styles.schoolProgressAvatar}>{initialsFor(school.school)}</span>
                <span style={styles.schoolProgressName} title={school.school}>{school.school}</span>
              </div>
              <div style={styles.schoolProgressTrack} aria-label={`${school.school} ${percentage}% approved`}>
                <span style={{ ...styles.schoolProgressBar, width: `${percentage}%` }} />
              </div>
              <strong style={styles.schoolProgressPercent}>{percentage}%</strong>
              <span style={styles.schoolProgressMeta}>{school.approved} approved</span>
              <span style={styles.schoolProgressPending}>{school.pending} pending</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AuditReviewPanel({ auditType, submissions, activeGroup, onGroupChange, onOpen, onForward, onDownload, downloadingAttachmentsId, loading, resolveSubmitterAvatar, academicYear }) {
  const currentYear = compactAcademicYear(academicYear);
  const availableYears = useMemo(() => {
    const years = new Set([currentYear]);
    submissions.forEach((submission) => years.add(compactAcademicYear(submission.auditCycle || currentYear)));
    return [...years].filter(Boolean).sort((first, second) => Number(second.slice(0, 4)) - Number(first.slice(0, 4)));
  }, [currentYear, submissions]);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const effectiveSelectedYear = selectedYear || currentYear;
  const yearSubmissions = useMemo(
    () => submissions.filter((submission) => compactAcademicYear(submission.auditCycle || currentYear) === effectiveSelectedYear),
    [submissions, currentYear, effectiveSelectedYear]
  );
  const filtered = activeGroup === "all" ? yearSubmissions : yearSubmissions.filter((submission) => submission.group === activeGroup);
  const counts = {
    all: yearSubmissions.length,
    engineering: yearSubmissions.filter((submission) => submission.group === "engineering").length,
    nonEngineering: yearSubmissions.filter((submission) => submission.group === "nonEngineering").length,
  };
  const showGroupTabs = auditType === "academic";

  return (
    <section style={styles.panel}>
      <div style={styles.pageTitleRow}>
        <div style={styles.blueHeading}>
          <h2 style={styles.sectionTitle}>{auditLabels[auditType]} Reviews</h2>
        </div>
        <div style={styles.pageTitleActions}>
          <label style={styles.yearFilter}>
            <span>Academic year</span>
            <select
              className="audit-control"
              value={effectiveSelectedYear}
              onChange={(event) => setSelectedYear(event.target.value)}
              style={styles.yearSelect}
            >
              {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <span style={styles.schoolCount}>
            {auditType === "administrative"
              ? `${filtered.length} ${filtered.length === 1 ? "submission" : "submissions"}`
              : `${filtered.length} ${filtered.length === 1 ? "school" : "schools"}`}
          </span>
        </div>
      </div>

      {showGroupTabs && (
        <div style={styles.tabs} role="tablist" aria-label={`${auditLabels[auditType]} school groups`}>
          {groupTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              style={{ ...styles.tab, ...(activeGroup === tab.id ? styles.activeTab : {}) }}
              onClick={() => onGroupChange(tab.id)}
            >
              {tab.label}
              <span style={styles.tabCount}>{counts[tab.id]}</span>
            </button>
          ))}
        </div>
      )}

      <div style={styles.reviewList}>
        {loading && <SkeletonList rows={3} />}
        {!loading && !filtered.length && <div style={styles.emptyDraftNotice}>No {auditLabels[auditType]} submissions found.</div>}
        {filtered.map((submission) => (
          <SubmissionCard
            key={submission.id}
            submission={submission}
            onOpen={() => onOpen(submission)}
            onForward={onForward ? () => onForward(submission) : null}
            onDownload={onDownload ? () => onDownload(submission) : null}
            downloadingAttachments={downloadingAttachmentsId === submission.id}
            submitterAvatarUrl={resolveSubmitterAvatar?.(submission)}
          />
        ))}
      </div>
    </section>
  );
}

function AuditorFinalReviewPanel({ submissions, loading, onOpen, onDownload, downloadingAttachmentsId, resolveSubmitterAvatar }) {
  return (
    <section style={styles.panel}>
      <div style={styles.pageTitleRow}>
        <div style={styles.blueHeading}>
          <h2 style={styles.sectionTitle}>Auditor Final Review</h2>
        </div>
        <span style={styles.schoolCount}>{submissions.length} {submissions.length === 1 ? "form" : "forms"}</span>
      </div>

      <div style={styles.reviewList}>
        {loading && <SkeletonList rows={3} />}
        {!loading && !submissions.length && (
          <div style={styles.emptyDraftNotice}>No forms have been completed by an auditor yet.</div>
        )}
        {submissions.map((submission) => (
          <SubmissionCard
            key={`${submission.auditType}-${submission.id}`}
            submission={submission}
            onOpen={() => onOpen(submission)}
            onDownload={() => onDownload(submission)}
            downloadingAttachments={downloadingAttachmentsId === submission.id}
            submitterAvatarUrl={resolveSubmitterAvatar?.(submission)}
          />
        ))}
      </div>
    </section>
  );
}

function PreviousReportsPanel({
  submissions,
  academicYear,
  loading,
  onOpen,
  onStartNextCycle,
  startingNextCycleId,
  onDownload,
  downloadingAttachmentsId,
  resolveSubmitterAvatar,
}) {
  const [activeAuditType, setActiveAuditType] = useState("all");
  const [reportSubmission, setReportSubmission] = useState(null);
  const currentYear = compactAcademicYear(academicYear);
  const availableYears = useMemo(() => {
    const years = new Set([currentYear]);
    submissions.forEach((submission) => years.add(compactAcademicYear(submission.auditCycle || currentYear)));
    return [...years].sort((first, second) => Number(second.slice(0, 4)) - Number(first.slice(0, 4)));
  }, [currentYear, submissions]);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const auditTypeTabs = [
    { id: "all", label: "All Reports" },
    { id: "academic", label: "Academic" },
    { id: "administrative", label: "Administrative" },
  ];
  const yearSubmissions = submissions.filter(
    (submission) => compactAcademicYear(submission.auditCycle || currentYear) === selectedYear
  );
  const filteredSubmissions = activeAuditType === "all"
    ? yearSubmissions
    : yearSubmissions.filter((submission) => submission.auditType === activeAuditType);
  const sectionTitle = activeAuditType === "all"
    ? "All Audit Reports"
    : `${titleCase(activeAuditType)} Audit Reports`;
  const showingHistoricalYear = selectedYear !== currentYear;

  if (reportSubmission) {
    return (
      <PreviousReportOnlyView
        submission={reportSubmission}
        onBack={() => setReportSubmission(null)}
        onDownload={() => onDownload(reportSubmission)}
        downloadingAttachments={downloadingAttachmentsId === reportSubmission.id}
      />
    );
  }

  return (
    <section style={styles.panel}>
      <div style={styles.previousReportsHeader}>
        <div style={styles.previousReportsHeading}>
          <h2 style={styles.sectionTitle}>Previous Reports</h2>
          <p style={styles.previousReportsIntro}>Approved audit versions are preserved here as immutable historical records.</p>
        </div>
        <div style={styles.pageTitleActions}>
          <label style={styles.yearFilter}>
            <span>Academic year</span>
            <select
              className="audit-control"
              value={selectedYear}
              onChange={(event) => setSelectedYear(event.target.value)}
              style={styles.yearSelect}
            >
              {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <span style={styles.schoolCount}>{yearSubmissions.length} reports</span>
        </div>
      </div>

      {loading && <SkeletonList rows={3} />}
      {!loading && !yearSubmissions.length && (
        <div style={styles.emptyDraftNotice}>No approved reports are available for {selectedYear}.</div>
      )}

      {!loading && yearSubmissions.length > 0 && (
        <div style={styles.previousReportGroups}>
          <div style={styles.tabs} role="tablist" aria-label="Previous report types">
            {auditTypeTabs.map((tab) => {
              const count = tab.id === "all"
                ? yearSubmissions.length
                : yearSubmissions.filter((submission) => submission.auditType === tab.id).length;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeAuditType === tab.id}
                  style={{ ...styles.tab, ...(activeAuditType === tab.id ? styles.activeTab : {}) }}
                  onClick={() => setActiveAuditType(tab.id)}
                >
                  {tab.label}
                  <span style={styles.tabCount}>{count}</span>
                </button>
              );
            })}
          </div>

          <PreviousReportAuditSection
            key={`${selectedYear}-${activeAuditType}`}
            title={sectionTitle}
            reports={filteredSubmissions}
            onOpen={onOpen}
            onStartNextCycle={onStartNextCycle}
            startingNextCycleId={startingNextCycleId}
            onDownload={onDownload}
            downloadingAttachmentsId={downloadingAttachmentsId}
            onGenerateReport={setReportSubmission}
            reportOnly={showingHistoricalYear}
            resolveSubmitterAvatar={resolveSubmitterAvatar}
          />
        </div>
      )}
    </section>
  );
}

function PreviousReportAuditSection({
  title,
  reports,
  onOpen,
  onStartNextCycle,
  startingNextCycleId,
  onDownload,
  downloadingAttachmentsId,
  onGenerateReport,
  reportOnly = false,
  resolveSubmitterAvatar,
}) {
  const [activeCategory, setActiveCategory] = useState("internal");
  const categoryTabs = [
    { id: "internal", label: "Internal Audit" },
    { id: "external", label: "External Audit" },
  ];
  const filteredReports = reports.filter((submission) => submission.reportCategory === activeCategory);

  return (
    <section style={styles.previousReportGroup}>
      <div style={styles.previousReportSectionTitleRow}>
        <h3 style={styles.previousReportSectionTitle}>{title}</h3>
        <span style={styles.schoolCount}>{reports.length} reports</span>
      </div>

      <div style={styles.tabs} role="tablist" aria-label={`${title} categories`}>
        {categoryTabs.map((tab) => {
          const count = reports.filter((submission) => submission.reportCategory === tab.id).length;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeCategory === tab.id}
              style={{ ...styles.tab, ...(activeCategory === tab.id ? styles.activeTab : {}) }}
              onClick={() => setActiveCategory(tab.id)}
            >
              {tab.label}
              <span style={styles.tabCount}>{count}</span>
            </button>
          );
        })}
      </div>

      <div style={styles.reviewList}>
        {!filteredReports.length && (
          <div style={styles.previousReportEmpty}>No {activeCategory} audit reports.</div>
        )}
        {filteredReports.map((submission) => {
          const canStartNextCycle =
            !reportOnly &&
            activeCategory === "internal" &&
            !submission.hasNextCycle;
          return (
            <SubmissionCard
              key={`${submission.auditType}-${submission.id}`}
              submission={submission}
              onOpen={reportOnly ? null : () => onOpen(submission)}
              onStartNextCycle={canStartNextCycle ? () => onStartNextCycle(submission) : null}
              startingNextCycle={startingNextCycleId === submission.id}
              onDownload={() => onDownload(submission)}
              downloadingAttachments={downloadingAttachmentsId === submission.id}
              onGenerateReport={reportOnly ? () => onGenerateReport(submission) : null}
              submitterAvatarUrl={resolveSubmitterAvatar?.(submission)}
            />
          );
        })}
      </div>
    </section>
  );
}

function SubmissionCard({
  submission,
  onOpen,
  onForward,
  onStartNextCycle,
  startingNextCycle,
  onDownload,
  downloadingAttachments,
  onGenerateReport,
  submitterAvatarUrl,
}) {
  const forwardedAuditorCount = submission.forwardedToAuditorNames?.length || submission.forwardedToAuditorIds?.length || 0;
  const submitterInitials = submission.submittedBy && submission.submittedBy !== "-"
    ? initialsFor(submission.submittedBy)
    : initialsFor(submission.school);
  return (
    <article className="app-surface-card review-submission-card" style={styles.submissionCard}>
      <div style={styles.submissionTop}>
        <div style={styles.schoolAvatar}>
          {submitterAvatarUrl ? <img src={submitterAvatarUrl} alt="" style={styles.schoolAvatarImg} /> : submitterInitials}
        </div>
        <div style={styles.submissionTitleBlock}>
          <h3 style={styles.schoolName}>{submission.school}</h3>
          {(submission.auditType === "academic" || (submission.submittedBy && submission.submittedBy !== "-")) && (
            <p style={styles.schoolMeta}>
              {submission.auditType === "academic" ? "Director" : "Submitted by"}: {submission.submittedBy}
              {submission.submittedByDesignation ? ` · ${submission.submittedByDesignation}` : ""}
            </p>
          )}
          {submission.auditType === "academic" && (
            <small style={styles.schoolGroup}>{SCHOOL_GROUPS[submission.group]}</small>
          )}
        </div>
        <StatusBadge status={submission.status} />
      </div>

      <div style={styles.submissionInfoGrid}>
        <InfoPill label="Submitted on" value={formatDate(submission.submittedOn)} />
        <InfoPill label="Sections" value={submission.sections.length} />
        <InfoPill label="Attachments" value={submission.attachments.length} />
        {isApprovedReport(submission) && <InfoPill label="Audit type" value={auditLabels[submission.auditType]} />}
        {isApprovedReport(submission) && <InfoPill label="Audit category" value={`${titleCase(submission.reportCategory || "unclassified")} Audit`} />}
        {isApprovedReport(submission) && <InfoPill label="Cycle / Version" value={`${submission.auditCycle} / V${submission.version}`} />}
      </div>

      {submission.forwardedToAuditorName && (
        <div style={styles.forwardedNotice}>
          <span>Forwarded to {submission.forwardedAuditorType ? `${submission.forwardedAuditorType} auditor` : "auditor"}</span>
          <strong>{submission.forwardedToAuditorName}</strong>
          <small>
            {forwardedAuditorCount
              ? `${forwardedAuditorCount} matching auditor${forwardedAuditorCount === 1 ? "" : "s"}`
              : submission.forwardedToAuditorEmail}
          </small>
        </div>
      )}

      <AuditorProgressPanel submission={submission} compact />

      <div style={styles.cardActions}>
        {onForward && canForwardSubmissionToAuditor(submission) && !isAuditorCompleted(submission) && (
          <button type="button" className="btn btn-secondary" onClick={onForward}>
            {hasAuditorAssignment(submission) || ["UNDER_REVIEW", "FORWARDED_TO_INTERNAL_AUDITOR", "FORWARDED_TO_EXTERNAL_AUDITOR"].includes((submission.status || "").toUpperCase())
              ? "Change Auditor"
              : "Forward to Auditor"}
          </button>
        )}
        {onStartNextCycle && (
          <button type="button" className="btn btn-primary" onClick={onStartNextCycle} disabled={startingNextCycle} aria-busy={startingNextCycle}>
            {startingNextCycle && <InlineSpinner label="Starting next audit cycle" />}
            {startingNextCycle
              ? "Creating next cycle..."
              : submission.auditType === "administrative"
                ? "Start External Cycle"
                : "Start External Cycle"}
          </button>
        )}
        {onDownload && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onDownload}
            disabled={downloadingAttachments}
            aria-busy={downloadingAttachments}
          >
            {downloadingAttachments && <InlineSpinner label="Preparing attachment archive" />}
            {downloadingAttachments ? "Preparing ZIP..." : "Download Attachments"}
          </button>
        )}
        {onGenerateReport && (
          <button type="button" className="btn btn-primary" onClick={onGenerateReport}>
            Generate Report
          </button>
        )}
        {onOpen && <button type="button" className="btn btn-secondary" onClick={onOpen}>View Form</button>}
      </div>
    </article>
  );
}

function PreviousReportOnlyView({ submission, onBack, onDownload, downloadingAttachments }) {
  const previousInternalReport = (submission.versionHistory || [])
    .filter((entry) =>
      (
        String(entry.reportCategory || "").toLowerCase() === "internal" ||
        (
          String(submission.reportCategory || "").toLowerCase() === "external" &&
          Number(entry.version || 0) < Number(submission.version || 0)
        )
      ) &&
      (getSubmissionAuditorSignOff(entry).name || hasAcademicPartEValues(entry.values))
    )
    .sort((first, second) => Number(second.version || 0) - Number(first.version || 0))[0];
  const previousInternalAuditor = getSubmissionAuditorSignOff(previousInternalReport);
  const currentAuditor = getSubmissionAuditorSignOff(submission);

  return (
    <section style={styles.fullReviewPage}>
      <div className="review-report-actions" style={styles.cardActions}>
        <button type="button" className="btn btn-secondary" onClick={onBack}>Back</button>
        {onDownload && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onDownload}
            disabled={downloadingAttachments}
            aria-busy={downloadingAttachments}
          >
            {downloadingAttachments && <InlineSpinner label="Preparing attachment archive" />}
            {downloadingAttachments ? "Preparing ZIP..." : "Download Attachments"}
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print Report</button>
      </div>
      {submission.auditType === "academic" ? (
        <AuditReportPanel
          schema={academicAudit2025Schema}
          values={submission.values}
          tables={submission.tables}
          submissionSchool={submission.school}
          reportCategory={submission.reportCategory}
          auditorAssignments={submission.auditorAssignments || []}
          currentAuditor={currentAuditor}
          previousInternalAuditor={previousInternalAuditor}
          previousInternalValues={previousInternalReport?.values}
          iqacRemarks={submission.remarks}
          previousInternalMeta={
            previousInternalReport
              ? `${titleCase(previousInternalReport.reportCategory || "internal")} Audit - ${previousInternalReport.auditCycle} - V${previousInternalReport.version}`
              : ""
          }
        />
      ) : (
        <AdministrativeReportPanel
          meta={administrativeAuditMeta}
          modules={administrativeAuditModules}
          data={{ fields: submission.values, tables: submission.tables }}
          reportCategory={submission.reportCategory}
          auditorAssignments={submission.auditorAssignments || []}
          currentAuditor={currentAuditor}
          previousInternalAuditor={previousInternalAuditor}
          iqacRemarks={submission.remarks}
          onClose={onBack}
        />
      )}
    </section>
  );
}

function FullFormReview({
  submission,
  onBack,
  onRemarksChange,
  onApprove,
  onReturnToAuditor,
  onCompleteAuditorReview,
  reviewingStatus,
  canApprove,
  canReturnToAuditor,
  canEditAuditorSection,
  auditorReviewReadOnly,
  auditorCorrectionMode,
  showPreviousAuditorReference,
  currentProfile,
  submitterAvatarUrl,
}) {
  const sections = sectionsForAudit(submission.auditType);
  const previousInternalReport = (submission.versionHistory || [])
    .filter((entry) =>
      (
        String(entry.reportCategory || "").toLowerCase() === "internal" ||
        (
          String(submission.reportCategory || "").toLowerCase() === "external" &&
          Number(entry.version || 0) < Number(submission.version || 0)
        )
      ) &&
      (getSubmissionAuditorSignOff(entry).name || hasAcademicPartEValues(entry.values))
    )
    .sort((first, second) => Number(second.version || 0) - Number(first.version || 0))[0];
  const previousInternalAuditor = getSubmissionAuditorSignOff(previousInternalReport);
  const currentAuditor = getSubmissionAuditorSignOff(submission);
  const isExternalAcademicReport =
    submission.auditType === "academic" &&
    String(submission.reportCategory || "").toLowerCase() === "external";
  const shouldClearCopiedExternalPartE =
    isExternalAcademicReport &&
    canEditAuditorSection &&
    !auditorReviewReadOnly &&
    hasAcademicPartEValues(previousInternalReport?.values) &&
    academicPartEValuesMatch(submission.values, previousInternalReport.values);
  const currentUserAssignments = auditorAssignmentsForCurrentUser(submission, currentProfile);
  const isAdministrative = submission.auditType === "administrative";
  let currentAssignmentValues;
  let currentAssignmentAttachments;
  if (isAdministrative) {
    const activeAssignment = currentUserAssignments[0];
    if (activeAssignment) {
      const assignmentValues = safeObjectValue(activeAssignment.values);
      currentAssignmentValues = {
        auditObservations: assignmentValues.auditObservations !== undefined ? assignmentValues.auditObservations : "",
        auditRecommendations: assignmentValues.auditRecommendations !== undefined ? assignmentValues.auditRecommendations : "",
        auditDocumentation: assignmentValues.auditDocumentation !== undefined ? assignmentValues.auditDocumentation : "",
      };
      currentAssignmentAttachments = arrayValue(activeAssignment.attachments);
    } else {
      currentAssignmentValues = null;
      currentAssignmentAttachments = null;
    }
  } else {
    currentAssignmentValues = currentUserAssignments
      .map((assignment) => safeObjectValue(assignment.values))
      .find(hasAcademicPartEValues);
    currentAssignmentAttachments = uniqueAttachments(
      currentUserAssignments.flatMap((assignment) => [
        ...arrayValue(assignment.attachments).filter(isAttachmentValue),
        ...valueList(safeObjectValue(assignment.values).auditDocumentation).filter(isAttachmentValue),
      ])
    );
  }
  const shouldClearFreshAuditorDraft =
    canEditAuditorSection &&
    !auditorCorrectionMode &&
    !currentAssignmentValues &&
    !shouldClearCopiedExternalPartE;
  const initialDraftValues = currentAssignmentValues
    ? { ...(submission.values || {}), ...currentAssignmentValues }
    : shouldClearCopiedExternalPartE || shouldClearFreshAuditorDraft
      ? clearAcademicPartEValues(submission.values)
      : submission.values || {};
  const initialDraftAttachments = currentAssignmentValues
    ? currentAssignmentAttachments
    : shouldClearCopiedExternalPartE
      ? removeMatchingPartEAttachments(submission.attachments || [], previousInternalReport.values)
      : shouldClearFreshAuditorDraft
        ? []
        : submission.attachments || [];
  const [draftValues, setDraftValues] = useState(
    initialDraftValues
  );
  const [draftAttachments, setDraftAttachments] = useState(
    initialDraftAttachments
  );
  const [reviewRemarks, setReviewRemarks] = useState(reviewRemarksForDisplay(submission));
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [reportMode, setReportMode] = useState(false);
  const activeSection = sections[activeSectionIndex] || sections[0];
  const activeSectionIsAuditorOwned = activeSection ? isAuditorSection(activeSection, submission.auditType) : false;
  const canShowAuditorReviewValues = canEditAuditorSection || auditorReviewReadOnly || isAuditorCompleted(submission);
  const shouldHidePendingAuditorValues = activeSectionIsAuditorOwned && !canShowAuditorReviewValues;
  const submittedForm = {
    values: shouldHidePendingAuditorValues ? hidePendingAuditorReviewValues(draftValues) : draftValues,
    tables: submission.tables || {},
    hasSavedData: submission.hasSavedData,
  };
  const isLastSection = activeSectionIndex === sections.length - 1;
  const hasRemarks = Boolean(reviewRemarks.trim());
  const goToSection = (sectionIndex) => {
    setActiveSectionIndex(sectionIndex);
    scrollPageToTop();
  };
  const goToPreviousSection = () => {
    setActiveSectionIndex((index) => Math.max(0, index - 1));
    scrollPageToTop();
  };
  const goToNextSection = () => {
    setActiveSectionIndex((index) => Math.min(sections.length - 1, index + 1));
    scrollPageToTop();
  };
  const handleAuditorFieldChange = (fieldId, value) => {
    setDraftValues((current) => ({ ...current, [fieldId]: value }));
  };
  const handleAuditorFileUpload = async (fieldId, files) => {
    const uploaded = await uploadAttachments(files);
    setDraftValues((current) => ({
      ...current,
      [fieldId]: uniqueAttachments([
        ...valueList(current[fieldId]).filter(isAttachmentValue),
        ...uploaded,
      ]),
    }));
    setDraftAttachments((current) => uniqueAttachments([...current, ...uploaded]));
  };
  const handleAuditorFileDelete = async (fieldId, attachment) => {
    if (attachment?.url) await deleteAttachment(attachment);
    setDraftValues((current) => ({
      ...current,
      [fieldId]: valueList(current[fieldId])
        .filter(isAttachmentValue)
        .filter((file) => attachmentKeyFor(file) !== attachmentKeyFor(attachment)),
    }));
    setDraftAttachments((current) =>
      current.filter((file) => attachmentKeyFor(file) !== attachmentKeyFor(attachment))
    );
  };
  const previousInternalPartE =
    isExternalAcademicReport &&
    !showPreviousAuditorReference &&
    hasAcademicPartEValues(previousInternalReport?.values)
      ? previousInternalReport
      : null;

  useEffect(() => {
    if (!auditorCorrectionMode) return;
    const alertKey = `auditor-correction-${submission.id}-${submission.auditorCorrectionRequestedOn || ""}`;
    if (sessionStorage.getItem(alertKey)) return;
    window.alert("You should submit again after rectifying the mistake in your auditor review.");
    sessionStorage.setItem(alertKey, "shown");
  }, [auditorCorrectionMode, submission.auditorCorrectionRequestedOn, submission.id]);

  if (reportMode) {
    return (
      <section style={styles.fullReviewPage}>
        {submission.auditType === "academic" ? (
          <>
            <div className="review-report-actions" style={styles.cardActions}>
              <button type="button" className="btn btn-secondary" onClick={() => setReportMode(false)}>Close Report</button>
              <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print Report</button>
            </div>
            <AuditReportPanel
              schema={academicAudit2025Schema}
              values={submission.values}
              tables={submission.tables}
              submissionSchool={submission.school}
              reportCategory={submission.reportCategory}
              auditorAssignments={submission.auditorAssignments || []}
              currentAuditor={currentAuditor}
              previousInternalAuditor={previousInternalAuditor}
              previousInternalValues={previousInternalReport?.values}
              iqacRemarks={submission.remarks}
              previousInternalMeta={
                previousInternalReport
                  ? `${titleCase(previousInternalReport.reportCategory || "internal")} Audit - ${previousInternalReport.auditCycle} - V${previousInternalReport.version}`
                  : ""
              }
            />
          </>
        ) : (
          <AdministrativeReportPanel
            meta={administrativeAuditMeta}
            modules={administrativeAuditModules}
            data={{ fields: submission.values, tables: submission.tables }}
            reportCategory={submission.reportCategory}
            auditorAssignments={submission.auditorAssignments || []}
            currentAuditor={currentAuditor}
            previousInternalAuditor={previousInternalAuditor}
            iqacRemarks={submission.remarks}
            onClose={() => setReportMode(false)}
          />
        )}
      </section>
    );
  }

  return (
    <section style={styles.fullReviewPage}>
      <div style={styles.fullReviewHeader}>
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Back
        </button>
        <div style={styles.fullReviewTitleBlock}>
          <div style={styles.fullReviewTitleRow}>
            {submitterAvatarUrl && (
              <span style={styles.fullReviewAvatar}>
                <img src={submitterAvatarUrl} alt="" style={styles.fullReviewAvatarImg} />
              </span>
            )}
            <div style={{ minWidth: 0 }}>
              <p style={styles.kicker}>{auditLabels[submission.auditType]}</p>
              <h2 style={styles.fullReviewTitle}>{submission.school}</h2>
              <p style={styles.modalMeta}>
                {submission.auditType === "academic" ? "Director" : "Submitted by"}: {submission.submittedBy}
                {submission.submittedByDesignation ? ` · ${submission.submittedByDesignation}` : ""}
                {" · "}Submitted {formatDate(submission.submittedOn)}
              </p>
            </div>
          </div>
        </div>
        <StatusBadge status={submission.status} />
      </div>

      <AuditorProgressPanel submission={submission} />

      <SectionReviewNav
        sections={sections}
        activeIndex={activeSectionIndex}
        onChange={goToSection}
      />

      {auditorReviewReadOnly && (
        <div style={styles.readOnlyReviewNotice}>
          This auditor review has been submitted and is now read-only.
        </div>
      )}

      {auditorCorrectionMode && (
        <div style={styles.correctionNotice}>
          <strong>Correction requested by IQAC.</strong>
          <span>{submission.auditorCorrectionMessage || "Rectify the auditor review and submit it again."}</span>
        </div>
      )}

      {shouldHidePendingAuditorValues && (
        <div style={styles.readOnlyReviewNotice}>
          Auditor Part {auditorSectionNumberFor(submission.auditType)} is pending. Observations, recommendations and uploaded documentation will appear here after the assigned auditor submits.
        </div>
      )}

      {showPreviousAuditorReference && (
        <PreviousAuditorReference
          auditType={submission.auditType}
          history={submission.versionHistory || []}
        />
      )}

      <SubmittedFormViewer
        sections={sections}
        formData={submittedForm}
        auditType={submission.auditType}
        activeSectionIndex={activeSectionIndex}
        editableSection={canEditAuditorSection && activeSectionIsAuditorOwned}
        onFieldChange={handleAuditorFieldChange}
        onFileUpload={handleAuditorFileUpload}
        onFileDelete={handleAuditorFileDelete}
        auditorAssignments={submission.auditorAssignments || []}
        currentAuditorAssignments={currentUserAssignments}
        previousInternalPartEValues={previousInternalPartE?.values}
        previousInternalIqacRemarks={previousInternalPartE?.remarks}
        previousInternalPartEMeta={
          previousInternalPartE
            ? `${titleCase(previousInternalPartE.reportCategory || "internal")} Audit - ${previousInternalPartE.auditCycle} - V${previousInternalPartE.version}`
            : ""
        }
      />

      <div style={styles.fullReviewActions}>
        {auditorReviewReadOnly ? (
          <div style={styles.reviewPager}>
            <button type="button" className="btn btn-secondary" onClick={goToPreviousSection} disabled={activeSectionIndex === 0}>
              Previous
            </button>
            {!isLastSection && (
              <button type="button" className="btn btn-primary" onClick={goToNextSection}>
                Next
              </button>
            )}
          </div>
        ) : canEditAuditorSection && activeSectionIsAuditorOwned ? (
          <div style={styles.finalReviewPanel}>
            <div style={styles.finalActionRow}>
              <span style={styles.reviewHint}>Complete your assigned auditor observations and submit them for this assignment.</span>
              <button type="button" className="btn btn-primary" onClick={() => onCompleteAuditorReview(draftValues, draftAttachments)} disabled={Boolean(reviewingStatus)} aria-busy={reviewingStatus === "auditor-submit"}>
                {reviewingStatus === "auditor-submit" && <InlineSpinner label="Submitting auditor review" />}
                {reviewingStatus === "auditor-submit" ? "Submitting..." : "Submit My Auditor Review"}
              </button>
            </div>
          </div>
        ) : !isLastSection ? (
          <div style={styles.reviewPager}>
            <button type="button" className="btn btn-secondary" onClick={goToPreviousSection} disabled={activeSectionIndex === 0}>
              Previous
            </button>
            <button type="button" className="btn btn-primary" onClick={goToNextSection}>
              Next
            </button>
          </div>
        ) : (
          <div style={styles.finalReviewPanel}>
            {submission.status === "approved" ? (
              <>
                <div style={styles.readOnlyReviewNotice}>
                  This approved report is an immutable historical Version {submission.version}.
                </div>
                {reviewRemarksForDisplay(submission) && (
                  <div style={{ marginTop: 16, marginBottom: 16 }}>
                    <label style={styles.remarksLabel}>IQAC Review Remarks</label>
                    <div
                      style={{
                        padding: "14px 16px",
                        background: "#f8fafc",
                        border: "1px solid #cbd5e1",
                        borderRadius: 8,
                        fontSize: 14,
                        lineHeight: 1.6,
                        color: "#0f172a",
                        fontWeight: 500,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {reviewRemarksForDisplay(submission)}
                    </div>
                  </div>
                )}
                <div style={styles.finalActionRow}>
                  <span style={styles.reviewHint}>
                    {titleCase(submission.reportCategory || "unclassified")} Audit · {submission.auditCycle}
                  </span>
                  <button type="button" className="btn btn-secondary" onClick={() => setReportMode(true)}>
                    Generate Report
                  </button>
                </div>
              </>
            ) : (
              <>
                <label style={styles.remarksLabel}>
                  Review Remarks
                  <textarea
                    className="audit-control"
                    value={reviewRemarks}
                    onChange={(event) => {
                      setReviewRemarks(event.target.value);
                      onRemarksChange(event.target.value);
                    }}
                    placeholder="Write final approval remarks"
                    style={{ ...styles.remarksInput, minHeight: 120 }}
                  />
                </label>
                <div style={styles.finalActionRow}>
                  <span style={styles.reviewHint}>
                    {canApprove
                      ? "Approval is enabled after final remarks are written."
                      : "Auditor remarks are required before final review actions are available."}
                  </span>
                  <div style={styles.cardActions}>
                    {canReturnToAuditor && (
                      <button
                        type="button"
                        style={{
                          ...styles.returnToggleButton,
                          ...(reviewingStatus === "auditor-correction" ? styles.activeReturnToggleButton : {}),
                        }}
                        onClick={onReturnToAuditor}
                        disabled={Boolean(reviewingStatus)}
                        aria-pressed={reviewingStatus === "auditor-correction"}
                        aria-busy={reviewingStatus === "auditor-correction"}
                      >
                        {reviewingStatus === "auditor-correction" && <InlineSpinner label="Returning to auditor" />}
                        {reviewingStatus === "auditor-correction" ? "Returning..." : "Return to Auditor"}
                      </button>
                    )}
                    <button type="button" className="btn btn-primary" onClick={onApprove} disabled={!canApprove || !hasRemarks || Boolean(reviewingStatus)} aria-busy={reviewingStatus === "approved"}>
                      {reviewingStatus === "approved" && <InlineSpinner label="Approving form" />}
                      {reviewingStatus === "approved" ? "Approving..." : "Approve"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function PreviousAuditorReference({ auditType, history }) {
  const previousReview = [...history]
    .reverse()
    .find((entry) => isAuditorCompleted(entry) || getAuditorSignOff(entry.values).name);
  if (!previousReview) return null;

  const sections = sectionsForAudit(auditType);
  const auditorSectionIndex = Math.max(0, sections.findIndex((section) => isAuditorSection(section, auditType)));

  return (
    <details open style={styles.historyReference}>
      <summary style={styles.historyReferenceSummary}>
        Previous Auditor Observations
        <span style={styles.historyReferenceMeta}>
          {titleCase(previousReview.reportCategory || "internal")} Audit · {previousReview.auditCycle} · V{previousReview.version}
        </span>
      </summary>
      <div style={styles.historyReferenceBody}>
        <p style={styles.progressIntro}>
          Read-only reference from {previousReview.auditorReviewedBy || "the previous auditor"}.
          Current-cycle observations are stored separately.
        </p>
        {previousReview.remarks && (
          <div style={styles.partEReferenceBlock}>
            <h4 style={styles.partEReferenceTitle}>IQAC Internal Audit Review Remarks</h4>
            <p style={styles.reviewText}>{previousReview.remarks}</p>
          </div>
        )}
        <SubmittedFormViewer
          sections={sections}
          formData={{
            values: previousReview.values || {},
            tables: previousReview.tables || {},
            hasSavedData: true,
          }}
          auditType={auditType}
          activeSectionIndex={auditorSectionIndex}
          editableSection={false}
          onFieldChange={() => {}}
          onFileUpload={() => {}}
          onFileDelete={() => {}}
        />
      </div>
    </details>
  );
}

function SectionReviewNav({ sections, activeIndex, onChange }) {
  return (
    <nav style={styles.sectionNav} aria-label="Review form sections">
      {sections.map((section, index) => (
        <button
          key={section.id}
          type="button"
          style={{ ...styles.sectionNavButton, ...(index === activeIndex ? styles.activeSectionNavButton : {}) }}
          onClick={() => onChange(index)}
          title={section.title}
        >
          <span>{sectionLabelFor(section, index)}</span>
        </button>
      ))}
    </nav>
  );
}

function SubmittedFormViewer({
  sections,
  formData,
  auditType,
  activeSectionIndex,
  editableSection,
  onFieldChange,
  onFileUpload,
  onFileDelete,
  auditorAssignments = [],
  currentAuditorAssignments = [],
  previousInternalPartEValues,
  previousInternalIqacRemarks = "",
  previousInternalPartEMeta = "",
}) {
  const activeSection = sections[activeSectionIndex] || sections[0];
  const activeSectionIsAuditorOwned = activeSection ? isAuditorSection(activeSection, auditType) : false;
  const submittedAuditorAssignments = auditorAssignments.filter(auditorAssignmentSubmitted);
  const currentAssignmentKeys = new Set(currentAuditorAssignments.map((assignment) => assignment.key).filter(Boolean));
  const currentAssignmentIds = new Set(currentAuditorAssignments.map((assignment) => String(assignment.auditorId || "")).filter(Boolean));
  const currentAssignmentEmails = new Set(
    currentAuditorAssignments
      .map((assignment) => normalizeAuditAssignment(assignment.auditorEmail || assignment.email || ""))
      .filter(Boolean)
  );
  const submittedPeerAuditorAssignments = submittedAuditorAssignments.filter((assignment) => {
    const assignmentEmail = normalizeAuditAssignment(assignment.auditorEmail || assignment.email || "");
    if (assignment.key && currentAssignmentKeys.size) return !currentAssignmentKeys.has(assignment.key);
    if (assignment.auditorId && currentAssignmentIds.size) return !currentAssignmentIds.has(String(assignment.auditorId));
    return !(assignmentEmail && currentAssignmentEmails.has(assignmentEmail));
  });
  const showPreviousInternalPartE =
    auditType === "academic" &&
    activeSection?.id === ACADEMIC_PART_E_SECTION_ID &&
    hasAcademicPartEValues(previousInternalPartEValues);
  const showPreviousInternalPartF =
    auditType === "administrative" &&
    activeSection?.id === "section-f-observations-recommendations" &&
    submittedAuditorAssignments.some((a) => a.auditorType === "internal");
  const showSubmittedAuditorReviews =
    activeSectionIsAuditorOwned &&
    !editableSection &&
    submittedAuditorAssignments.length > 0;
  const showSubmittedPeerAuditorReviews =
    activeSectionIsAuditorOwned &&
    editableSection &&
    submittedPeerAuditorAssignments.length > 0;

  return (
    <div style={styles.formViewer}>
      {!formData.hasSavedData && (
        <div style={styles.emptyDraftNotice}>
          No saved {auditLabels[auditType]} draft was found in this browser yet. Once Director/Administrative user fills and saves the form, the complete content will appear here.
        </div>
      )}

      {activeSection && (
        <section key={activeSection.id} style={styles.reviewSection}>
          <h3 style={styles.reviewSectionTitle}>
            {activeSection.number ? `${activeSection.number}. ${activeSection.title}` : activeSection.title}
          </h3>
          {activeSection.note && <p style={styles.reviewSectionNote}>{activeSection.note}</p>}

          {blocksFor(activeSection).map((block, blockIndex) => {
            if (block.type === "fields") {
              if (showSubmittedAuditorReviews) {
                return (
                  <AuditorAssignmentReviewGrid
                    key={`${activeSection.id}-auditor-reviews-${blockIndex}`}
                    fields={block.fields}
                    assignments={submittedAuditorAssignments}
                    fallbackAuditorType={auditType}
                  />
                );
              }

              const currentFields = editableSection ? (
                <EditableFieldGrid
                  key={`${activeSection.id}-fields-${blockIndex}`}
                  fields={block.fields}
                  values={formData.values}
                  onFieldChange={onFieldChange}
                  onFileUpload={onFileUpload}
                  onFileDelete={onFileDelete}
                />
              ) : (
                <ReadOnlyFieldGrid
                  key={`${activeSection.id}-fields-${blockIndex}`}
                  fields={block.fields}
                  values={formData.values}
                />
              );
              const currentFieldsWithReferences = (
                <div style={styles.partEComparison}>
                  {showSubmittedPeerAuditorReviews && (
                    <div style={styles.partEReferenceBlock}>
                      <h4 style={styles.partEReferenceTitle}>Submitted External Auditor Reviews</h4>
                      <AuditorAssignmentReviewGrid
                        fields={block.fields}
                        assignments={submittedPeerAuditorAssignments}
                        fallbackAuditorType="external"
                      />
                    </div>
                  )}
                  {currentFields}
                </div>
              );

              if (showPreviousInternalPartE) {
                return (
                  <div key={`${activeSection.id}-part-e-comparison-${blockIndex}`} style={styles.partEComparison}>
                    <div style={styles.partEReferenceBlock}>
                      <div style={styles.partEReferenceHeader}>
                        <h4 style={styles.partEReferenceTitle}>Internal Auditor Part E - V1</h4>
                        {previousInternalPartEMeta && <span style={styles.partEReferenceMeta}>{previousInternalPartEMeta}</span>}
                      </div>
                      <ReadOnlyFieldGrid fields={block.fields} values={previousInternalPartEValues} />
                      {previousInternalIqacRemarks && (
                        <div>
                          <h4 style={styles.partEReferenceTitle}>IQAC Internal Audit Review Remarks</h4>
                          <p style={styles.reviewText}>{previousInternalIqacRemarks}</p>
                        </div>
                      )}
                    </div>
                    <div style={styles.partECurrentBlock}>
                      <h4 style={styles.partEReferenceTitle}>External Auditor Part E - Current External Audit</h4>
                      {currentFieldsWithReferences}
                    </div>
                  </div>
                );
              }

              if (showPreviousInternalPartF) {
                const internalAssignments = submittedAuditorAssignments.filter((a) => a.auditorType === "internal");
                return (
                  <div key={`${activeSection.id}-part-f-comparison-${blockIndex}`} style={styles.partEComparison}>
                    <div style={styles.partEReferenceBlock}>
                      <h4 style={styles.partEReferenceTitle}>Internal Auditor Observations & Recommendations</h4>
                      <AuditorAssignmentReviewGrid
                        fields={block.fields}
                        assignments={internalAssignments}
                        fallbackAuditorType="internal"
                      />
                    </div>
                    <div style={styles.partECurrentBlock}>
                      <h4 style={styles.partEReferenceTitle}>External Auditor Observations & Recommendations</h4>
                      {currentFields}
                    </div>
                  </div>
                );
              }

              return showSubmittedPeerAuditorReviews ? currentFieldsWithReferences : currentFields;
            }

            if (block.type === "text") {
              return (
                <p key={`${activeSection.id}-text-${blockIndex}`} style={styles.reviewText}>
                  {block.text}
                </p>
              );
            }

            if (block.type === "attachment-field") {
              return (
                <ReadOnlyFieldGrid
                  key={`${activeSection.id}-attachment-${block.id}`}
                  fields={[{ id: block.id, label: block.label }]}
                  values={formData.values}
                />
              );
            }

            if (block.type === "part-e-schools") {
              return (
                <AdministrativePartE
                  key={`${activeSection.id}-part-e-${blockIndex}`}
                  value={formData.values[block.fieldId]}
                  coursesOffered={formData.tables.coursesOffered || []}
                  readOnly
                />
              );
            }

            if (!Array.isArray(block.tables)) {
              return null;
            }

            return (
              <div key={`${activeSection.id}-tables-${blockIndex}`} style={styles.reviewTables}>
                {block.tables.map((table) => (
                  <ReadOnlyTable
                    key={table.id}
                    table={table}
                    rows={formData.tables[table.id] || []}
                    values={formData.values}
                  />
                ))}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

function EditableFieldGrid({ fields, values, onFieldChange, onFileUpload, onFileDelete }) {
  const [uploadingField, setUploadingField] = useState("");
  const [deletingKey, setDeletingKey] = useState("");
  const [fileError, setFileError] = useState("");

  const handleFilesSelected = async (fieldId, files) => {
    if (!files?.length) return;
    setUploadingField(fieldId);
    setFileError("");
    try {
      await onFileUpload(fieldId, files);
    } catch (error) {
      setFileError(error?.response?.data?.message || error?.message || "Could not upload documentation.");
    } finally {
      setUploadingField("");
    }
  };

  const handleFileDelete = async (fieldId, attachment) => {
    const key = `${fieldId}-${attachmentKeyFor(attachment)}`;
    setDeletingKey(key);
    setFileError("");
    try {
      await onFileDelete(fieldId, attachment);
    } catch (error) {
      setFileError(error?.response?.data?.message || error?.message || "Could not remove documentation.");
    } finally {
      setDeletingKey("");
    }
  };

  return (
    <div style={styles.readOnlyFieldGrid}>
      {fields.map((field) => {
        if (field.kind === "heading") {
          return (
            <h4 key={field.id} style={styles.reviewSubheading}>
              {field.label}
            </h4>
          );
        }

        if (field.type === "file") {
          const attachments = valueList(values[field.id]).filter(isAttachmentValue);
          const isUploading = uploadingField === field.id;

          return (
            <div key={field.id} style={styles.readOnlyWideField}>
              <span style={styles.readOnlyLabel}>{field.label}</span>
              <div style={styles.documentationUploader}>
                <label style={styles.documentationUploadButton}>
                  <input
                    type="file"
                    multiple
                    onChange={(event) => {
                      handleFilesSelected(field.id, event.target.files);
                      event.target.value = "";
                    }}
                    style={styles.hiddenFileInput}
                    disabled={isUploading}
                  />
                  {isUploading ? "Uploading..." : "Upload Documentation"}
                </label>
                <span style={styles.documentationHint}>PDF, Excel, Word, images, ZIP, or any supporting file.</span>
              </div>
              {!!attachments.length && (
                <div style={styles.documentationList}>
                  {attachments.map((attachment, index) => {
                    const key = `${field.id}-${attachmentKeyFor(attachment)}-${index}`;
                    const isDeleting = deletingKey === `${field.id}-${attachmentKeyFor(attachment)}`;
                    return (
                      <div key={key} style={styles.documentationItem}>
                        <div style={styles.documentationItemBody}>{renderValue(attachment)}</div>
                        <button
                          type="button"
                          style={styles.documentationDeleteButton}
                          onClick={() => handleFileDelete(field.id, attachment)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? "Removing..." : "Remove"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {fileError && <span style={styles.errorText}>{fileError}</span>}
            </div>
          );
        }

        const controlStyle = field.type === "textarea" ? styles.editableTextarea : styles.editableInput;

        return (
          <label key={field.id} style={field.type === "textarea" ? styles.readOnlyWideField : styles.readOnlyField}>
            <span style={styles.readOnlyLabel}>{field.label}</span>
            {field.type === "textarea" ? (
              <textarea
                className="audit-control"
                value={values[field.id] ?? ""}
                onChange={(event) => onFieldChange(field.id, event.target.value)}
                style={controlStyle}
                rows={5}
              />
            ) : (
              <input
                className="audit-control"
                type={field.type || "text"}
                value={values[field.id] ?? ""}
                onChange={(event) => onFieldChange(field.id, event.target.value)}
                style={controlStyle}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

function sectionLabelFor(section, index) {
  if (section.number) return `Part ${section.number}`;

  const partMatch = section.title.match(/^Part\s+[A-Z]/i);
  if (partMatch) return partMatch[0];

  return index === 0 ? "Info" : String(index + 1);
}

function ReadOnlyFieldGrid({ fields, values }) {
  return (
    <div style={styles.readOnlyFieldGrid}>
      {fields.map((field) => {
        if (field.kind === "heading") {
          return (
            <h4 key={field.id} style={styles.reviewSubheading}>
              {field.label}
            </h4>
          );
        }

        return (
          <div key={field.id} style={["textarea", "file"].includes(field.type) ? styles.readOnlyWideField : styles.readOnlyField}>
            <div style={styles.readOnlyLabel}>{field.label}</div>
            <div style={styles.readOnlyValue}>{renderValue(values[field.id])}</div>
          </div>
        );
      })}
    </div>
  );
}

function AuditorAssignmentReviewGrid({ fields, assignments, fallbackAuditorType }) {
  const visibleFields = fields.filter((field) => field.kind !== "heading");
  const displayAssignments = groupAuditorAssignmentsForDisplay(assignments);
  return (
    <div className="review-auditor-review-stack" style={styles.auditorReviewStack}>
      {displayAssignments.map((assignment, index) => {
        const values = safeObjectValue(assignment.values);
        const displayPost = (assignment.displayPosts || [assignment.post || assignment.school])
          .map(auditorAssignmentLabel)
          .join(", ");
        return (
          <section key={assignment.key} style={styles.auditorReviewCard}>
            <div style={styles.auditorReviewCardHeader}>
              <div style={styles.auditorReviewIdentity}>
                <span style={styles.auditorReviewNumber}>Auditor {index + 1}</span>
                <div style={styles.auditorReviewNameBlock}>
                  <h4 style={styles.auditorReviewTitle}>{assignment.auditorName || "Auditor Review"}</h4>
                  {assignment.auditorEmail && <p style={styles.auditorReviewEmail}>{assignment.auditorEmail}</p>}
                </div>
              </div>
              <div style={styles.auditorReviewChips}>
                <span style={styles.auditorReviewChip}>{titleCase(assignment.auditorType || fallbackAuditorType || "auditor")}</span>
                <span style={styles.auditorReviewChip}>{displayPost}</span>
                <span style={styles.auditorProgressDone}>
                  {assignment.submittedAt ? `Submitted ${formatDate(assignment.submittedAt)}` : "Submitted"}
                </span>
              </div>
            </div>
            <div className="review-auditor-review-fields" style={styles.auditorReviewFieldGrid}>
              {visibleFields.map((field) => (
                <div key={field.id} style={field.type === "file" ? styles.auditorReviewDocsField : styles.auditorReviewField}>
                  <div style={styles.readOnlyLabel}>{field.label}</div>
                  <div style={field.type === "file" ? styles.auditorReviewDocsValue : styles.auditorReviewValue}>
                    {renderValue(values[field.id])}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ReadOnlyTable({ table, rows, values }) {
  const columns = columnsWithSerial(table.columns);
  const visibleRows = rows.length ? rows : [columns.reduce((row, column) => ({ ...row, [column]: "" }), {})];

  return (
    <div style={styles.readOnlyTableBlock}>
      {table.showTitle !== false && <h4 style={styles.readOnlyTableTitle}>{table.title}</h4>}

      {!!table.notes?.length && (
        <div style={styles.readOnlyNotes}>
          {table.notes.map((note) => (
            <div key={note}>{note}</div>
          ))}
        </div>
      )}

      {!!table.fields?.length && (
        <div style={styles.readOnlyFieldGrid}>
          {table.fields.map((field) => (
            <div key={field.id} style={styles.readOnlyField}>
              <div style={styles.readOnlyLabel}>{field.label}</div>
              <div style={styles.readOnlyValue}>{renderValue(values[field.id])}</div>
            </div>
          ))}
        </div>
      )}

      <div style={styles.readOnlyScroller}>
        <table className="audit-data-table" style={styles.readOnlyTable}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} style={styles.readOnlyTh}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIndex) => (
              <tr key={`${table.id}-readonly-${rowIndex}`}>
                {columns.map((column) => (
                  <td key={column} style={styles.readOnlyTd}>
                    {renderValue(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderValue(value) {
  if (Array.isArray(value)) {
    return value.length ? (
      <div style={styles.attachmentList}>
        {value.map((file, index) => (
          <div key={`${file?.url || file?.name || "attachment"}-${index}`} style={styles.attachmentItem}>
            {renderValue(file)}
          </div>
        ))}
      </div>
    ) : "-";
  }

  if (isAttachmentValue(value)) {
    const name = value.name || value.fileName || value.filename || "Attachment";
    const url = value.url || value.publicUrl || value.downloadUrl;
    const canPreview = isBrowserPreviewableAttachment(value);
    return (
      <div style={styles.attachmentPreview}>
        <span style={styles.attachmentDocumentIcon} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 18, height: 18 }}>
            <path d="M6 2.75h8l4 4V21.25H6z" />
            <path d="M14 2.75v4h4" />
          </svg>
        </span>
        <span style={styles.attachmentDocumentDetails}>
          <strong style={styles.attachmentDocumentName} title={name}>{name}</strong>
          <small style={styles.mutedText}>{documentTypeLabel(value)}</small>
        </span>
        {url && canPreview ? (
          <a
            href={getAttachmentUrl(url)}
            target="_blank"
            rel="noreferrer"
            style={styles.attachmentLink}
            title="Open document"
          >
            Open
          </a>
        ) : url ? (
          <button
            type="button"
            style={styles.attachmentLink}
            title="Download document"
            onClick={() => downloadAttachmentFile(url, name)}
          >
            Download
          </button>
        ) : (
          <span style={styles.mutedText}>Link unavailable</span>
        )}
      </div>
    );
  }

  return String(value || "").trim() || "-";
}

function MetricCard({ label, value, hint, tone }) {
  const tones = {
    blue: { color: "#1d4ed8", background: "#dbeafe" },
    amber: { color: "#b45309", background: "#fef3c7" },
    teal: { color: "#0f766e", background: "#ccfbf1" },
    green: { color: "#15803d", background: "#dcfce7" },
  };
  const activeTone = tones[tone] || tones.blue;
  return (
    <div className="app-surface-card review-metric-card" style={styles.metricCard}>
      <div style={styles.metricTopRow}>
        <span style={{ ...styles.metricIndicator, ...activeTone }} aria-hidden="true" />
        <span style={styles.metricLabel}>{label}</span>
      </div>
      <strong style={styles.metricValue}>{value}</strong>
      <small style={styles.metricHint}>{hint}</small>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div style={styles.summaryRow}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InfoPill({ label, value }) {
  return (
    <div style={styles.infoPill}>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function auditorAssignmentLabel(value = "") {
  const option = ADMINISTRATIVE_POSTS.find((post) => post.value === value || normalizeAuditAssignment(post.label) === normalizeAuditAssignment(value));
  return option?.label || titleCase(value || "Assigned review");
}

const auditorDisplayKeyFor = (assignment = {}, index = 0) => {
  const type = normalizeUserRole(assignment.auditorType || assignment.type || "");
  const id = String(assignment.auditorId || assignment.userId || "").trim();
  if (id) return `id:${type}:${id}`;

  const email = normalizeAuditAssignment(assignment.auditorEmail || assignment.email || assignment.username || "");
  if (email) return `email:${type}:${email}`;

  return `assignment:${assignment.key || index}`;
};
const isEmptyReviewValue = (value) => {
  if (Array.isArray(value)) return value.length === 0;
  if (isAttachmentValue(value)) return false;
  if (value && typeof value === "object") return Object.keys(value).length === 0;
  return String(value || "").trim() === "";
};
const mergeAuditorReviewValues = (base = {}, next = {}) => {
  const merged = { ...base };
  Object.entries(next).forEach(([fieldId, value]) => {
    if (Array.isArray(merged[fieldId]) || Array.isArray(value)) {
      merged[fieldId] = uniqueAttachments([
        ...valueList(merged[fieldId]).filter(isAttachmentValue),
        ...valueList(value).filter(isAttachmentValue),
      ]);
      return;
    }
    if (isEmptyReviewValue(merged[fieldId]) && !isEmptyReviewValue(value)) {
      merged[fieldId] = value;
    }
  });
  return merged;
};
const auditorReviewDocumentation = (assignment = {}) => {
  const values = safeObjectValue(assignment.values || assignment.valuesData || assignment.reviewValues || assignment.reviewValuesData);
  return uniqueAttachments(valueList(values.auditDocumentation).filter(isAttachmentValue));
};
const groupAuditorAssignmentsForDisplay = (assignments = []) => {
  const groups = new Map();

  assignments.forEach((assignment, index) => {
    const key = auditorDisplayKeyFor(assignment, index);
    const existing = groups.get(key);
    const values = safeObjectValue(assignment.values || assignment.valuesData || assignment.reviewValues || assignment.reviewValuesData);
    const posts = uniqueValues(valueList(assignment.post || assignment.school));

    if (!existing) {
      groups.set(key, {
        ...assignment,
        displayPosts: posts,
        values,
        attachments: auditorReviewDocumentation(assignment),
        groupedAssignments: [assignment],
      });
      return;
    }

    existing.displayPosts = uniqueValues([...existing.displayPosts, ...posts]);
    existing.values = mergeAuditorReviewValues(existing.values, values);
    existing.attachments = uniqueAttachments([
      ...arrayValue(existing.attachments),
      ...auditorReviewDocumentation(assignment),
    ]);
    existing.groupedAssignments = [...existing.groupedAssignments, assignment];
    if (existing.groupedAssignments.every(auditorAssignmentSubmitted)) {
      existing.status = "submitted";
      existing.submittedAt = existing.submittedAt || assignment.submittedAt;
    } else {
      existing.status = "pending";
      existing.submittedAt = "";
    }
  });

  return [...groups.values()];
};

function AuditorProgressPanel({ submission, compact = false }) {
  const visibleAssignments = (submission.auditorAssignments || []).filter((assignment) =>
    auditorAssignmentBelongsToSubmission(assignment, submission)
  );
  // submission.auditorProgress is pre-scoped to this submission's own cycle by normalizeSubmission
  // (see the comment there); prefer it over recomputing from the merged auditorAssignments feed,
  // which can include a prior cycle's already-completed rows.
  const backendProgress = submission.auditorProgress || {};
  const progress = backendProgress.total ? backendProgress : buildAuditorProgress(visibleAssignments);
  if (!progress.total) return null;

  const percentage = Math.round((progress.submitted / progress.total) * 100);
  const pendingLabel = progress.pending
    ? `${progress.pending} pending`
    : "All submitted";

  return (
    <div style={compact ? styles.auditorProgressCompact : styles.auditorProgressPanel}>
      <div style={styles.auditorProgressHeader}>
        <div>
          <strong style={styles.auditorProgressTitle}>Auditor progress</strong>
          <span style={styles.auditorProgressSubtext}>{progress.submitted} / {progress.total} reviews submitted</span>
        </div>
        <span style={progress.pending ? styles.auditorProgressPending : styles.auditorProgressDone}>{pendingLabel}</span>
      </div>
      <div style={styles.auditorProgressTrack}>
        <span style={{ ...styles.auditorProgressBar, width: `${percentage}%` }} />
      </div>
      {!compact && (
        <div style={styles.auditorPostGrid}>
          {(progress.byPost || []).map((postProgress) => (
            <div key={postProgress.post} style={styles.auditorPostStatus}>
              <strong>{auditorAssignmentLabel(postProgress.post)}</strong>
              <span>{postProgress.submitted} / {postProgress.total} submitted</span>
            </div>
          ))}
        </div>
      )}
      {!compact && Boolean(visibleAssignments.length) && (
        <div style={styles.auditorAssignmentList}>
          {groupAuditorAssignmentsForDisplay(visibleAssignments).map((assignment) => {
            const reviewValues = safeObjectValue(assignment.values);
            const documents = uniqueAttachments(valueList(reviewValues.auditDocumentation).filter(isAttachmentValue));
            const displayPost = (assignment.displayPosts || [assignment.post || assignment.school])
              .map(auditorAssignmentLabel)
              .join(", ");
            return (
              <div key={assignment.key} className="review-auditor-assignment-row" style={styles.auditorAssignmentRow}>
                <div style={styles.auditorAssignmentMain}>
                  <strong>{assignment.auditorName}</strong>
                  {assignment.auditorEmail && <span>{assignment.auditorEmail}</span>}
                  <span>
                    {titleCase(assignment.auditorType || submission.forwardedAuditorType || "auditor")} - {displayPost}
                  </span>
                </div>
                <span style={auditorAssignmentSubmitted(assignment) ? styles.auditorProgressDone : styles.auditorProgressPending}>
                  {auditorAssignmentSubmitted(assignment) ? "Submitted" : "Pending"}
                </span>
                <div style={styles.auditorAssignmentDocs}>
                  {documents.length ? documents.map((file) => (
                    <a key={attachmentKeyFor(file)} href={getAttachmentUrl(file.url)} target="_blank" rel="noreferrer">
                      {file.name || file.fileName || "Documentation"}
                    </a>
                  )) : <span>No documentation uploaded</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const tone = statusStyles[status] || statusStyles.submitted;
  return (
    <span style={{ ...styles.statusBadge, color: tone.color, background: tone.background, borderColor: tone.border }}>
      {statusLabels[status] || status}
    </span>
  );
}

function NextAcademicYearModal({ currentAcademicYear, nextAcademicYear, loading, onConfirm, onCancel }) {
  return (
    <div style={styles.modalBackdrop} onClick={loading ? undefined : onCancel}>
      <div
        style={styles.nextYearModal}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="next-academic-year-title"
      >
        <div style={styles.nextYearHeader}>
          <span style={styles.forwardHeaderIcon}>AY</span>
          <div>
            <p style={styles.kicker}>Academic year transition</p>
            <h3 id="next-academic-year-title" style={styles.forwardModalTitle}>Start {nextAcademicYear}</h3>
            <p style={styles.modalMeta}>Current academic year: {currentAcademicYear}</p>
          </div>
        </div>

        <div style={styles.nextYearWarning}>
          Active forms will restart from the beginning for Directors and Administrative authorities.
          Approved reports and version history will remain unchanged.
        </div>

        <div style={styles.nextYearChecklist}>
          <span>Blank active Academic and Administrative forms</span>
          <span>Clear active auditor assignments and current remarks</span>
          <span>Preserve Previous Reports and approved audit history</span>
        </div>

        <div style={styles.forwardFooter}>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={loading} aria-busy={loading}>
            {loading && <InlineSpinner label="Starting next academic year" />}
            {loading ? "Starting..." : `Confirm ${nextAcademicYear}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ApprovalCategoryModal({ submission, selectedCategory, onCategoryChange, approving, onApprove, onCancel }) {
  const archiveVersion = reportVersionForCategory(selectedCategory || submission.forwardedAuditorType || submission.reportCategory, submission.version);
  return (
    <div style={styles.modalBackdrop} onClick={approving ? undefined : onCancel}>
      <div style={styles.forwardModal} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="approval-category-title">
        <div style={styles.forwardModalHeader}>
          <div style={styles.forwardHeaderMain}>
            <span style={styles.forwardHeaderIcon}>AR</span>
            <div>
              <h3 id="approval-category-title" style={styles.forwardModalTitle}>Archive approved report</h3>
              <p style={styles.forwardModalMeta}>{submission.school} · {auditLabels[submission.auditType]}</p>
            </div>
          </div>
          <button type="button" style={styles.iconCloseButton} onClick={onCancel} aria-label="Close approval dialog" disabled={approving}>
            ×
          </button>
        </div>

        <div style={styles.forwardStep}>
          <div style={styles.forwardStepHeading}>
            <span style={styles.forwardStepBadge}>1</span>
            <div>
              <h4 style={styles.forwardStepTitle}>Choose report category</h4>
              <p style={styles.forwardStepHint}>The approved version will be stored in Previous Reports under this category.</p>
            </div>
          </div>
          <div style={styles.forwardTypeRow}>
            {[
              { value: "internal", label: "Internal Audit" },
              { value: "external", label: "External Audit" },
            ].map((category) => (
              <button
                key={category.value}
                type="button"
                style={{ ...styles.forwardTypeButton, ...(selectedCategory === category.value ? styles.activeForwardTypeButton : {}) }}
                onClick={() => onCategoryChange(category.value)}
                disabled={approving}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.approvalArchiveNote}>
          Approval creates an immutable Version {archiveVersion} historical report. Starting another cycle will create a linked successor.
        </div>

        <div style={styles.forwardFooter}>
          <button type="button" onClick={onCancel} style={styles.forwardCancelButton} disabled={approving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={onApprove} disabled={!selectedCategory || approving} aria-busy={approving}>
            {approving && <InlineSpinner label="Approving and archiving report" />}
            {approving ? "Approving..." : "Approve & Archive"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReturnToAuditorModal({
  submission,
  message,
  onMessageChange,
  selectedAssignmentKeys,
  onSelectedAssignmentKeysChange,
  returning,
  onReturn,
  onCancel,
}) {
  const hasMessage = Boolean(message.trim());
  const correctionAssignments = auditorAssignmentsForCorrection(submission);
  const selectedKeySet = new Set(selectedAssignmentKeys.map(String));
  const selectedAssignments = correctionAssignments.filter((assignment) => selectedKeySet.has(String(assignment.key)));
  const allSelected = correctionAssignments.length > 0 && selectedAssignments.length === correctionAssignments.length;
  const targetAuditorType = normalizeUserRole(
    submission.forwardedAuditorType ||
    auditorTypeForReportCategory(submission.reportCategory) ||
    ""
  );
  const toggleAssignment = (assignmentKey) => {
    const normalizedKey = String(assignmentKey);
    onSelectedAssignmentKeysChange(
      selectedKeySet.has(normalizedKey)
        ? selectedAssignmentKeys.filter((key) => String(key) !== normalizedKey)
        : [...selectedAssignmentKeys, normalizedKey]
    );
  };

  return (
    <div style={styles.modalBackdrop} onClick={returning ? undefined : onCancel}>
      <div style={styles.forwardModal} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="return-auditor-title">
        <div style={styles.forwardModalHeader}>
          <div style={styles.forwardHeaderMain}>
            <span style={styles.forwardHeaderIcon}>RA</span>
            <div>
              <p style={styles.kicker}>Auditor correction</p>
              <h3 id="return-auditor-title" style={styles.forwardModalTitle}>Return to Auditor</h3>
              <p style={styles.forwardModalMeta}>{submission.school} &middot; {auditLabels[submission.auditType]}</p>
            </div>
          </div>
          <button type="button" style={styles.iconCloseButton} onClick={onCancel} aria-label="Close return to auditor dialog" disabled={returning}>
            x
          </button>
        </div>

        <div style={styles.forwardStep}>
          <div style={styles.forwardStepHeading}>
            <span style={styles.forwardStepBadge}>1</span>
            <div>
              <h4 style={styles.forwardStepTitle}>Choose auditors to return</h4>
              <p style={styles.forwardStepHint}>
                Select only the {targetAuditorType || "assigned"} auditor reviews that need correction.
              </p>
            </div>
          </div>

          {correctionAssignments.length ? (
            <>
              <div style={styles.forwardGroupSummary}>
                <strong>{correctionAssignments.length} assigned auditor{correctionAssignments.length === 1 ? "" : "s"} available</strong>
                <span>Only selected auditors will be able to edit and resubmit.</span>
                <div style={styles.auditorSelectionTools}>
                  <button
                    type="button"
                    style={styles.auditorSelectionButton}
                    onClick={() => onSelectedAssignmentKeysChange(correctionAssignments.map((assignment) => assignment.key))}
                    disabled={allSelected || returning}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    style={styles.auditorSelectionButton}
                    onClick={() => onSelectedAssignmentKeysChange([])}
                    disabled={!selectedAssignments.length || returning}
                  >
                    Clear
                  </button>
                  <span>{selectedAssignments.length} selected</span>
                </div>
              </div>

              <div style={styles.auditorList}>
                {correctionAssignments.map((assignment, index) => {
                  const isSelected = selectedKeySet.has(String(assignment.key));
                  return (
                    <label
                      key={assignment.key || `${assignment.auditorEmail}-${index}`}
                      style={{
                        ...styles.auditorOption,
                        ...(isSelected ? styles.selectedAuditorOption : {}),
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleAssignment(assignment.key)}
                        disabled={returning}
                        style={styles.auditorCheckbox}
                      />
                      <span style={styles.auditorAvatar}>{initialsFor(assignment.auditorName)}</span>
                      <span style={styles.auditorOptionBody}>
                        <strong>{assignment.auditorName}</strong>
                        <small>{assignment.auditorEmail}</small>
                        <small>
                          {titleCase(assignment.auditorType || "Auditor")}
                          {assignment.school ? ` - ${assignment.school}` : assignment.post ? ` - ${assignment.post}` : ""}
                        </small>
                      </span>
                      <span style={styles.auditorAssignText}>
                        {isSelected ? "Selected" : "Select"}
                      </span>
                    </label>
                  );
                })}
              </div>
            </>
          ) : (
            <div style={styles.forwardEmptyState}>
              <strong>No auditor assignments found</strong>
              <small>This review does not have explicit auditor assignments to return.</small>
            </div>
          )}
        </div>

        <div style={styles.forwardStep}>
          <div style={styles.forwardStepHeading}>
            <span style={styles.forwardStepBadge}>2</span>
            <div>
              <h4 style={styles.forwardStepTitle}>Correction instructions</h4>
              <p style={styles.forwardStepHint}>This message is shown only to the selected auditors.</p>
            </div>
          </div>
          <label style={styles.remarksLabel}>
            Message for auditor
            <textarea
              className="audit-control"
              value={message}
              onChange={(event) => onMessageChange(event.target.value)}
              placeholder="Write what the auditor must rectify before resubmitting."
              style={{ ...styles.remarksInput, minHeight: 130 }}
              disabled={returning}
            />
          </label>
        </div>

        <div style={styles.returnModalNotice}>
          The Director or Administrative submitter will not be asked to resubmit. Only selected auditors must submit again after correcting the review.
        </div>

        <div style={styles.forwardFooter}>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={returning}>
            Cancel
          </button>
          <button type="button" style={styles.returnToggleButton} onClick={onReturn} disabled={!hasMessage || !selectedAssignments.length || returning} aria-busy={returning}>
            {returning && <InlineSpinner label="Returning to auditor" />}
            {returning ? "Returning..." : `Return Selected (${selectedAssignments.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ForwardAuditorModal({ submission, auditors, loading, selectedType, onTypeChange, forwardingId, onForward, onCancel }) {
  const [selectedAuditorIds, setSelectedAuditorIds] = useState([]);
  const requiredAuditorType = auditorTypeForReportCategory(submission.reportCategory);
  const auditorTypes = [
    { value: "internal", label: "Internal", detail: "Auditors from within the university" },
    { value: "external", label: "External", detail: "Auditors from outside the university" },
  ].filter((type) => !requiredAuditorType || type.value === requiredAuditorType);
  const matchingAuditors = selectedType
    ? auditors.filter((auditor) => auditor.auditorType === selectedType && matchesSubmissionAssignment(auditor, submission))
    : [];
  const selectedAuditors = matchingAuditors.filter((auditor) => selectedAuditorIds.includes(String(auditor.id)));
  const allSelected = matchingAuditors.length > 0 && selectedAuditors.length === matchingAuditors.length;
  const administrativeAssignment = administrativeSubmittedPostsFor(submission)
    .map((post) => ADMINISTRATIVE_POSTS.find((option) => option.value === post)?.label || post)
    .join(", ");
  const assignmentLabel = submission.auditType === "academic"
    ? submission.school
    : (administrativeAssignment || submission.submittedByDesignation || submission.school || "Administrative submission");

  const toggleAuditor = (auditorId) => {
    const normalizedId = String(auditorId);
    setSelectedAuditorIds((current) =>
      current.includes(normalizedId)
        ? current.filter((id) => id !== normalizedId)
        : [...current, normalizedId]
    );
  };
  const selectAuditorType = (auditorType) => {
    setSelectedAuditorIds([]);
    onTypeChange(auditorType);
  };

  return (
    <div style={styles.modalBackdrop} onClick={onCancel}>
      <div style={styles.forwardModal} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="forward-auditor-title">
        <div style={styles.forwardModalHeader}>
          <div style={styles.forwardHeaderMain}>
            <span style={styles.forwardHeaderIcon}>AU</span>
            <div>
              <p style={styles.kicker}>Auditor review</p>
              <h3 id="forward-auditor-title" style={styles.forwardModalTitle}>Forward submission to auditor</h3>
              <p style={styles.modalMeta}>
                {auditLabels[submission.auditType]} - {assignmentLabel}
              </p>
            </div>
          </div>
          <div style={styles.forwardHeaderActions}>
            <StatusBadge status={submission.status} />
            <button type="button" style={styles.iconCloseButton} onClick={onCancel} aria-label="Close auditor forwarding modal" disabled={Boolean(forwardingId)}>
              ×
            </button>
          </div>
        </div>

        <div style={styles.forwardStep}>
          <div style={styles.forwardStepHeading}>
            <span style={styles.forwardStepBadge}>1</span>
            <div>
              <h4 style={styles.forwardStepTitle}>Choose auditor type</h4>
              <p style={styles.forwardStepHint}>The selected group will be matched against this submission assignment.</p>
            </div>
          </div>
          <div style={styles.forwardTypeRow}>
            {auditorTypes.map((type) => (
              <button
                key={type.value}
                type="button"
                style={{ ...styles.forwardTypeButton, ...(selectedType === type.value ? styles.activeForwardTypeButton : {}) }}
                onClick={() => selectAuditorType(type.value)}
              >
                <strong>{type.label}</strong>
                <span>{type.detail}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={styles.forwardStep}>
          <div style={styles.forwardStepHeading}>
            <span style={styles.forwardStepBadge}>2</span>
            <div>
              <h4 style={styles.forwardStepTitle}>Forward to matching auditor group</h4>
              <p style={styles.forwardStepHint}>Only auditors assigned to the same {submission.auditType === "academic" ? "school" : "administrative post"} are shown.</p>
            </div>
          </div>
          {!selectedType ? (
            <div style={styles.forwardEmptyState}>
              <span style={styles.forwardEmptyIcon}>1</span>
              <strong>Select {requiredAuditorType ? titleCase(requiredAuditorType) : "Internal or External"}</strong>
              <small>Matching auditors will appear here after choosing the auditor type.</small>
            </div>
          ) : loading ? (
            <div style={styles.forwardEmptyState}>
              <span style={styles.forwardEmptyIcon}>…</span>
              <strong>Loading auditor accounts</strong>
              <small>Please wait while the matching accounts are fetched.</small>
            </div>
          ) : matchingAuditors.length ? (
            <>
              <div style={styles.forwardGroupSummary}>
                <strong>{matchingAuditors.length} {selectedType} auditor{matchingAuditors.length === 1 ? "" : "s"} matched</strong>
                <span>Select specific auditors or forward the form to everyone in this matching group.</span>
                <div style={styles.auditorSelectionTools}>
                  <button
                    type="button"
                    style={styles.auditorSelectionButton}
                    onClick={() => setSelectedAuditorIds(matchingAuditors.map((auditor) => String(auditor.id)))}
                    disabled={allSelected || Boolean(forwardingId)}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    style={styles.auditorSelectionButton}
                    onClick={() => setSelectedAuditorIds([])}
                    disabled={!selectedAuditors.length || Boolean(forwardingId)}
                  >
                    Clear
                  </button>
                  <span>{selectedAuditors.length} selected</span>
                </div>
              </div>
              <div style={styles.auditorList}>
                {matchingAuditors.map((auditor) => {
                  const auditorSchools = academicSchoolsFor(auditor);
                  const forwardedSchool = canonicalSchoolCode(submission.school) || submission.school;
                  return (
                    <label
                      key={auditor.id}
                      style={{
                        ...styles.auditorOption,
                        ...(selectedAuditorIds.includes(String(auditor.id)) ? styles.selectedAuditorOption : {}),
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedAuditorIds.includes(String(auditor.id))}
                        onChange={() => toggleAuditor(auditor.id)}
                        disabled={Boolean(forwardingId)}
                        style={styles.auditorCheckbox}
                      />
                      <span style={styles.auditorAvatar}>{initialsFor(auditor.name)}</span>
                      <span style={styles.auditorOptionBody}>
                        <strong>{auditor.name}</strong>
                        <small>{auditor.email}</small>
                        {submission.auditType === "academic" ? (
                          <span style={styles.forwardSchoolBadgeList}>
                            {auditorSchools.length ? auditorSchools.map((school) => {
                              const matched = assignmentMatches(school, forwardedSchool, schoolAliasesFor);
                              return (
                                <span
                                  key={school}
                                  style={{ ...styles.forwardSchoolBadge, ...(matched ? styles.forwardMatchedSchoolBadge : {}) }}
                                  title={schoolLabelFor(school)}
                                >
                                  {school}
                                </span>
                              );
                            }) : <small>{auditor.school}</small>}
                          </span>
                        ) : (
                          <small>{auditor.assignment}</small>
                        )}
                      </span>
                      <span style={styles.auditorAssignText}>
                        {selectedAuditorIds.includes(String(auditor.id)) ? "Selected" : "Select"}
                      </span>
                    </label>
                  );
                })}
              </div>
              <div style={styles.forwardSelectionActions}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onForward(selectedType, selectedAuditors)}
                  disabled={!selectedAuditors.length || Boolean(forwardingId)}
                >
                  {forwardingId === selectedType ? "Forwarding..." : `Forward Selected (${selectedAuditors.length})`}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={styles.forwardPrimaryButton}
                  onClick={() => onForward(selectedType, matchingAuditors)}
                  disabled={Boolean(forwardingId)}
                >
                  {forwardingId === selectedType ? "Forwarding..." : `Forward to All (${matchingAuditors.length})`}
                </button>
              </div>
            </>
          ) : (
            <div style={styles.forwardErrorState}>
              <span style={styles.forwardErrorIcon}>!</span>
              <div>
                <strong>No matching {selectedType} auditor found</strong>
                <small>
                  Create the auditor account from User Management with the same {submission.auditType === "academic" ? "school" : "administrative post"}: {assignmentLabel}.
                </small>
              </div>
            </div>
          )}
        </div>

        <div style={styles.forwardFooter}>
          <span>Forwarding keeps IQAC in control while auditors review assigned sections.</span>
          <button type="button" onClick={onCancel} style={styles.forwardCancelButton} disabled={Boolean(forwardingId)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function LogoutModal({ onCancel, onConfirm }) {
  return (
    <div style={styles.modalBackdrop} onClick={onCancel}>
      <div style={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div style={styles.modalTitle}>Confirm Logout</div>
        <div style={styles.modalText}>You are about to leave the School Appraisal review dashboard.</div>
        <div style={styles.modalActions}>
          <button type="button" onClick={onCancel} style={styles.cancelButton}>Cancel</button>
          <button type="button" onClick={onConfirm} style={styles.confirmButton}>Logout</button>
        </div>
      </div>
    </div>
  );
}

function PrintStyles() {
  return (
    <style>{`
      @media (max-width: 900px) {
        .review-dashboard-shell { flex-direction: column; }
        .review-dashboard-main { padding: 18px !important; }
      }
      @media (max-width: 700px) {
        .review-auditor-assignment-row {
          grid-template-columns: 1fr !important;
        }
        .review-auditor-review-stack,
        .review-auditor-review-fields {
          grid-template-columns: 1fr !important;
        }
      }
      @media print {
        .app-sidebar,
        .btn,
        .review-error-notice {
          display: none !important;
        }
        .review-dashboard-shell {
          display: block !important;
          background: #fff !important;
        }
        .review-dashboard-main {
          padding: 0 !important;
          width: 100% !important;
          margin-left: 0 !important;
        }
        body {
          background: #fff !important;
        }
      }
      .review-dashboard-main .btn:disabled {
        opacity: .5;
        cursor: not-allowed;
        transform: none !important;
        box-shadow: none !important;
      }
    `}</style>
  );
}

function formatDate(value) {
  return formatDateDDMMYYYY(value);
}

const styles = {
  shell: {
    minHeight: "100vh",
    display: "flex",
    background: "#f5f7fb",
    color: "#0f172a",
    fontFamily: "Inter, 'Segoe UI', sans-serif",
  },
  page: {
    minHeight: "100vh",
    flex: 1,
    background: "#f5f7fb",
    padding: "28px 30px 40px",
    overflowX: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
    padding: "24px 26px",
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    background: "#fff",
    boxShadow: "0 10px 35px rgba(15, 23, 42, 0.055)",
    marginBottom: 22,
  },
  headerContent: {
    display: "flex",
    alignItems: "center",
    gap: 18,
  },
  logoWrap: {
    width: 76,
    height: 76,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    border: "1px solid #e7edf5",
    borderRadius: 14,
    background: "#f8fafc",
  },
  logo: {
    width: 62,
    height: 62,
    objectFit: "contain",
  },
  headerIqacLogo: {
    height: 84,
    width: "auto",
    objectFit: "contain",
    flexShrink: 0,
    alignSelf: "center",
  },
  kicker: {
    margin: "0 0 6px",
    color: "#2563eb",
    fontSize: 11,
    fontWeight: 750,
    textTransform: "uppercase",
    letterSpacing: ".08em",
  },
  title: {
    margin: "0 0 8px",
    color: "#0f172a",
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1.25,
  },
  meta: {
    margin: 0,
    color: "#64748b",
    fontSize: 12.5,
    lineHeight: 1.45,
  },
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },
  overviewHero: {
    position: "relative",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 28,
    minHeight: 190,
    padding: "28px 32px",
    borderRadius: 18,
    color: "#fff",
    background: "linear-gradient(125deg, #17233b 0%, #1e3a5f 58%, #2563eb 100%)",
    boxShadow: "0 18px 40px rgba(15, 23, 42, .14)",
  },
  overviewHeroCopy: { position: "relative", zIndex: 1, maxWidth: 720 },
  overviewEyebrow: { display: "block", marginBottom: 8, color: "#7dd3fc", fontSize: 10, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase" },
  overviewTitle: { margin: "0 0 9px", color: "#fff", fontSize: 24, fontWeight: 750, letterSpacing: "-.025em" },
  overviewDescription: { maxWidth: 640, margin: 0, color: "#cbd5e1", fontSize: 12.5, lineHeight: 1.6 },
  overviewHeroPills: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 },
  overviewHeroPill: { padding: "6px 9px", border: "1px solid rgba(255,255,255,.16)", borderRadius: 999, color: "#e0f2fe", background: "rgba(255,255,255,.08)", fontSize: 10, fontWeight: 700 },
  approvalRing: { position: "relative", zIndex: 1, width: 118, height: 118, flex: "0 0 118px", display: "grid", placeItems: "center", borderRadius: "50%", boxShadow: "0 12px 30px rgba(15,23,42,.24)" },
  approvalRingInner: { width: 88, height: 88, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", borderRadius: "50%", color: "#fff", background: "#17233b" },
  iqacOverviewHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  iqacOverviewTitle: {
    margin: "0 0 6px",
    color: "#0f172a",
    fontSize: 26,
    fontWeight: 800,
    letterSpacing: "-.02em",
  },
  iqacOverviewSubtitle: {
    margin: 0,
    color: "#64748b",
    fontSize: 13,
  },
  iqacDateCard: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 16px",
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    boxShadow: "0 6px 18px rgba(15, 23, 42, .05)",
  },
  iqacDateIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    background: "#eef2ff",
    color: "#4338ca",
  },
  iqacDateStrong: {
    display: "block",
    color: "#0f172a",
    fontSize: 13.5,
    fontWeight: 750,
  },
  iqacDateWeekday: {
    display: "block",
    color: "#94a3b8",
    fontSize: 11,
  },
  iqacSectionHeading: {
    position: "relative",
    margin: 0,
    paddingBottom: 10,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 750,
    borderBottom: "2px solid #e2e8f0",
  },
  iqacSectionHeadingAccent: {
    position: "absolute",
    left: 0,
    bottom: -2,
    width: 56,
    height: 2,
    borderRadius: 2,
    background: "#2563eb",
  },
  submissionsOverviewGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 18,
  },
  submissionStatCard: {
    borderRadius: 16,
    padding: "20px 22px",
    background: "#fff",
    border: "1px solid #e2e8f0",
    boxShadow: "0 10px 24px rgba(15, 23, 42, .05)",
  },
  submissionStatEyebrow: {
    display: "block",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: ".1em",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  submissionStatTitle: {
    display: "block",
    color: "#0f172a",
    fontSize: 15,
    fontWeight: 750,
    marginBottom: 16,
  },
  submissionStatPills: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 10,
  },
  statTileIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  statTileText: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    textAlign: "left",
  },
  submissionStatPill: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 12,
    background: "#f8fafc",
    border: "1px solid #eef2f7",
    textAlign: "left",
  },
  submissionStatValue: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: 800,
    lineHeight: 1.15,
  },
  submissionStatLabel: {
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: ".01em",
    color: "#64748b",
    lineHeight: 1.35,
  },
  submissionStatPillButton: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #eef2f7",
    background: "#f8fafc",
    textAlign: "left",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "border-color .15s ease, background .15s ease, transform .15s ease",
  },
  submissionsTableCard: {
    borderRadius: 16,
    padding: "18px 20px 8px",
    background: "#fff",
    border: "1px solid #e2e8f0",
    boxShadow: "0 10px 24px rgba(15, 23, 42, .05)",
  },
  submissionsTableTabs: {
    display: "flex",
    gap: 22,
    borderBottom: "1px solid #e2e8f0",
    marginBottom: 14,
  },
  submissionsTableTab: {
    padding: "0 0 12px",
    background: "transparent",
    border: "none",
    outline: "none",
    borderBottom: "2px solid transparent",
    color: "#64748b",
    fontSize: 13.5,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    marginBottom: -1,
  },
  submissionsTableTabActive: {
    color: "#2563eb",
    borderBottomColor: "#2563eb",
  },
  submissionsTableSubTabs: {
    display: "flex",
    gap: 8,
    marginBottom: 14,
  },
  submissionsTableSubTab: {
    padding: "6px 12px",
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#e2e8f0",
    outline: "none",
    background: "#f8fafc",
    color: "#64748b",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  submissionsTableSubTabActive: {
    color: "#2563eb",
    background: "#eff6ff",
    borderColor: "#bfdbfe",
  },
  submissionsTableWrap: {
    overflow: "auto",
    maxHeight: 320,
    borderRadius: 10,
    border: "1px solid #edf1f6",
  },
  submissionsTable: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 12.5,
  },
  submissionsTableTh: {
    position: "sticky",
    top: 0,
    textAlign: "left",
    padding: "10px 14px",
    background: "#f8fafc",
    color: "#64748b",
    fontSize: 10.5,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: ".04em",
    borderBottom: "1px solid #edf1f6",
    whiteSpace: "nowrap",
  },
  submissionsTableTd: {
    padding: "11px 14px",
    color: "#334155",
    borderBottom: "1px solid #f1f5f9",
    wordBreak: "break-word",
  },
  submissionsTableTdStrong: {
    color: "#0f172a",
    fontWeight: 700,
  },
  submissionsTableEmpty: {
    padding: "22px 14px",
    textAlign: "center",
    color: "#94a3b8",
  },
  submissionStatusBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  submissionStatusBadgeSubmitted: {
    color: "#16a34a",
  },
  submissionStatusBadgeNotSubmitted: {
    color: "#ea580c",
  },
  blueHeading: {
    padding: "0 0 15px",
    borderBottom: "1px solid #edf1f6",
  },
  pageTitleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 14,
  },
  pageTitleActions: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 10,
  },
  previousReportsHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "18px 24px",
    paddingBottom: 24,
    borderBottom: "1px solid #edf1f6",
  },
  previousReportsHeading: {
    minWidth: 260,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  previousReportsIntro: {
    margin: 0,
    color: "#64748b",
    fontSize: 12.5,
    lineHeight: 1.45,
  },
  yearFilter: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    color: "#475569",
    fontSize: 10.5,
    fontWeight: 750,
  },
  yearSelect: {
    minWidth: 132,
    height: 36,
    border: "1px solid #cbd5e1",
    borderRadius: 7,
    padding: "6px 30px 6px 10px",
    color: "#0f172a",
    background: "#fff",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 700,
  },
  sectionTitle: {
    margin: 0,
    color: "#0f172a",
    fontSize: 17,
    fontWeight: 700,
    lineHeight: 1.3,
  },
  schoolCount: {
    flexShrink: 0,
    color: "#475569",
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 999,
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 700,
  },
  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
  },
  metricCard: {
    position: "relative",
    overflow: "hidden",
    border: "1px solid #e5eaf2",
    borderRadius: 14,
    background: "#fff",
    padding: "17px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    color: "#64748b",
    boxShadow: "0 8px 24px rgba(15, 23, 42, .035)",
  },
  metricTopRow: { display: "flex", alignItems: "center", gap: 8 },
  metricIndicator: { width: 24, height: 24, display: "grid", placeItems: "center", borderRadius: 7 },
  metricLabel: { color: "#475569", fontSize: 10.5, fontWeight: 750, letterSpacing: ".04em", textTransform: "uppercase" },
  metricValue: { color: "#0f172a", fontSize: 25, lineHeight: 1, letterSpacing: "-.03em" },
  metricHint: { color: "#94a3b8", fontSize: 10.5, fontWeight: 600 },
  splitGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(280px, .8fr) minmax(320px, 1.2fr)",
    gap: 18,
  },
  card: {
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    background: "#fff",
    padding: 18,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.04)",
  },
  cardTitle: {
    margin: "2px 0 14px",
    color: "#0f172a",
    fontSize: 18,
    fontWeight: 800,
  },
  cardEyebrow: { color: "#2563eb", fontSize: 9.5, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" },
  queueHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  queueCount: { minWidth: 30, height: 30, display: "grid", placeItems: "center", borderRadius: 9, color: "#92400e", background: "#fef3c7", fontSize: 11, fontWeight: 800 },
  progressHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 14,
  },
  progressIntro: {
    margin: "-7px 0 0",
    color: "#64748b",
    fontSize: 12,
  },
  schoolProgressList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  schoolProgressRow: {
    display: "grid",
    gridTemplateColumns: "minmax(190px, 1.2fr) minmax(160px, 1fr) 52px 88px 78px",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    background: "#fbfdff",
  },
  schoolProgressIdentity: {
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: 9,
  },
  schoolProgressAvatar: {
    width: 30,
    height: 30,
    flex: "0 0 30px",
    display: "grid",
    placeItems: "center",
    borderRadius: 8,
    color: "#fff",
    background: "linear-gradient(135deg, #2563eb, #0ea5e9)",
    fontSize: 9,
    fontWeight: 800,
  },
  schoolProgressName: {
    overflow: "hidden",
    color: "#1e293b",
    fontSize: 12,
    fontWeight: 700,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  schoolProgressTrack: {
    height: 7,
    overflow: "hidden",
    borderRadius: 999,
    background: "#e2e8f0",
  },
  schoolProgressBar: {
    display: "block",
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #2563eb, #22c55e)",
  },
  schoolProgressPercent: { color: "#1e293b", fontSize: 12, textAlign: "right" },
  schoolProgressMeta: { color: "#166534", fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap" },
  schoolProgressPending: { color: "#92400e", fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap" },
  auditSummaryRows: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 0",
    borderBottom: "1px solid #edf2f7",
    color: "#475569",
    fontSize: 14,
  },
  queueList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  queueItem: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    background: "#f8fafc",
    padding: "12px 14px",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
  },
  tabs: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  tab: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#dbe3ef",
    borderRadius: 999,
    background: "#fff",
    color: "#334155",
    padding: "8px 11px",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "inherit",
  },
  activeTab: {
    color: "#fff",
    background: "#2563eb",
    borderColor: "#2563eb",
  },
  tabCount: {
    minWidth: 24,
    height: 24,
    display: "grid",
    placeItems: "center",
    borderRadius: 999,
    color: "inherit",
    background: "rgba(148, 163, 184, .18)",
    fontSize: 12,
  },
  reviewList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))",
    gap: 16,
  },
  previousReportGroups: {
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  previousReportGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
    padding: "2px 0 6px",
  },
  previousReportSectionTitleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    paddingBottom: 14,
    borderBottom: "1px solid #edf1f6",
  },
  previousReportSectionTitle: {
    margin: 0,
    color: "#0f172a",
    fontSize: 18,
    fontWeight: 800,
    lineHeight: 1.3,
  },
  previousReportEmpty: {
    border: "1px dashed #cbd5e1",
    borderRadius: 8,
    color: "#64748b",
    background: "#f8fafc",
    padding: "18px 14px",
    fontSize: 12,
    textAlign: "center",
  },
  submissionCard: {
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    background: "#fff",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.04)",
  },
  submissionTop: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
  },
  schoolAvatar: {
    width: 44,
    height: 44,
    flexShrink: 0,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    color: "#fff",
    background: "linear-gradient(135deg, #2563eb, #0ea5e9)",
    fontSize: 12,
    fontWeight: 900,
  },
  schoolAvatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  submissionTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  schoolName: {
    margin: 0,
    color: "#0f172a",
    fontSize: 15,
    fontWeight: 700,
    lineHeight: 1.35,
  },
  schoolMeta: {
    margin: "4px 0 0",
    color: "#334155",
    fontSize: 12,
    fontWeight: 650,
  },
  schoolGroup: {
    display: "block",
    marginTop: 3,
    color: "#64748b",
    fontSize: 10.5,
  },
  statusBadge: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 10.5,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  submissionInfoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
  },
  infoPill: {
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    background: "#f8fafc",
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    color: "#64748b",
    fontSize: 11,
  },
  forwardedNotice: {
    display: "grid",
    gap: 3,
    padding: "10px 12px",
    border: "1px solid #bae6fd",
    borderRadius: 10,
    color: "#075985",
    background: "#f0f9ff",
    fontSize: 11.5,
  },
  forwardedGapWarning: {
    marginTop: 4,
    paddingTop: 6,
    borderTop: "1px dashed #bae6fd",
    color: "#b45309",
    fontWeight: 700,
  },
  auditorProgressPanel: {
    display: "grid",
    gap: 10,
    border: "1px solid #c7d2fe",
    borderRadius: 8,
    background: "#eef2ff",
    padding: "12px 14px",
  },
  auditorProgressCompact: {
    display: "grid",
    gap: 8,
    border: "1px solid #c7d2fe",
    borderRadius: 8,
    background: "#eef2ff",
    padding: "10px 12px",
  },
  auditorProgressHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  auditorProgressTitle: {
    display: "block",
    color: "#3730a3",
    fontSize: 12,
    fontWeight: 850,
  },
  auditorProgressSubtext: {
    display: "block",
    marginTop: 2,
    color: "#4f46e5",
    fontSize: 11,
    fontWeight: 700,
  },
  auditorProgressPending: {
    flexShrink: 0,
    border: "1px solid #fbbf24",
    borderRadius: 999,
    background: "#fffbeb",
    color: "#92400e",
    padding: "5px 8px",
    fontSize: 10.5,
    fontWeight: 850,
  },
  auditorProgressDone: {
    flexShrink: 0,
    border: "1px solid #86efac",
    borderRadius: 999,
    background: "#f0fdf4",
    color: "#166534",
    padding: "5px 8px",
    fontSize: 10.5,
    fontWeight: 850,
  },
  auditorProgressTrack: {
    height: 7,
    overflow: "hidden",
    borderRadius: 999,
    background: "#c7d2fe",
  },
  auditorProgressBar: {
    display: "block",
    height: "100%",
    borderRadius: 999,
    background: "#4f46e5",
  },
  auditorPostGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 8,
  },
  auditorPostStatus: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    border: "1px solid rgba(79, 70, 229, .18)",
    borderRadius: 8,
    background: "rgba(255, 255, 255, .72)",
    padding: "8px 10px",
    color: "#312e81",
    fontSize: 11,
    fontWeight: 750,
  },
  auditorAssignmentList: {
    display: "grid",
    gap: 8,
  },
  auditorAssignmentRow: {
    display: "grid",
    gridTemplateColumns: "minmax(180px, 1fr) auto minmax(180px, .9fr)",
    alignItems: "center",
    gap: 10,
    border: "1px solid rgba(79, 70, 229, .16)",
    borderRadius: 8,
    background: "rgba(255, 255, 255, .82)",
    padding: "9px 10px",
  },
  auditorAssignmentMain: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    color: "#312e81",
    fontSize: 11.5,
    fontWeight: 750,
  },
  auditorAssignmentDocs: {
    minWidth: 0,
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 7,
    color: "#64748b",
    fontSize: 11,
    fontWeight: 700,
  },
  auditorReviewStack: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
    gap: 12,
    alignItems: "stretch",
  },
  auditorReviewCard: {
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: 10,
    alignSelf: "stretch",
    height: "100%",
    border: "1px solid #dbe3ef",
    borderRadius: 8,
    background: "#fff",
    padding: 12,
    boxShadow: "0 8px 20px rgba(15, 23, 42, .045)",
  },
  auditorReviewCardHeader: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    gap: 9,
    minHeight: 76,
    borderBottom: "1px solid #eef2f7",
    paddingBottom: 10,
  },
  auditorReviewIdentity: {
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  auditorReviewNumber: {
    flexShrink: 0,
    border: "1px solid #bfdbfe",
    borderRadius: 8,
    background: "#eff6ff",
    color: "#1d4ed8",
    padding: "7px 9px",
    fontSize: 11,
    fontWeight: 900,
  },
  auditorReviewNameBlock: {
    minWidth: 0,
  },
  auditorReviewChips: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    flexWrap: "wrap",
    gap: 6,
  },
  auditorReviewChip: {
    border: "1px solid #e2e8f0",
    borderRadius: 999,
    background: "#f8fafc",
    color: "#334155",
    padding: "5px 8px",
    fontSize: 10.5,
    fontWeight: 800,
  },
  auditorReviewTitle: {
    margin: 0,
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 850,
    lineHeight: 1.25,
  },
  auditorReviewEmail: {
    margin: "2px 0 0",
    color: "#64748b",
    fontSize: 11.5,
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  auditorReviewFieldGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gridAutoRows: "minmax(116px, auto)",
    gap: 10,
    alignContent: "start",
  },
  auditorReviewField: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 5,
  },
  auditorReviewDocsField: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 5,
    gridColumn: "1 / -1",
    minHeight: 128,
  },
  auditorReviewValue: {
    width: "100%",
    minHeight: 78,
    maxHeight: 132,
    overflow: "auto",
    border: "1px solid #d7dee9",
    borderRadius: 8,
    padding: "9px 10px",
    color: "#0f172a",
    background: "#fbfcfe",
    fontSize: 12.5,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    lineHeight: 1.45,
  },
  auditorReviewDocsValue: {
    width: "100%",
    minHeight: 44,
    border: "1px solid #d7dee9",
    borderRadius: 8,
    padding: 8,
    color: "#0f172a",
    background: "#fbfcfe",
    fontSize: 12.5,
  },
  remarksLabel: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    color: "#334155",
    fontSize: 12,
    fontWeight: 650,
  },
  remarksInput: {
    width: "100%",
    minHeight: 84,
    border: "1px solid #d7dee9",
    borderRadius: 8,
    padding: "9px 11px",
    color: "#0f172a",
    background: "#fbfcfe",
    outline: "none",
    resize: "vertical",
    fontSize: 12.5,
    lineHeight: 1.45,
  },
  cardActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },
  fullReviewPage: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },
  fullReviewHeader: {
    position: "sticky",
    top: 0,
    zIndex: 5,
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr) auto",
    alignItems: "center",
    gap: 16,
    padding: 20,
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    background: "#fff",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
  },
  fullReviewTitleBlock: {
    minWidth: 0,
  },
  fullReviewTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  fullReviewAvatar: {
    width: 40,
    height: 40,
    flexShrink: 0,
    borderRadius: "50%",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    background: "#eef2ff",
  },
  fullReviewAvatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  fullReviewTitle: {
    margin: "0 0 5px",
    color: "#0f172a",
    fontSize: 17,
    fontWeight: 700,
    lineHeight: 1.3,
  },
  sectionNav: {
    position: "sticky",
    top: 88,
    zIndex: 4,
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    padding: 12,
    border: "1px solid #dbe3ef",
    borderRadius: 14,
    background: "rgba(255, 255, 255, 0.96)",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.055)",
  },
  sectionNavButton: {
    minWidth: 72,
    border: "1px solid #dbe3ef",
    borderRadius: 999,
    background: "#f8fafc",
    color: "#334155",
    padding: "8px 11px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  activeSectionNavButton: {
    border: "1px solid #2563eb",
    background: "#2563eb",
    color: "#fff",
    boxShadow: "0 8px 18px rgba(37, 99, 235, 0.18)",
  },
  readOnlyReviewNotice: {
    border: "1px solid #bae6fd",
    borderRadius: 8,
    background: "#f0f9ff",
    color: "#075985",
    padding: "11px 14px",
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.5,
  },
  correctionNotice: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    border: "1px solid #fbbf24",
    borderRadius: 8,
    background: "#fffbeb",
    color: "#92400e",
    padding: "11px 14px",
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.5,
  },
  returnToggleButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 42,
    border: "1px solid #f59e0b",
    borderRadius: 999,
    padding: "10px 15px",
    color: "#92400e",
    background: "#fffbeb",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 850,
  },
  activeReturnToggleButton: {
    color: "#fff",
    background: "#f59e0b",
  },
  historyReference: {
    border: "1px solid #c7d2fe",
    borderRadius: 8,
    background: "#eef2ff",
    overflow: "hidden",
  },
  historyReferenceSummary: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 14px",
    color: "#312e81",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 800,
  },
  historyReferenceMeta: {
    color: "#6366f1",
    fontSize: 11,
    fontWeight: 700,
  },
  historyReferenceBody: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 14,
    borderTop: "1px solid #c7d2fe",
    background: "#f8faff",
  },
  fullReviewActions: {
    position: "sticky",
    bottom: 0,
    zIndex: 5,
    display: "flex",
    justifyContent: "flex-end",
    padding: 14,
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    background: "rgba(255, 255, 255, 0.96)",
    boxShadow: "0 -10px 28px rgba(15, 23, 42, 0.06)",
  },
  reviewPager: {
    width: "100%",
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
  },
  finalReviewPanel: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  finalActionRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  reviewHint: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 650,
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.62)",
    backdropFilter: "blur(8px)",
    zIndex: 1000,
    display: "grid",
    placeItems: "center",
    padding: 18,
  },
  modal: {
    width: "min(380px, 92vw)",
    background: "#fff",
    borderRadius: 12,
    padding: "26px 28px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  },
  forwardModal: {
    width: "min(860px, 94vw)",
    maxHeight: "90vh",
    overflowY: "auto",
    background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
    border: "1px solid rgba(226, 232, 240, .9)",
    borderRadius: 20,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 0,
    boxShadow: "0 30px 90px rgba(15, 23, 42, 0.36)",
  },
  forwardModalHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 18,
    padding: "24px 28px 20px",
    borderBottom: "1px solid #e2e8f0",
    background: "linear-gradient(135deg, #ffffff 0%, #eff6ff 100%)",
    borderRadius: "20px 20px 0 0",
  },
  forwardHeaderMain: {
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
    minWidth: 0,
  },
  forwardHeaderIcon: {
    width: 48,
    height: 48,
    flex: "0 0 48px",
    display: "grid",
    placeItems: "center",
    borderRadius: 15,
    color: "#fff",
    background: "linear-gradient(135deg, #2563eb, #0ea5e9)",
    fontSize: 12,
    fontWeight: 950,
    boxShadow: "0 14px 30px rgba(37, 99, 235, .28)",
  },
  forwardHeaderActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flex: "0 0 auto",
  },
  forwardModalTitle: {
    margin: "0 0 7px",
    color: "#0f172a",
    fontSize: 22,
    lineHeight: 1.2,
    fontWeight: 900,
  },
  iconCloseButton: {
    width: 34,
    height: 34,
    display: "grid",
    placeItems: "center",
    border: "1px solid #dbe4f0",
    borderRadius: 10,
    color: "#475569",
    background: "#fff",
    cursor: "pointer",
    fontSize: 22,
    lineHeight: 1,
    fontFamily: "inherit",
  },
  reviewModal: {
    width: "min(1040px, 96vw)",
    maxHeight: "92vh",
    overflow: "auto",
    background: "#fff",
    borderRadius: 16,
    padding: 22,
    display: "flex",
    flexDirection: "column",
    gap: 18,
    boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
  },
  nextYearModal: {
    width: "min(560px, 94vw)",
    display: "flex",
    flexDirection: "column",
    gap: 18,
    overflow: "hidden",
    border: "1px solid #dbe4f0",
    borderRadius: 8,
    background: "#fff",
    boxShadow: "0 24px 70px rgba(15, 23, 42, .3)",
  },
  nextYearHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
    padding: "22px 24px 0",
  },
  nextYearWarning: {
    margin: "0 24px",
    border: "1px solid #fde68a",
    borderRadius: 8,
    color: "#92400e",
    background: "#fffbeb",
    padding: "12px 14px",
    fontSize: 13,
    fontWeight: 650,
    lineHeight: 1.55,
  },
  nextYearChecklist: {
    display: "grid",
    gap: 8,
    margin: "0 24px",
    color: "#475569",
    fontSize: 12,
    lineHeight: 1.5,
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    borderBottom: "1px solid #e2e8f0",
    paddingBottom: 16,
  },
  modalTitle: {
    color: "#0f172a",
    fontWeight: 900,
    fontSize: 18,
    marginBottom: 8,
  },
  modalText: {
    color: "#64748b",
    fontSize: 14,
    lineHeight: 1.6,
    marginBottom: 18,
  },
  modalMeta: {
    margin: 0,
    color: "#64748b",
    fontSize: 14,
  },
  modalGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  },
  forwardStep: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    margin: "18px 28px 0",
    padding: 18,
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    background: "rgba(255, 255, 255, .86)",
    boxShadow: "0 10px 28px rgba(15, 23, 42, .045)",
  },
  forwardStepHeading: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
  },
  forwardStepBadge: {
    width: 28,
    height: 28,
    flex: "0 0 28px",
    display: "grid",
    placeItems: "center",
    borderRadius: 9,
    color: "#1d4ed8",
    background: "#dbeafe",
    fontSize: 12,
    fontWeight: 950,
  },
  forwardStepTitle: {
    margin: 0,
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 850,
  },
  forwardStepHint: {
    margin: "3px 0 0",
    color: "#64748b",
    fontSize: 12,
    lineHeight: 1.4,
  },
  forwardTypeRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },
  forwardTypeButton: {
    minHeight: 72,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 5,
    padding: "12px 14px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#d7dee9",
    borderRadius: 12,
    color: "#334155",
    background: "#fff",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 700,
    textAlign: "left",
    transition: "border-color .15s ease, background .15s ease, box-shadow .15s ease, transform .15s ease",
  },
  activeForwardTypeButton: {
    borderColor: "#2563eb",
    color: "#1d4ed8",
    background: "#eff6ff",
    boxShadow: "0 0 0 3px rgba(37,99,235,.11)",
  },
  forwardGroupSummary: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "12px 14px",
    border: "1px solid #bfdbfe",
    borderRadius: 12,
    color: "#1e3a8a",
    background: "#eff6ff",
    fontSize: 12,
  },
  auditorSelectionTools: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 7,
  },
  auditorSelectionButton: {
    border: "1px solid #bfdbfe",
    borderRadius: 6,
    color: "#1d4ed8",
    background: "#fff",
    padding: "5px 8px",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 750,
  },
  auditorList: {
    display: "grid",
    gap: 10,
  },
  auditorOption: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 13,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#dbe4f0",
    borderRadius: 14,
    color: "#0f172a",
    background: "#fff",
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
    boxShadow: "0 6px 16px rgba(15, 23, 42, .035)",
  },
  selectedAuditorOption: {
    borderColor: "#2563eb",
    background: "#eff6ff",
    boxShadow: "0 0 0 2px rgba(37, 99, 235, .1)",
  },
  auditorCheckbox: {
    width: 17,
    height: 17,
    flex: "0 0 17px",
    accentColor: "#2563eb",
    cursor: "pointer",
  },
  auditorAvatar: {
    width: 38,
    height: 38,
    flex: "0 0 38px",
    display: "grid",
    placeItems: "center",
    borderRadius: 12,
    color: "#fff",
    background: "linear-gradient(135deg, #2563eb, #0ea5e9)",
    fontSize: 11,
    fontWeight: 900,
  },
  auditorOptionBody: {
    minWidth: 0,
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: 2,
  },
  forwardSchoolBadgeList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 3,
  },
  forwardSchoolBadge: {
    display: "inline-flex",
    padding: "3px 7px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#dbe4f0",
    borderRadius: 999,
    color: "#475569",
    background: "#f8fafc",
    fontSize: 10.5,
    fontWeight: 800,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
  },
  forwardMatchedSchoolBadge: {
    color: "#1d4ed8",
    borderColor: "#93c5fd",
    background: "#dbeafe",
  },
  auditorAssignText: {
    padding: "5px 8px",
    borderRadius: 999,
    color: "#166534",
    background: "#dcfce7",
    fontSize: 12,
    fontWeight: 850,
  },
  forwardSelectionActions: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  forwardEmptyState: {
    minHeight: 118,
    display: "grid",
    placeItems: "center",
    gap: 5,
    padding: 20,
    border: "1px dashed #cbd5e1",
    borderRadius: 14,
    color: "#475569",
    background: "#f8fafc",
    textAlign: "center",
    fontSize: 12.5,
  },
  forwardEmptyIcon: {
    width: 34,
    height: 34,
    display: "grid",
    placeItems: "center",
    borderRadius: 12,
    color: "#1d4ed8",
    background: "#dbeafe",
    fontSize: 13,
    fontWeight: 950,
  },
  forwardErrorState: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    border: "1px solid #fecaca",
    borderRadius: 14,
    color: "#991b1b",
    background: "#fff1f2",
    fontSize: 13,
    lineHeight: 1.5,
  },
  forwardErrorIcon: {
    width: 30,
    height: 30,
    flex: "0 0 30px",
    display: "grid",
    placeItems: "center",
    borderRadius: 10,
    color: "#fff",
    background: "#dc2626",
    fontSize: 14,
    fontWeight: 950,
  },
  forwardPrimaryButton: {
    width: "100%",
    minHeight: 46,
    borderRadius: 12,
  },
  forwardFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    marginTop: 18,
    padding: "16px 28px 24px",
    color: "#64748b",
    fontSize: 12,
    fontWeight: 650,
  },
  forwardCancelButton: {
    minWidth: 118,
    border: "1px solid #dbe4f0",
    borderRadius: 12,
    padding: "11px 16px",
    color: "#334155",
    background: "#f8fafc",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 850,
  },
  formViewer: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  emptyDraftNotice: {
    border: "1px solid #fde68a",
    borderRadius: 10,
    background: "#fffbeb",
    color: "#92400e",
    padding: "12px 14px",
    fontSize: 14,
    fontWeight: 800,
    lineHeight: 1.5,
  },
  errorNotice: {
    border: "1px solid #fecaca",
    borderRadius: 10,
    background: "#fef2f2",
    color: "#991b1b",
    padding: "12px 14px",
    fontSize: 14,
    fontWeight: 800,
    lineHeight: 1.5,
  },
  reviewSection: {
    display: "flex",
    flexDirection: "column",
    gap: 15,
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    background: "#fff",
    padding: 20,
    boxShadow: "0 12px 35px rgba(15, 23, 42, 0.045)",
  },
  reviewSectionTitle: {
    margin: 0,
    padding: "0 0 15px",
    borderBottom: "1px solid #edf1f6",
    color: "#0f172a",
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: "-.015em",
    lineHeight: 1.3,
  },
  reviewSectionNote: {
    margin: "-6px 0 14px",
    color: "#475569",
    fontSize: 12,
    fontWeight: 650,
  },
  reviewText: {
    margin: "0 0 14px",
    color: "#0f172a",
    fontSize: 12,
    fontWeight: 650,
  },
  partEComparison: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  partEReferenceBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 14,
    border: "1px solid #bfdbfe",
    borderRadius: 10,
    background: "#f8fbff",
  },
  partECurrentBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    paddingTop: 2,
  },
  partEReferenceHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  partEReferenceTitle: {
    margin: 0,
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 800,
    lineHeight: 1.35,
  },
  partEReferenceMeta: {
    color: "#2563eb",
    fontSize: 11,
    fontWeight: 800,
  },
  reviewTables: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  readOnlyFieldGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "18px 16px",
  },
  reviewSubheading: {
    gridColumn: "1 / -1",
    margin: "4px 0 0",
    color: "#0f172a",
    fontSize: 15,
    fontWeight: 700,
    lineHeight: 1.35,
  },
  readOnlyField: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  readOnlyWideField: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    gridColumn: "1 / -1",
  },
  readOnlyLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: 650,
  },
  readOnlyValue: {
    width: "100%",
    minHeight: 42,
    display: "flex",
    alignItems: "center",
    border: "1px solid #d7dee9",
    borderRadius: 8,
    padding: "9px 11px",
    color: "#0f172a",
    background: "#fbfcfe",
    fontSize: 12.5,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    lineHeight: 1.45,
  },
  editableInput: {
    width: "100%",
    minHeight: 42,
    border: "1px solid #d7dee9",
    borderRadius: 8,
    padding: "9px 11px",
    color: "#0f172a",
    background: "#fff",
    outline: "none",
    fontSize: 12.5,
    lineHeight: 1.45,
  },
  editableTextarea: {
    width: "100%",
    minHeight: 132,
    border: "1px solid #d7dee9",
    borderRadius: 8,
    padding: "9px 11px",
    color: "#0f172a",
    background: "#fff",
    outline: "none",
    resize: "vertical",
    fontSize: 12.5,
    lineHeight: 1.45,
  },
  documentationUploader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    padding: 12,
    border: "1px dashed #bfdbfe",
    borderRadius: 10,
    background: "#eff6ff",
  },
  documentationUploadButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 38,
    border: "1px solid #2563eb",
    borderRadius: 9,
    padding: "9px 13px",
    color: "#fff",
    background: "#2563eb",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800,
  },
  hiddenFileInput: {
    display: "none",
  },
  documentationHint: {
    color: "#475569",
    fontSize: 12,
    lineHeight: 1.45,
  },
  documentationList: {
    display: "grid",
    gap: 8,
  },
  documentationItem: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "center",
    gap: 10,
    padding: 8,
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    background: "#fff",
  },
  documentationItemBody: {
    minWidth: 0,
  },
  documentationDeleteButton: {
    border: "1px solid #fecaca",
    borderRadius: 8,
    padding: "8px 10px",
    color: "#b91c1c",
    background: "#fef2f2",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 800,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 11,
    fontWeight: 700,
  },
  readOnlyTableBlock: {
    marginTop: 8,
  },
  readOnlyTableTitle: {
    margin: "0 0 9px",
    padding: 0,
    color: "#0f172a",
    background: "transparent",
    fontSize: 15,
    fontWeight: 700,
    lineHeight: 1.35,
  },
  readOnlyNotes: {
    margin: "0 0 8px",
    color: "#334155",
    fontSize: 12,
    lineHeight: 1.6,
  },
  readOnlyScroller: {
    overflowX: "auto",
    border: "1px solid #d7dee8",
  },
  readOnlyTable: {
    width: "100%",
    minWidth: 0,
    borderCollapse: "collapse",
    tableLayout: "fixed",
  },
  readOnlyTh: {
    padding: "10px 11px",
    borderBottom: "1px solid #334155",
    borderRight: "1px solid #3a465b",
    background: "#1e293b",
    color: "#f8fafc",
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: ".025em",
    textAlign: "left",
    verticalAlign: "top",
  },
  readOnlyTd: {
    padding: "8px 9px",
    borderBottom: "1px solid #dfe5ec",
    borderRight: "1px solid #dfe5ec",
    color: "#0f172a",
    fontSize: 12.5,
    verticalAlign: "top",
    whiteSpace: "pre-wrap",
  },
  attachmentPreview: {
    minWidth: 0,
    display: "grid",
    gridTemplateColumns: "34px minmax(0, 1fr)",
    alignItems: "center",
    gap: 9,
    border: "1px solid #dbe3ef",
    borderRadius: 8,
    background: "#fff",
    padding: 9,
    boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)",
  },
  approvalArchiveNote: {
    margin: "0 18px",
    border: "1px solid #bfdbfe",
    borderRadius: 8,
    background: "#eff6ff",
    color: "#1e40af",
    padding: "11px 12px",
    fontSize: 12,
    fontWeight: 650,
    lineHeight: 1.5,
  },
  returnModalNotice: {
    margin: "18px 28px 0",
    border: "1px solid #fbbf24",
    borderRadius: 8,
    background: "#fffbeb",
    color: "#92400e",
    padding: "11px 14px",
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.5,
  },
  attachmentDocumentIcon: {
    width: 34,
    height: 34,
    display: "grid",
    placeItems: "center",
    padding: 7,
    borderRadius: 7,
    color: "#dc2626",
    background: "#fee2e2",
  },
  attachmentDocumentDetails: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  attachmentDocumentName: {
    overflow: "hidden",
    color: "#1e293b",
    fontSize: 12,
    lineHeight: 1.35,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  attachmentLink: {
    gridColumn: "1 / -1",
    justifySelf: "end",
    color: "#2563eb",
    border: "1px solid #bfdbfe",
    borderRadius: 6,
    background: "#eff6ff",
    padding: "5px 8px",
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "inherit",
    cursor: "pointer",
    textDecoration: "none",
  },
  mutedText: {
    color: "#64748b",
    fontSize: 12,
  },
  sectionList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  sectionItem: {
    display: "grid",
    gridTemplateColumns: "32px 1fr auto",
    gap: 10,
    alignItems: "center",
    border: "1px solid #edf2f7",
    borderRadius: 10,
    padding: "9px 10px",
    fontSize: 14,
    color: "#334155",
  },
  attachmentList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
    gap: 10,
  },
  attachmentItem: {
    minWidth: 0,
  },
  modalActions: {
    display: "flex",
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    border: "none",
    borderRadius: 8,
    background: "#f1f5f9",
    color: "#475569",
    padding: 10,
    fontWeight: 900,
    cursor: "pointer",
  },
  confirmButton: {
    flex: 1,
    border: "none",
    borderRadius: 8,
    background: "#dc2626",
    color: "#fff",
    padding: 10,
    fontWeight: 900,
    cursor: "pointer",
  },
};
