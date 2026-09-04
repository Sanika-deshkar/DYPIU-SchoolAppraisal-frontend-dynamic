import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearAuthState, getApiErrorMessage } from "../../../api/client";
import { SIGN_OFF_FIELD, buildSubmissionPayload, deleteAttachment, fetchMyDraft, normalizeDraft, saveDraft, uploadAttachments, fetchAdministrativeStatus, submitAdministrativePart, fetchCurrentAuditCycle } from "../../../api/submissions";
import { fetchCurrentUser } from "../../../api/users";
import universityLogo from "../../../assets/images/image.png";
import iqacLogo from "../../../assets/images/IQAS.png";
import AuditTable from "../components/AuditTable";
import DateInput from "../components/DateInput";
import { InlineSpinner, LoadingState, SkeletonList } from "../components/LoadingState";
import SubmissionConfirmation from "../components/SubmissionConfirmation";
import { emptySubmissionConfirmation, isSubmissionConfirmed } from "../components/submissionConfirmationState";
import { columnsWithSerial, serialColumnFor } from "../components/tableHelpers";
import AdministrativeReportPanel from "./AdministrativeReportPanel";
import AdministrativePartE from "./AdministrativePartE";
import AppSidebar from "../components/AppSidebar";
import UserProfileModal from "../components/UserProfileModal";
import { administrativeAuditMeta, administrativeAuditModules } from "./administrativeAuditConfig";
import { getAttachmentUrl } from "../../../utils/attachment";
import { scrollPageToTop } from "../../../utils/scrollToTop";
import { fetchActiveSchema, fetchUniversityBranding } from "../../../api/config";

const administrativeUserModules = [
  ...administrativeAuditModules.filter((module) => module.id !== "section-f-observations-recommendations"),
  {
    id: "submission-status",
    number: "",
    title: "Submission Status",
    owner: "system",
  }
];

const normalizePost = (value = "") => {
  const normalized = String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (normalized === "hr" || normalized.includes("human resource")) return "hr";
  if (normalized === "dsw" || normalized.includes("student welfare")) return "dean-student-welfare";
  if (normalized.includes("dean placement") || normalized === "placement") return "dean-placement";
  if (normalized.includes("registrar")) return "registrar";
  return normalized.replaceAll(" ", "-");
};

const moduleOwnerPost = (module) => normalizePost(module.owner);

const ADMIN_STATUS_ROLES = [
  { key: "registrar", label: "Registrar", post: "registrar" },
  { key: "hr", label: "HR", post: "hr" },
  { key: "deanStudentWelfare", label: "Dean Student Welfare", post: "dean-student-welfare" },
  { key: "deanPlacement", label: "Dean Placement", post: "dean-placement" },
];

const statusRoleForPost = (post) => ADMIN_STATUS_ROLES.find((role) => role.post === post);
const titleCase = (value = "") => String(value).replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const compactAcademicYear = (value = "") => String(value || "")
  .replace(/\s+/g, "")
  .replace(/[–—]/g, "-")
  .replace(/(\d{4})-(\d{2})(?!\d)/, (_, start, end) => `${start}-20${end}`);
const draftBelongsToAcademicYear = (draft = {}, academicYear = "") => {
  const expectedYear = compactAcademicYear(academicYear);
  const draftYear = compactAcademicYear(draft.auditCycle || draft.cycleId || "");
  return !draft.exists || !expectedYear || !draftYear || draftYear === expectedYear;
};
const isLockedContributionStatus = (status = "") => ["approved", "submitted", "auditor-completed"].includes(String(status).toLowerCase().replaceAll("_", "-"));
const editableContributionStatuses = new Set([
  "pending",
  "draft",
  "external-draft",
  "pending-contributor-submission",
  "external-contributor-pending",
  "contributor-pending",
  "pending-contribution",
]);
const isEditableContributionStatus = (status = "") => editableContributionStatuses.has(String(status).toLowerCase().replaceAll("_", "-"));

const workflowFromDraft = (draft = {}) => ({
  cycleId: draft.cycleId || null,
  cycleType: draft.cycleType || "",
  reportCategory: draft.reportCategory || "",
  version: draft.version || 1,
  overallStatus: draft.overallStatus || "",
  contributionStatus: draft.contributionStatus || "",
  canEditContribution: draft.canEditContribution,
  canForwardToAuditor: draft.canForwardToAuditor,
  allContributorsSubmitted: draft.allContributorsSubmitted,
});

const cycleLabelFor = (workflow = {}) => {
  const category = workflow.reportCategory || workflow.cycleType;
  const categoryText = category ? `${titleCase(category)} Audit` : "Administrative Audit";
  return `${categoryText} - Version ${workflow.version || 1}`;
};

const emptyRowFor = (columns, index) => {
  const row = columnsWithSerial(columns).reduce((value, column) => {
    value[column] = "";
    return value;
  }, {});
  const serialColumn = serialColumnFor(Object.keys(row));
  if (serialColumn) row[serialColumn] = String(index + 1);
  return row;
};

const normalizeRows = (columns, rows) => {
  const serialColumn = serialColumnFor(columnsWithSerial(columns));
  return rows.map((row, index) => ({
    ...emptyRowFor(columns, index),
    ...row,
    ...(serialColumn ? { [serialColumn]: row[serialColumn] || String(index + 1) } : {}),
  }));
};

const collectAttachments = (value, attachments = []) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectAttachments(item, attachments));
    return attachments;
  }
  if (!value || typeof value !== "object") return attachments;
  if (value.url || value.publicUrl || value.downloadUrl) {
    attachments.push(value);
    return attachments;
  }
  Object.values(value).forEach((item) => collectAttachments(item, attachments));
  return attachments;
};

const uniqueAttachments = (values) => [...new Map(
  collectAttachments(values).map((attachment) => [
    attachment.url || attachment.publicUrl || attachment.downloadUrl,
    attachment,
  ])
).values()];

const moduleBlocksFor = (module) =>
  module.blocks || [
    ...(module.fields?.length ? [{ type: "fields", fields: module.fields }] : []),
    ...(module.tables?.length ? [{ type: "tables", tables: module.tables }] : []),
  ];

const moduleFieldsFor = (module) =>
  moduleBlocksFor(module)
    .flatMap((block) => {
      if (block.type === "fields") return block.fields;
      if (block.type === "attachment-field") return [{ id: block.id, initialValue: [] }];
      if (block.type === "part-e-schools") return [{ id: block.fieldId, initialValue: [] }];
      return [];
    })
    .filter((field) => field.kind !== "heading");

const moduleTablesFor = (module) =>
  moduleBlocksFor(module).flatMap((block) => (block.type === "tables" ? block.tables : []));

const ensureDefaultTableRows = (tables = {}) => {
  const nextTables = { ...tables };
  administrativeAuditModules.forEach((module) => {
    moduleTablesFor(module).forEach((table) => {
      if (!Array.isArray(nextTables[table.id]) || !nextTables[table.id].length) {
        nextTables[table.id] = [emptyRowFor(table.columns, 0)];
      } else {
        nextTables[table.id] = normalizeRows(table.columns, nextTables[table.id]);
      }
    });
  });
  return nextTables;
};

const buildInitialData = () => {
  const fields = {};
  const tables = {};

  administrativeAuditModules.forEach((module) => {
    moduleFieldsFor(module).forEach((field) => {
      fields[field.id] = field.initialValue ?? "";
    });
    moduleTablesFor(module).forEach((table) => {
      tables[table.id] = [emptyRowFor(table.columns, 0)];
    });
  });

  return { fields, tables, attachments: [], lastSavedAt: "" };
};

const getUserProfile = () => ({
  id: sessionStorage.getItem("userId") || "",
  name: sessionStorage.getItem("name") || "Administrative User",
  designation: sessionStorage.getItem("designation") || "Registrar",
  post: sessionStorage.getItem("post") || "",
  school: sessionStorage.getItem("school") || "Administrative Office",
  email: sessionStorage.getItem("email") || sessionStorage.getItem("username") || "",
});

const ADMIN_SUBMISSION_STATUS_FIELD = "__administrativeSubmissionStatus";

const normalizeSubmittedAt = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;

  const timestamp = String(value).trim();
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp);
  const hasTime = /T\d{2}:\d{2}/.test(timestamp);
  const date = new Date(hasTime && !hasTimezone ? `${timestamp}Z` : timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatSubmittedDateTime = (value) => {
  const date = normalizeSubmittedAt(value);
  if (!date) return "";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
};

const storedAdministrativeStatusFor = (fields = {}) => (
  fields[ADMIN_SUBMISSION_STATUS_FIELD] && typeof fields[ADMIN_SUBMISSION_STATUS_FIELD] === "object"
    ? fields[ADMIN_SUBMISSION_STATUS_FIELD]
    : {}
);

export default function AdministrativeAuditDashboard() {
  const navigate = useNavigate();
  const [academicYear, setAcademicYear] = useState(
    sessionStorage.getItem("academicYear") ? compactAcademicYear(sessionStorage.getItem("academicYear")) : "2025-26"
  );
  const [activeAcademicYear, setActiveAcademicYear] = useState("");
  const [availableYears, setAvailableYears] = useState(["2025-26", "2026-27"]);

  useEffect(() => {
    let isActive = true;
    const loadCycles = async () => {
      try {
        const { data } = await fetchCurrentAuditCycle();
        if (!isActive) return;
        const activeLabel = data.activeYear || "2025-2026";
        const formattedActive = compactAcademicYear(activeLabel);
        setActiveAcademicYear(formattedActive);

        const rawYears = data.availableYears || [activeLabel];
        const formatted = Array.from(new Set(rawYears.map(compactAcademicYear))).sort();
        setAvailableYears(formatted);

        const stored = sessionStorage.getItem("academicYear");
        const selected = stored ? compactAcademicYear(stored) : formattedActive;
        setAcademicYear(selected);
        sessionStorage.setItem("academicYear", selected);
      } catch {
        // Fallback
      }
    };
    loadCycles();
    return () => {
      isActive = false;
    };
  }, []);

  const isHistoricalYear = Boolean(activeAcademicYear && compactAcademicYear(academicYear) !== compactAcademicYear(activeAcademicYear));

  const [profileOverrides, setProfileOverrides] = useState({});
  const [accountAvatarUrl, setAccountAvatarUrl] = useState("");
  const [dynamicSchema, setDynamicSchema] = useState(null);
  const [schemaLoading, setSchemaLoading] = useState(true);
  const [universityInfo, setUniversityInfo] = useState(null);

  useEffect(() => {
    let isActive = true;
    const universityCode = sessionStorage.getItem("universityCode") || localStorage.getItem("universityCode") || "dypiu";
    fetchUniversityBranding(universityCode)
      .then((data) => {
        if (isActive && data) setUniversityInfo(data);
      })
      .catch(() => {});
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    const loadDynamicAdminSchema = async () => {
      setSchemaLoading(true);
      try {
        const universityCode = sessionStorage.getItem("universityCode") || localStorage.getItem("universityCode") || "dypiu";
        const userPost = sessionStorage.getItem("post") || sessionStorage.getItem("designation") || "";
        const schema = await fetchActiveSchema("administrative", universityCode, userPost);
        if (!isActive) return;
        if (schema && Array.isArray(schema.sections) && schema.sections.length > 0) {
          setDynamicSchema(schema);
        } else {
          setDynamicSchema(null);
        }
      } catch (err) {
        if (isActive) setDynamicSchema(null);
      } finally {
        if (isActive) setSchemaLoading(false);
      }
    };
    loadDynamicAdminSchema();
    return () => {
      isActive = false;
    };
  }, [academicYear]);

  // sessionStorage never carries the avatar, and profileOverrides only lives for the rest of
  // this session after a save in UserProfileModal — without this fetch, the sidebar avatar
  // reverts to initials on every reload/re-login even though the picture was saved.
  useEffect(() => {
    let isActive = true;
    fetchCurrentUser()
      .then(({ data }) => {
        if (!isActive) return;
        const remote = data?.data || data || {};
        if (remote.avatarUrl) setAccountAvatarUrl(remote.avatarUrl);
      })
      .catch(() => {});
    return () => {
      isActive = false;
    };
  }, []);

  const profile = { ...getUserProfile(), avatarUrl: accountAvatarUrl, ...profileOverrides };
  const userPost = normalizePost(profile.post || profile.designation);
  const firstOwnedModule = administrativeUserModules.find((module) => moduleOwnerPost(module) === userPost);
  const [activeModuleId, setActiveModuleId] = useState(firstOwnedModule?.id || administrativeUserModules[0].id);
  const [reportMode, setReportMode] = useState(false);
  const [printReportAfterRender, setPrintReportAfterRender] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("");
  const [status, setStatus] = useState("");
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [savingDraftAction, setSavingDraftAction] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submissionConfirmation, setSubmissionConfirmation] = useState(emptySubmissionConfirmation);
  const [hasExistingSubmission, setHasExistingSubmission] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [contributionApproved, setContributionApproved] = useState(false);
  const [workflow, setWorkflow] = useState(workflowFromDraft());
  const [administrativeProgress, setAdministrativeProgress] = useState({});
  const [data, setData] = useState(buildInitialData);

  const activeModule = useMemo(
    () => administrativeUserModules.find((module) => module.id === activeModuleId) || administrativeUserModules[0],
    [activeModuleId],
  );
  const ownedModules = useMemo(
    () => administrativeUserModules.filter((module) => module.id !== "submission-status" && moduleOwnerPost(module) === userPost),
    [userPost],
  );
  const activeModuleIndex = administrativeUserModules.findIndex((module) => module.id === activeModuleId);
  const isLastModule = activeModuleIndex === administrativeUserModules.length - 1;
  const finalOwnedModule = ownedModules[ownedModules.length - 1];
  const canEditActiveModule = moduleOwnerPost(activeModule) === userPost;
  const backendAllowsContributionEdit =
    workflow.canEditContribution === true ||
    isEditableContributionStatus(workflow.contributionStatus || workflow.overallStatus);
  const backendBlocksContributionEdit =
    workflow.canEditContribution === false ||
    isLockedContributionStatus(workflow.contributionStatus);
  const contributionLocked = !backendAllowsContributionEdit && (isSubmitted || contributionApproved);
  const readOnly = isHistoricalYear || !canEditActiveModule || backendBlocksContributionEdit || contributionLocked;
  const isFinalOwnedModule = canEditActiveModule && activeModule.id === finalOwnedModule?.id;
  const canWorkOnOwnedModule = canEditActiveModule && !backendBlocksContributionEdit && !contributionLocked;
  const canSubmitPart = isSubmissionConfirmed(submissionConfirmation);
  const currentStatusRole = statusRoleForPost(userPost);

  const handleModuleChange = (moduleId) => {
    setReportMode(false);
    setActiveModuleId(moduleId);
    scrollPageToTop();
  };

  const updateSubmissionConfirmation = (value) => {
    setSubmissionConfirmation(value);
    setSubmitStatus("");
  };

  useEffect(() => {
    let isActive = true;

    const loadDraft = async () => {
      setLoadingDraft(true);
      setStatus("");

      try {
        const initial = buildInitialData();
        const { data: draftResponse } = await fetchMyDraft("administrative", academicYear);
        const draft = normalizeDraft(draftResponse, initial.fields, initial.tables);
        const activeDraft = draftBelongsToAcademicYear(draft, academicYear)
          ? draft
          : normalizeDraft({}, initial.fields, initial.tables);

        if (!isActive) return;
        setData({
          fields: activeDraft.values,
          tables: ensureDefaultTableRows(activeDraft.tables),
          attachments: activeDraft.attachments,
          lastSavedAt: new Date().toISOString(),
        });
        setHasExistingSubmission(activeDraft.exists);
        setIsSubmitted(activeDraft.isSubmitted);
        setWorkflow(workflowFromDraft(activeDraft));
        setAdministrativeProgress(activeDraft.administrativeProgress || {});
        const contributionStatus = String(
          activeDraft.administrativeProgress?.[currentStatusRole?.key] ||
          activeDraft.administrativeProgress?.[userPost] ||
          "",
        ).toLowerCase();
        setContributionApproved(["approved", "submitted"].includes(contributionStatus));
      } catch (error) {
        if (isActive) setStatus(getApiErrorMessage(error, "Could not load your draft from the server."));
      } finally {
        if (isActive) setLoadingDraft(false);
      }
    };

    loadDraft();

    return () => {
      isActive = false;
    };
  }, [academicYear, currentStatusRole?.key, userPost]);

  useEffect(() => {
    if (!reportMode || !printReportAfterRender) return undefined;

    const timer = window.setTimeout(() => {
      window.print();
      setPrintReportAfterRender(false);
    }, 150);

    return () => window.clearTimeout(timer);
  }, [printReportAfterRender, reportMode]);

  const setFieldValue = (fieldId, value) => {
    setData((current) => ({
      ...current,
      fields: { ...current.fields, [fieldId]: value },
      lastSavedAt: new Date().toISOString(),
    }));
  };

  const setCellValue = (tableId, rowIndex, column, value) => {
    setData((current) => ({
      ...current,
      tables: {
        ...current.tables,
        [tableId]: current.tables[tableId].map((row, index) => (index === rowIndex ? { ...row, [column]: value } : row)),
      },
      lastSavedAt: new Date().toISOString(),
    }));
  };

  const setTableRows = (table, rows) => {
    setData((current) => ({
      ...current,
      tables: {
        ...current.tables,
        [table.id]: normalizeRows(table.columns, rows.length ? rows : [emptyRowFor(table.columns, 0)]),
      },
      lastSavedAt: new Date().toISOString(),
    }));
  };

  const addRow = (table) => {
    setData((current) => ({
      ...current,
      tables: {
        ...current.tables,
        [table.id]: [
          ...(current.tables[table.id] || []),
          emptyRowFor(table.columns, current.tables[table.id]?.length || 0),
        ],
      },
      lastSavedAt: new Date().toISOString(),
    }));
  };

  const deleteLastRow = (table) => {
    setData((current) => {
      const nextRows = (current.tables[table.id] || []).slice(0, -1);
      return {
        ...current,
        tables: {
          ...current.tables,
          [table.id]: normalizeRows(table.columns, nextRows.length ? nextRows : [emptyRowFor(table.columns, 0)]),
        },
        lastSavedAt: new Date().toISOString(),
      };
    });
  };

  const uploadFormAttachments = async (files) => {
    const uploaded = await uploadAttachments(files);
    setData((current) => ({
      ...current,
      attachments: [...(current.attachments || []), ...uploaded],
      lastSavedAt: new Date().toISOString(),
    }));
    return uploaded;
  };

  const deleteFormAttachment = async (attachment) => {
    await deleteAttachment(attachment);
    setData((current) => ({
      ...current,
      attachments: (current.attachments || []).filter((file) => file.url !== attachment.url),
      lastSavedAt: new Date().toISOString(),
    }));
  };

  const resetActiveModule = () => {
    if (!canEditActiveModule) return;
    if (!window.confirm(`Reset Section ${activeModule.number}? Unsaved data in this section will be cleared.`)) return;

    setData((current) => {
      const initial = buildInitialData();
      const fields = { ...current.fields };
      const tables = { ...current.tables };
      moduleFieldsFor(activeModule).forEach((field) => {
        fields[field.id] = initial.fields[field.id];
      });
      moduleTablesFor(activeModule).forEach((table) => {
        tables[table.id] = initial.tables[table.id];
      });
      return {
        ...current,
        fields,
        tables,
        attachments: uniqueAttachments({ fields, tables }),
        lastSavedAt: new Date().toISOString(),
      };
    });
    setStatus(`Section ${activeModule.number} cleared.`);
  };

  const payloadForModules = (modules, values = data.fields) => {
    const fieldIds = modules.flatMap((module) => moduleFieldsFor(module).map((field) => field.id));
    const tableIds = modules.flatMap((module) => moduleTablesFor(module).map((table) => table.id));
    const scopedValues = Object.fromEntries(fieldIds.map((fieldId) => [fieldId, values[fieldId] ?? ""]));
    if (values[SIGN_OFF_FIELD]) scopedValues[SIGN_OFF_FIELD] = values[SIGN_OFF_FIELD];
    if (values[ADMIN_SUBMISSION_STATUS_FIELD]) scopedValues[ADMIN_SUBMISSION_STATUS_FIELD] = values[ADMIN_SUBMISSION_STATUS_FIELD];
    const scopedTables = Object.fromEntries(tableIds.map((tableId) => [tableId, data.tables[tableId] || []]));
    return {
      ...buildSubmissionPayload({
        auditType: "administrative",
        values: scopedValues,
        tables: scopedTables,
        attachments: uniqueAttachments({ fields: scopedValues, tables: scopedTables }),
        academicYear,
      }),
      sharedAdministrativeForm: true,
      contributorPost: userPost,
      academicYear,
      auditCycle: academicYear,
      cycleId: workflow.cycleId || academicYear,
      cycleType: workflow.cycleType || undefined,
      reportCategory: workflow.reportCategory || undefined,
      version: workflow.version || undefined,
      sections: modules.map((module) => module.number),
    };
  };

  const currentPayload = () => payloadForModules([activeModule]);

  const saveCurrentSection = async () => {
    if (readOnly) return;
    setSavingDraft(true);
    setSavingDraftAction("draft");
    setStatus("");

    try {
      setData((current) => ({
        ...current,
        lastSavedAt: new Date().toISOString(),
      }));
      await saveDraft(currentPayload(), { isUpdate: hasExistingSubmission });
      setHasExistingSubmission(true);
      setStatus(`Section ${activeModule.number || activeModule.title} draft saved successfully.`);
    } catch (error) {
      setStatus(getApiErrorMessage(error, "Could not save draft."));
    } finally {
      setSavingDraft(false);
      setSavingDraftAction("");
    }
  };

  const saveAndGoNext = async () => {
    const moduleIds = administrativeUserModules.map((module) => module.id);
    const currentIndex = moduleIds.indexOf(activeModuleId);
    const nextModuleId = moduleIds[Math.min(currentIndex + 1, moduleIds.length - 1)];

    if (readOnly) {
      if (nextModuleId && nextModuleId !== activeModuleId) {
        handleModuleChange(nextModuleId);
      }
      return;
    }

    setSavingDraft(true);
    setSavingDraftAction("next");
    setStatus("");
    const nextData = { ...data, lastSavedAt: new Date().toISOString() };

    try {
      setData(nextData);
      await saveDraft(currentPayload(), { isUpdate: hasExistingSubmission });
      setHasExistingSubmission(true);
      setStatus(`Section ${activeModule.number || activeModule.title} draft saved successfully.`);

      if (nextModuleId && nextModuleId !== activeModuleId) {
        handleModuleChange(nextModuleId);
      }
    } catch (error) {
      setStatus(getApiErrorMessage(error, "Could not save draft."));
    } finally {
      setSavingDraft(false);
      setSavingDraftAction("");
    }
  };

  const handleLogout = () => {
    clearAuthState();
    navigate("/login", { replace: true });
  };

  const storeAdministrativeSubmissionStatus = async ({ roleKey, submittedAt, confirmation, isUpdate = hasExistingSubmission }) => {
    const profile = getUserProfile();
    const nextFields = {
      ...data.fields,
      [ADMIN_SUBMISSION_STATUS_FIELD]: {
        ...storedAdministrativeStatusFor(data.fields),
        [roleKey]: {
          submitted: true,
          submittedAt,
          timeZone: "Asia/Kolkata",
          name: profile.name,
          email: profile.email,
          designation: profile.designation,
          confirmation,
        },
      },
    };

    setData((current) => ({
      ...current,
      fields: nextFields,
      lastSavedAt: new Date().toISOString(),
    }));

    await saveDraft(payloadForModules([activeModule], nextFields), { isUpdate });
  };

  const handleSubmitMyPart = async () => {
    if (readOnly) return;
    if (!canSubmitPart) {
      setSubmitStatus("Please confirm both declarations before submitting your part.");
      return;
    }
    if (!currentStatusRole) {
      setSubmitStatus("Could not identify your administrative role for submission.");
      return;
    }
    if (!window.confirm("Are you sure you want to submit your part of the Administrative Audit? This will lock your section from further edits.")) {
      return;
    }

    setSubmitting(true);
    setSubmitStatus("");

    try {
      const submittedAt = new Date().toISOString();
      await saveDraft(currentPayload(), { isUpdate: hasExistingSubmission });
      setHasExistingSubmission(true);
      await storeAdministrativeSubmissionStatus({
        roleKey: currentStatusRole.key,
        submittedAt,
        confirmation: submissionConfirmation,
        isUpdate: true,
      });
      const { data: response } = await submitAdministrativePart(workflow.cycleId || academicYear);
      const updatedDraft = normalizeDraft(response);

      setContributionApproved(true);
      setIsSubmitted(updatedDraft.isSubmitted);
      setWorkflow(workflowFromDraft(updatedDraft));
      setAdministrativeProgress(updatedDraft.administrativeProgress || {});
      setData((current) => ({
        ...current,
        fields: {
          ...current.fields,
          ...updatedDraft.values,
          [ADMIN_SUBMISSION_STATUS_FIELD]: updatedDraft.values[ADMIN_SUBMISSION_STATUS_FIELD] || current.fields[ADMIN_SUBMISSION_STATUS_FIELD],
        },
        tables: ensureDefaultTableRows({ ...current.tables, ...updatedDraft.tables }),
        attachments: updatedDraft.attachments.length ? updatedDraft.attachments : current.attachments,
        lastSavedAt: new Date().toISOString(),
      }));
      setSubmissionConfirmation(emptySubmissionConfirmation);
      setSubmitStatus("Your section has been submitted successfully.");
    } catch (error) {
      setSubmitStatus(getApiErrorMessage(error, "Could not submit your Administrative Audit section."));
    } finally {
      setSubmitting(false);
    }
  };

  if (reportMode) {
    return (
      <>
        <PrintStyles />
        <div className="admin-audit-shell" style={styles.shell}>
          <Sidebar
            activeModuleId={activeModuleId}
            setActiveModuleId={handleModuleChange}
            profile={profile}
            academicYear={academicYear}
            onLogout={() => setShowLogoutModal(true)}
            onOpenProfile={() => setShowProfileModal(true)}
          />
          <main className="admin-audit-main" style={styles.main}>
            <AdministrativeReportPanel
              meta={{ ...administrativeAuditMeta, academicYear }}
              modules={administrativeUserModules}
              data={data}
              onClose={() => setReportMode(false)}
            />
          </main>
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

  return (
    <>
      <PrintStyles />
      <div className="admin-audit-shell" style={styles.shell}>
        <Sidebar
          activeModuleId={activeModuleId}
          setActiveModuleId={handleModuleChange}
          profile={profile}
          academicYear={academicYear}
          currentAcademicYear={activeAcademicYear}
          availableYears={availableYears}
          onYearChange={(newYear) => {
            sessionStorage.setItem("academicYear", newYear);
            setAcademicYear(newYear);
          }}
          onLogout={() => setShowLogoutModal(true)}
          onOpenProfile={() => setShowProfileModal(true)}
          hasSchema={Boolean(dynamicSchema?.sections?.length)}
        />

        <main className="admin-audit-main" style={styles.main}>
          {schemaLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
              <div className="spinner-border text-primary" role="status" style={{ width: '3rem', height: '3rem' }}></div>
              <p style={{ marginTop: '16px', color: '#64748b', fontWeight: 600 }}>Loading Administrative Appraisal Form...</p>
            </div>
          ) : !dynamicSchema || !dynamicSchema.sections || dynamicSchema.sections.length === 0 ? (
            <div style={{ padding: "40px 24px", maxWidth: "820px", margin: "40px auto" }}>
              <div style={{
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: "16px",
                padding: "48px 36px",
                textAlign: "center",
                boxShadow: "0 4px 24px rgba(0,0,0,0.06)"
              }}>
                <div style={{ fontSize: "56px", marginBottom: "16px" }}>📋</div>
                <h2 style={{ fontSize: "22px", fontWeight: "800", color: "#0f172a", marginBottom: "8px" }}>
                  No Active Administrative Appraisal Form Published
                </h2>
                <p style={{ color: "#64748b", fontSize: "15px", lineHeight: "1.6", maxWidth: "580px", margin: "0 auto 24px" }}>
                  IQAC has not yet published an administrative appraisal form for <strong>{profile.designation || profile.post || "your administrative post"}</strong> for Academic Year <strong>{academicYear}</strong>.
                </p>
                <div style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: "10px",
                  padding: "16px 20px",
                  textAlign: "left",
                  color: "#166534",
                  fontSize: "14px",
                  display: "inline-block"
                }}>
                  <strong>💡 What happens next?</strong>
                  <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
                    <li>IQAC creates and designs the administrative appraisal modules and tables in <strong>Appraisal Form Studio</strong>.</li>
                    <li>Once IQAC clicks <strong>🚀 Publish Version</strong>, your form will instantly become available here for data entry and submission.</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <>
          <header className="admin-audit-header audit-form__header" style={styles.header}>
            <div style={styles.headerContent}>
              <img src={universityInfo?.logoUrl || universityLogo} alt="University Logo" style={styles.logo} />
              <div>
                <p style={styles.kicker}>{universityInfo?.universityName || administrativeAuditMeta.university}</p>
                <h1 style={styles.title}>{dynamicSchema?.title || administrativeAuditMeta.title}</h1>
                <p style={styles.meta}>{universityInfo?.address || administrativeAuditMeta.address}</p>
                <p style={styles.meta}>{universityInfo?.act || administrativeAuditMeta.act}</p>
                <p style={styles.year}>Academic Year {academicYear}</p>
                <p style={styles.cycleLabel}>{cycleLabelFor(workflow)}</p>
              </div>
            </div>
            <div style={styles.headerRight}>
              <img src={universityInfo?.iqacLogoUrl || iqacLogo} alt="IQAC Logo" style={styles.headerIqacLogo} />
              <div className="admin-audit-actions" style={styles.headerActions}>
                <button type="button" className="btn btn-secondary" onClick={resetActiveModule} disabled={readOnly || loadingDraft || savingDraft}>
                  Reset Section
                </button>
              </div>
            </div>
          </header>

          {isHistoricalYear && (
            <div style={{
              backgroundColor: "#eff6ff",
              border: "1px solid #bfdbfe",
              color: "#1e40af",
              padding: "12px 16px",
              borderRadius: "8px",
              marginTop: "16px",
              marginBottom: "16px",
              fontSize: "14px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}>
              <span style={{ fontSize: "16px" }}>ℹ️</span>
              <span>Viewing Historical Administrative Audit Record for Academic Year <strong>{academicYear}</strong>. Previous academic year records are read-only.</span>
            </div>
          )}

          {status && <div style={styles.submitStatus}>{status}</div>}
          {loadingDraft && <LoadingState label="Loading saved form..." compact />}

          {loadingDraft ? (
            <SkeletonList rows={3} />
          ) : <section className="admin-form-panel audit-section-card" style={styles.modulePanel}>
            <div style={styles.moduleHead}>
              <div>
                <h2 style={styles.moduleTitle}>
                  {activeModule.number ? `${activeModule.number}. ${activeModule.title}` : activeModule.title}
                </h2>
                {activeModule.note && <p style={styles.moduleNote}>{activeModule.note}</p>}
              </div>
              {activeModuleId !== "submission-status" && (
                <span style={canWorkOnOwnedModule ? styles.badge : styles.readOnlyBadge}>
                  {canWorkOnOwnedModule ? "Editable" : "Read only"}
                </span>
              )}
            </div>

            {!canEditActiveModule && activeModuleId !== "submission-status" && (
              <div style={styles.ownershipNotice}>
                This section can only be edited by {activeModule.owner}.
              </div>
            )}

            {activeModuleId === "submission-status" ? (
              <SubmissionStatusPanel
                cycleId={workflow.cycleId || academicYear}
                storedSubmissionStatus={storedAdministrativeStatusFor(data.fields)}
                administrativeProgress={administrativeProgress}
              />
            ) : (
              moduleBlocksFor(activeModule).map((block, index) => {
                if (block.type === "fields") {
                  return <FieldGrid key={`fields-${index}`} fields={block.fields} data={data} onChange={setFieldValue} readOnly={readOnly} />;
                }

                if (block.type === "text") {
                  return (
                    <p key={`text-${index}`} style={styles.sectionText}>
                      {block.text}
                    </p>
                  );
                }

                if (block.type === "attachment-field") {
                  return (
                    <AttachmentField
                      key={`attachment-${block.id}`}
                      label={block.label}
                      value={data.fields[block.id]}
                      onChange={(value) => setFieldValue(block.id, value)}
                      onUploadAttachment={uploadFormAttachments}
                      onDeleteAttachment={deleteFormAttachment}
                      readOnly={readOnly}
                    />
                  );
                }

                if (block.type === "part-e-schools") {
                  return (
                    <AdministrativePartE
                      key={`part-e-${index}`}
                      value={data.fields[block.fieldId]}
                      coursesOffered={data.tables.coursesOffered || []}
                      onChange={(value) => setFieldValue(block.fieldId, value)}
                      onUploadAttachment={uploadFormAttachments}
                      onDeleteAttachment={deleteFormAttachment}
                      readOnly={readOnly}
                    />
                  );
                }

                return (
                  <div key={`tables-${index}`} style={styles.tables}>
                    {block.tables.map((table) => (
                      <AuditTable
                        key={table.id}
                        table={table}
                        rows={data.tables[table.id] || []}
                        onCellChange={setCellValue}
                        onRowsChange={setTableRows}
                        onAddRow={addRow}
                        onDeleteLastRow={deleteLastRow}
                        onUploadAttachment={uploadFormAttachments}
                        onDeleteAttachment={deleteFormAttachment}
                        readOnly={readOnly}
                      />
                    ))}
                  </div>
                );
              })
            )}

            {isFinalOwnedModule && canWorkOnOwnedModule && (
              <div style={styles.submissionConfirmationWrap}>
                <SubmissionConfirmation
                  value={submissionConfirmation}
                  onChange={updateSubmissionConfirmation}
                  disabled={submitting}
                />
              </div>
            )}

            <div style={styles.sectionFooter}>
              {activeModuleId === "submission-status" ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setReportMode(true);
                    setPrintReportAfterRender(true);
                  }}
                >
                  Generate Report
                </button>
              ) : isFinalOwnedModule ? (
                canWorkOnOwnedModule ? (
                  <>
                    <button type="button" className="btn btn-secondary" onClick={saveCurrentSection} disabled={readOnly || savingDraft || loadingDraft || submitting} aria-busy={savingDraft}>
                      {savingDraftAction === "draft" && <InlineSpinner label="Saving section" />}
                      {savingDraftAction === "draft" ? "Saving..." : "Save Draft"}
                    </button>
                    <button type="button" className="btn btn-primary" onClick={handleSubmitMyPart} disabled={submitting || savingDraft || !canSubmitPart} aria-busy={submitting}>
                      {submitting && <InlineSpinner label="Submitting section" />}
                      {submitting ? "Submitting..." : "Submit My Part"}
                    </button>
                  </>
                ) : null
              ) : (
                <>
                  {!readOnly && (
                    <button type="button" className="btn btn-secondary" onClick={saveCurrentSection} disabled={readOnly || savingDraft || loadingDraft} aria-busy={savingDraft}>
                      {savingDraftAction === "draft" && <InlineSpinner label="Saving section" />}
                      {savingDraftAction === "draft" ? "Saving..." : "Save Draft"}
                    </button>
                  )}
                  <button type="button" className="btn btn-primary" onClick={saveAndGoNext} disabled={savingDraft || loadingDraft} aria-busy={savingDraft}>
                    {savingDraftAction === "next" && <InlineSpinner label="Saving section" />}
                    {savingDraftAction === "next" ? "Saving..." : (readOnly ? "Next" : "Save & Next")}
                  </button>
                </>
              )}
            </div>
            {(isLastModule || isFinalOwnedModule) && submitStatus && <div style={styles.submitStatus}>{submitStatus}</div>}
          </section>}
          </>
          )}
        </main>

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

function PrintStyles() {
  return (
    <style>{`
      @media (max-width: 900px) {
        .admin-audit-shell { flex-direction: column; }
        .admin-audit-main { padding: 18px !important; }
        .admin-audit-header { flex-direction: column; }
      }
      @media print {
        .app-sidebar,
        .admin-audit-actions,
        .admin-report-actions {
          display: none !important;
        }
        .admin-audit-shell {
          display: block !important;
          background: #fff !important;
        }
        .admin-audit-main {
          padding: 0 !important;
          overflow: visible !important;
        }
        body {
          background: #fff !important;
        }
      }
    `}</style>
  );
}

function AttachmentField({
  label,
  value = [],
  onChange,
  onUploadAttachment,
  onDeleteAttachment,
  readOnly = false,
}) {
  const files = Array.isArray(value) ? value : value ? [value] : [];
  const [uploading, setUploading] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState("");
  const [error, setError] = useState("");

  const handleUpload = async (selectedFiles) => {
    const nextFiles = Array.from(selectedFiles || []);
    if (readOnly || !nextFiles.length) return;

    setError("");
    const invalidType = nextFiles.find((file) => file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"));
    if (invalidType) {
      setError("Only PDF attachments are allowed.");
      return;
    }
    if (nextFiles.some((file) => file.size > 10 * 1024 * 1024)) {
      setError("Attachment must be 10MB or smaller.");
      return;
    }

    setUploading(true);
    try {
      const uploaded = onUploadAttachment
        ? await onUploadAttachment(nextFiles)
        : nextFiles.map((file) => ({ name: file.name, fileName: file.name, url: URL.createObjectURL(file) }));
      onChange?.([...files, ...uploaded]);
    } catch (uploadError) {
      setError(getApiErrorMessage(uploadError, "Attachment upload failed."));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (attachment) => {
    if (readOnly) return;
    if (!attachment?.url) {
      setError("Could not delete attachment because its URL is missing.");
      return;
    }
    if (!window.confirm(`Remove ${attachment.name || attachment.fileName || "this attachment"}?`)) return;

    setDeletingUrl(attachment.url);
    setError("");
    try {
      await onDeleteAttachment?.(attachment);
      onChange?.(files.filter((file) => file.url !== attachment.url));
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError, "Could not delete attachment."));
    } finally {
      setDeletingUrl("");
    }
  };

  return (
    <section style={styles.attachmentField}>
      <div style={styles.attachmentFieldLabel}>{label}</div>
      {error && <div style={styles.attachmentFieldError}>{error}</div>}
      <div style={styles.attachmentFieldBody}>
        {files.length ? (
          <div style={styles.attachmentList}>
            {files.map((file, index) => (
              <article key={`${file.url || file.name || "attachment"}-${index}`} style={styles.attachmentCard}>
                <div style={styles.attachmentName}>{file.name || file.fileName || "Attached document"}</div>
                <div style={styles.attachmentActions}>
                  {file.url && (
                    <a href={getAttachmentUrl(file.url)} target="_blank" rel="noreferrer" style={styles.attachmentOpen}>
                      Open
                    </a>
                  )}
                  {!readOnly && (
                    <button
                      type="button"
                      style={styles.attachmentRemove}
                      onClick={() => handleDelete(file)}
                      disabled={deletingUrl === file.url}
                    >
                      {deletingUrl === file.url ? "Removing..." : "Remove"}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div style={styles.attachmentEmpty}>No document attached.</div>
        )}
        {!readOnly && (
          <label style={styles.attachmentUploadButton}>
            {uploading ? "Uploading..." : "Attach PDF"}
            <input
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={(event) => {
                handleUpload(event.target.files);
                event.target.value = "";
              }}
              style={styles.attachmentFileInput}
              disabled={uploading}
              aria-label={label}
            />
          </label>
        )}
      </div>
    </section>
  );
}

function Sidebar({ activeModuleId, setActiveModuleId, profile, academicYear, currentAcademicYear, availableYears, onYearChange, onLogout, onOpenProfile, hasSchema }) {
  return (
    <AppSidebar
      title="Administrative Audit"
      subtitle="School Appraisal"
      badge="AA"
      roleTitle="Administrative Module"
      academicYear={academicYear}
      currentAcademicYear={currentAcademicYear}
      availableYears={availableYears}
      onYearChange={onYearChange}
      roleText="Registrar · HR · DSW · Placement"
      items={hasSchema ? administrativeUserModules : []}
      activeId={activeModuleId}
      onChange={setActiveModuleId}
      profile={profile}
      onLogout={onLogout}
      onOpenProfile={onOpenProfile}
    />
  );
}

function FieldGrid({ fields, data, onChange, readOnly = false }) {
  return (
    <div className="audit-field-grid" style={styles.fieldGrid}>
      {fields.map((field) => {
        const isWideField = field.type === "textarea" || [
          "universityName",
          "viceChancellor",
          "registrar",
          "placementActivitiesHeading",
          "internshipActivitiesHeading",
        ].includes(field.id);

        if (field.kind === "heading") {
          return (
            <h3 key={field.id} style={styles.subsectionHeading}>
              {field.label}
            </h3>
          );
        }

        return (
          <label className="audit-field" key={field.id} style={isWideField ? styles.wideField : styles.field}>
            <span style={styles.fieldLabel}>{field.label}</span>
            {field.type === "textarea" ? (
              <textarea
                value={data.fields[field.id] ?? ""}
                onChange={(event) => onChange(field.id, event.target.value)}
                className="audit-control"
                style={styles.textarea}
                rows={4}
                readOnly={readOnly}
              />
            ) : field.type === "date" ? (
              <DateInput
                value={data.fields[field.id] ?? ""}
                onChange={(value) => onChange(field.id, value)}
                className="audit-control"
                style={styles.input}
                readOnly={readOnly}
              />
            ) : (
              <input
                value={data.fields[field.id] ?? ""}
                onChange={(event) => onChange(field.id, event.target.value)}
                className="audit-control"
                style={styles.input}
                type="text"
                readOnly={readOnly}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}


function LogoutModal({ onCancel, onConfirm }) {
  return (
    <div style={styles.modalBackdrop} onClick={onCancel}>
      <div style={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div style={styles.modalTitle}>Confirm Logout</div>
        <div style={styles.modalText}>You are about to leave Administrative Audit. Any unsaved edits should already be autosaved locally.</div>
        <div style={styles.modalActions}>
          <button type="button" onClick={onCancel} style={styles.cancelButton}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} style={styles.confirmButton}>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  shell: {
    minHeight: "100vh",
    display: "flex",
    background: "#f5f7fb",
    color: "#0f172a",
    fontFamily: "Inter, 'Segoe UI', sans-serif",
  },
  sidebar: {
    width: 264,
    height: "100vh",
    position: "sticky",
    top: 0,
    flexShrink: 0,
    boxSizing: "border-box",
    overflow: "hidden",
    background: "#0f172a",
    display: "flex",
    flexDirection: "column",
    padding: "22px 16px",
    gap: 12,
    color: "#e2e8f0",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    boxShadow: "2px 0 16px rgba(15,23,42,0.14)",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 12,
    background: "linear-gradient(135deg,#0ea5e9,#2563eb)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontWeight: 900,
    fontSize: 14,
  },
  brandTitle: {
    color: "#f8fafc",
    fontWeight: 900,
    fontSize: 14,
  },
  brandSub: {
    color: "#94a3b8",
    fontSize: 14,
    marginTop: 2,
  },
  roleCard: {
    background: "#1d4ed8",
    borderRadius: 12,
    padding: "12px",
    color: "#bfdbfe",
  },
  roleTitle: {
    color: "#fff",
    fontWeight: 900,
    fontSize: 14,
  },
  roleText: {
    color: "#dbeafe",
    fontSize: 14,
    marginTop: 3,
  },
  roleYear: {
    color: "#bfdbfe",
    fontSize: 14,
    marginTop: 7,
    fontWeight: 900,
  },
  navCard: {
    background: "#1e293b",
    borderRadius: 10,
    padding: "12px",
  },
  navLabel: {
    display: "block",
    color: "#94a3b8",
    fontWeight: 900,
    fontSize: 14,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  navSelect: {
    width: "100%",
    border: "1px solid #334155",
    borderRadius: 8,
    background: "#0f172a",
    color: "#e2e8f0",
    padding: "9px 10px",
    fontSize: 14,
    fontWeight: 800,
    outline: "none",
  },
  queryCard: {
    margin: "8px 0",
    padding: "10px 12px",
    background: "rgba(37,99,235,0.15)",
    border: "1px solid #2563eb",
    borderRadius: 8,
  },
  queryLabel: {
    color: "#94a3b8",
    fontWeight: 700,
    fontSize: 14,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  queryLink: {
    color: "#60a5fa",
    fontWeight: 600,
    fontSize: 14,
    wordBreak: "break-all",
    textDecoration: "none",
  },
  sidebarSpacer: {
    flex: 1,
  },
  profileBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    paddingTop: 12,
    borderTop: "1px solid #1e293b",
  },
  profileRow: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    background: "#2563eb",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    fontSize: 14,
    flexShrink: 0,
  },
  profileText: {
    minWidth: 0,
  },
  profileName: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: 900,
    overflowWrap: "anywhere",
  },
  profileMeta: {
    color: "#64748b",
    fontSize: 14,
    marginTop: 2,
    overflowWrap: "anywhere",
  },
  logoutButton: {
    width: "100%",
    border: "1px solid #374151",
    borderRadius: 8,
    background: "transparent",
    color: "#f87171",
    padding: "9px 11px",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 14,
    fontFamily: "inherit",
  },
  main: {
    flex: 1,
    padding: "28px 30px 40px",
    overflowX: "auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 18,
    padding: "24px 26px",
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    background: "#fff",
    boxShadow: "0 10px 35px rgba(15,23,42,0.055)",
  },
  headerContent: {
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
    minWidth: 0,
  },
  logo: {
    width: 72,
    height: 72,
    objectFit: "contain",
    flexShrink: 0,
  },
  kicker: {
    margin: "0 0 8px",
    color: "#1d4ed8",
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
    letterSpacing: "-.025em",
    lineHeight: 1.2,
  },
  meta: {
    margin: "3px 0",
    color: "#64748b",
    fontSize: 12.5,
  },
  year: {
    margin: "10px 0 0",
    color: "#334155",
    fontSize: 11,
    fontWeight: 650,
  },
  cycleLabel: {
    margin: "7px 0 0",
    color: "#1d4ed8",
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: ".04em",
  },
  headerRight: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 10,
    flexShrink: 0,
  },
  headerIqacLogo: {
    height: 92,
    width: "auto",
    objectFit: "contain",
    flexShrink: 0,
  },
  headerActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  primaryButton: {
    border: "none",
    borderRadius: 8,
    background: "#2563eb",
    color: "#fff",
    padding: "11px 14px",
    fontSize: 14,
    fontWeight: 900,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    background: "#fff",
    color: "#334155",
    padding: "11px 14px",
    fontSize: 14,
    fontWeight: 900,
    cursor: "pointer",
  },
  modulePanel: {
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    background: "#fff",
    padding: 24,
    marginTop: 16,
    boxShadow: "0 12px 35px rgba(15,23,42,0.045)",
  },
  moduleHead: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    padding: "0 0 16px",
    borderBottom: "1px solid #edf1f6",
    marginBottom: 16,
  },
  moduleTitle: {
    margin: 0,
    color: "#0f172a",
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: "-.015em",
  },
  moduleNote: {
    margin: "6px 0 0",
    color: "#475569",
    fontSize: 12,
    fontWeight: 600,
  },
  badge: {
    borderRadius: 999,
    background: "#dcfce7",
    color: "#166534",
    padding: "5px 9px",
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: ".04em",
    textTransform: "uppercase",
  },
  readOnlyBadge: {
    borderRadius: 999,
    background: "#f1f5f9",
    color: "#475569",
    padding: "5px 9px",
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: ".04em",
    textTransform: "uppercase",
  },
  ownershipNotice: {
    marginBottom: 16,
    border: "1px solid #fde68a",
    borderRadius: 7,
    padding: "10px 12px",
    color: "#92400e",
    background: "#fffbeb",
    fontSize: 12,
    fontWeight: 650,
  },
  fieldGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))",
    gap: "20px 18px",
    marginBottom: 16,
  },
  sectionText: {
    margin: "0 0 16px",
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 800,
  },
  subsectionHeading: {
    gridColumn: "1 / -1",
    margin: "4px 0 0",
    color: "#0f172a",
    fontSize: 15,
    fontWeight: 700,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  wideField: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    gridColumn: "1 / -1",
  },
  fieldLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: 650,
  },
  attachmentField: {
    margin: "0 0 16px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  attachmentFieldLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: 700,
  },
  attachmentFieldBody: {
    display: "flex",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 10,
    padding: 12,
    border: "1px solid #d7dee9",
    borderRadius: 8,
    background: "#fbfcfe",
  },
  attachmentList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
    flex: "1 1 320px",
    gap: 10,
  },
  attachmentCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 10,
    border: "1px solid #dbe3ef",
    borderRadius: 8,
    background: "#fff",
  },
  attachmentName: {
    minWidth: 0,
    color: "#1e293b",
    fontSize: 12,
    fontWeight: 700,
    overflowWrap: "anywhere",
  },
  attachmentActions: {
    display: "flex",
    flexShrink: 0,
    gap: 8,
  },
  attachmentOpen: {
    border: "1px solid #bfdbfe",
    borderRadius: 6,
    color: "#1d4ed8",
    background: "#eff6ff",
    padding: "5px 9px",
    fontSize: 11,
    fontWeight: 750,
    textDecoration: "none",
  },
  attachmentRemove: {
    border: "1px solid #fecaca",
    borderRadius: 6,
    color: "#b91c1c",
    background: "#fff",
    padding: "5px 9px",
    fontSize: 11,
    fontWeight: 750,
    cursor: "pointer",
  },
  attachmentEmpty: {
    flex: "1 1 240px",
    color: "#64748b",
    fontSize: 12,
    padding: "8px 0",
  },
  attachmentUploadButton: {
    position: "relative",
    overflow: "hidden",
    flex: "0 0 auto",
    border: "1px solid #bfdbfe",
    borderRadius: 7,
    color: "#1d4ed8",
    background: "#eff6ff",
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 750,
    cursor: "pointer",
  },
  attachmentFileInput: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    opacity: 0,
    cursor: "pointer",
  },
  attachmentFieldError: {
    border: "1px solid #fecaca",
    borderRadius: 8,
    background: "#fef2f2",
    color: "#991b1b",
    padding: "9px 10px",
    fontSize: 12,
    fontWeight: 700,
  },
  input: {
    width: "100%",
    minHeight: 42,
    border: "1px solid #d7dee9",
    borderRadius: 8,
    padding: "10px 12px",
    color: "#0f172a",
    background: "#fbfcfe",
    outline: "none",
  },
  textarea: {
    width: "100%",
    minHeight: 96,
    resize: "vertical",
    border: "1px solid #d7dee9",
    borderRadius: 8,
    padding: "10px 12px",
    color: "#0f172a",
    background: "#fbfcfe",
    outline: "none",
  },
  tables: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  sectionFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
    padding: 0,
    border: 0,
    background: "transparent",
  },
  submissionConfirmationWrap: {
    marginTop: 28,
  },
  submitStatus: {
    border: "1px solid #bbf7d0",
    borderRadius: 8,
    background: "#f0fdf4",
    color: "#166534",
    padding: "10px 12px",
    fontSize: 14,
    fontWeight: 800,
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.55)",
    zIndex: 1000,
    display: "grid",
    placeItems: "center",
  },
  modal: {
    width: "min(380px, 92vw)",
    background: "#fff",
    borderRadius: 12,
    padding: "26px 28px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
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

const submittedStatusValues = new Set(["submitted", "approved", "under-review", "auditor-completed"]);

const progressInfoForRole = (administrativeProgress = {}, role = {}) => {
  const progressValue = administrativeProgress[role.key] ?? administrativeProgress[role.post];
  if (!progressValue) return {};

  if (typeof progressValue === "object") {
    const status = String(progressValue.status || progressValue.contributionStatus || "").toLowerCase().replaceAll("_", "-");
    return {
      submitted: Boolean(progressValue.submitted || progressValue.submittedAt || submittedStatusValues.has(status)),
      submittedAt: progressValue.submittedAt || progressValue.date || progressValue.updatedAt || progressValue.createdAt || null,
      name: progressValue.name || progressValue.submittedBy || progressValue.userName || null,
      email: progressValue.email || progressValue.submittedByEmail || null,
    };
  }

  const status = String(progressValue).toLowerCase().replaceAll("_", "-");
  return { submitted: submittedStatusValues.has(status) };
};

function SubmissionStatusPanel({ cycleId, storedSubmissionStatus = {}, administrativeProgress = {} }) {
  const [statusMap, setStatusMap] = useState({
    registrar: { submitted: false, submittedAt: null, name: null, email: null },
    hr: { submitted: false, submittedAt: null, name: null, email: null },
    deanStudentWelfare: { submitted: false, submittedAt: null, name: null, email: null },
    deanPlacement: { submitted: false, submittedAt: null, name: null, email: null }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;

    const loadStatus = async () => {
      try {
        const { data: res } = await fetchAdministrativeStatus(cycleId);
        if (!isActive) return;

        if (res) {
          setStatusMap((current) => ({
            registrar: res.registrar || current.registrar,
            hr: res.hr || current.hr,
            deanStudentWelfare: res.deanStudentWelfare || current.deanStudentWelfare,
            deanPlacement: res.deanPlacement || current.deanPlacement
          }));
        }
      } catch (err) {
        if (isActive) setError(getApiErrorMessage(err, "Failed to load submission status."));
      } finally {
        if (isActive) setLoading(false);
      }
    };

    loadStatus();

    return () => {
      isActive = false;
    };
  }, [cycleId]);

  if (loading) {
    return <LoadingState label="Loading status..." compact />;
  }

  return (
    <div style={statusStyles.container}>
      <h3 style={statusStyles.title}>Section Submission Progress</h3>
      <p style={statusStyles.intro}>
        The complete Administrative Appraisal Form will transition to the next step once all four roles have submitted their respective parts.
      </p>

      {error && <div style={statusStyles.error}>{error}</div>}

      <div style={statusStyles.table}>
        <div style={statusStyles.tableHeader}>
          <div style={statusStyles.colRole}>Authority / Role</div>
          <div style={statusStyles.colStatus}>Status</div>
          <div style={statusStyles.colDetails}>Submission Details</div>
        </div>

        {ADMIN_STATUS_ROLES.map((r) => {
          const info = statusMap[r.key] || { submitted: false, submittedAt: null, name: null, email: null };
          const storedInfo = storedSubmissionStatus[r.key] || {};
          const progressInfo = progressInfoForRole(administrativeProgress, r);
          const mergedInfo = {
            ...info,
            submitted: Boolean(info.submitted || storedInfo.submitted || progressInfo.submitted),
            submittedAt: storedInfo.submittedAt || info.submittedAt || progressInfo.submittedAt,
            name: storedInfo.name || info.name || progressInfo.name,
            email: storedInfo.email || info.email || progressInfo.email,
          };
          const formattedDate = formatSubmittedDateTime(mergedInfo.submittedAt);

          return (
            <div key={r.key} style={statusStyles.tableRow}>
              <div style={statusStyles.colRole}>
                <strong>{r.label}</strong>
              </div>
              <div style={statusStyles.colStatus}>
                <span style={mergedInfo.submitted ? statusStyles.badgeSubmitted : statusStyles.badgePending}>
                  {mergedInfo.submitted ? "Submitted" : "Pending"}
                </span>
              </div>
              <div style={statusStyles.colDetails}>
                {mergedInfo.submitted ? (
                  <div style={statusStyles.detailsText}>
                    <span>By: {mergedInfo.name || "N/A"} ({mergedInfo.email || "N/A"})</span>
                    <span style={statusStyles.timestamp}>On: {formattedDate}</span>
                  </div>
                ) : (
                  <span style={statusStyles.pendingText}>Waiting for submission</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const statusStyles = {
  container: {
    padding: "8px 0"
  },
  title: {
    margin: "0 0 10px",
    color: "#0f172a",
    fontSize: 18,
    fontWeight: 700
  },
  intro: {
    color: "#475569",
    fontSize: 13.5,
    lineHeight: 1.5,
    marginBottom: 20
  },
  error: {
    border: "1px solid #fecaca",
    borderRadius: 8,
    background: "#fef2f2",
    color: "#991b1b",
    padding: "10px 14px",
    fontSize: 13.5,
    fontWeight: 650,
    marginBottom: 16
  },
  success: {
    border: "1px solid #bbf7d0",
    borderRadius: 8,
    background: "#f0fdf4",
    color: "#166534",
    padding: "10px 14px",
    fontSize: 13.5,
    fontWeight: 650,
    marginBottom: 16
  },
  table: {
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    overflow: "hidden",
    background: "#fff"
  },
  confirmationWrap: {
    marginBottom: 18
  },
  tableHeader: {
    display: "flex",
    background: "#f8fafc",
    borderBottom: "1px solid #e2e8f0",
    padding: "12px 16px",
    fontWeight: 700,
    fontSize: 13,
    color: "#475569"
  },
  tableRow: {
    display: "flex",
    alignItems: "center",
    borderBottom: "1px solid #f1f5f9",
    padding: "16.5px 16px",
    fontSize: 14,
    color: "#0f172a"
  },
  colRole: {
    flex: "1.2",
    minWidth: 150
  },
  colStatus: {
    flex: "0.8",
    minWidth: 100
  },
  colDetails: {
    flex: "2",
    minWidth: 200
  },
  colAction: {
    flex: "1",
    minWidth: 130,
    textAlign: "right"
  },
  badgeSubmitted: {
    display: "inline-block",
    borderRadius: 6,
    background: "#dcfce7",
    color: "#166534",
    padding: "4px 8px",
    fontSize: 11,
    fontWeight: 700
  },
  badgePending: {
    display: "inline-block",
    borderRadius: 6,
    background: "#fef3c7",
    color: "#d97706",
    padding: "4px 8px",
    fontSize: 11,
    fontWeight: 700
  },
  detailsText: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    fontSize: 12.5,
    color: "#334155"
  },
  timestamp: {
    color: "#64748b",
    fontSize: 11.5
  },
  pendingText: {
    color: "#94a3b8",
    fontSize: 12.5,
    fontStyle: "italic"
  },
  submitBtn: {
    background: "#2563eb",
    border: "none",
    color: "#fff",
    borderRadius: 6,
    padding: "8px 12px",
    fontSize: 12.5,
    fontWeight: 700,
    cursor: "pointer",
    transition: "background 0.2s"
  },
  disabledBtn: {
    background: "#f1f5f9",
    border: "1px solid #cbd5e1",
    color: "#94a3b8",
    borderRadius: 6,
    padding: "8px 12px",
    fontSize: 12.5,
    fontWeight: 700,
    cursor: "not-allowed"
  }
};
