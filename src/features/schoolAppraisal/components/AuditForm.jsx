import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage } from "../../../api/client";
import { buildSubmissionPayload, deleteAttachment, fetchMyDraft, fetchSubmissionSnapshots, normalizeDraft, saveDraft, signOffProfileFromSession, submitDraft, uploadAttachments, withSubmitterSignOff } from "../../../api/submissions";
import universityLogo from "../../../assets/images/image.png";
import iqacLogo from "../../../assets/images/IQAS.png";
import AuditReportPanel from "./AuditReportPanel";
import AuditSection from "./AuditSection";
import { InlineSpinner, LoadingState, SkeletonList } from "./LoadingState";
import SubmissionConfirmation from "./SubmissionConfirmation";
import { emptySubmissionConfirmation, isSubmissionConfirmed } from "./submissionConfirmationState";
import { columnsWithSerial, serialColumnFor } from "./tableHelpers";
import { scrollPageToTop } from "../../../utils/scrollToTop";
import { SCHOOL_OPTIONS, canonicalSchoolCode } from "../userManagement/userManagementConfig";

const DEFAULT_SCHOOL_ADDRESS = "Dr. D. Y. Patil International University, Sector 29, Pradhikaran, Akurdi, Pune - Maharashtra, INDIA 411044";

const schoolFullNameFromCode = (code = "") => {
  return String(code || "").trim();
};

const emptyRowFor = (columns) =>
  columnsWithSerial(columns).reduce((row, column) => {
    row[column] = "";
    return row;
  }, {});

const numberedRowFor = (columns, index) => {
  const row = emptyRowFor(columns);
  const serialColumn = serialColumnFor(Object.keys(row));
  if (serialColumn) row[serialColumn] = String(index + 1);
  return row;
};

const withSerialNumbers = (columns, rows) => {
  const normalizedColumns = columnsWithSerial(columns);
  const serialColumn = serialColumnFor(normalizedColumns);

  return rows.map((row, index) => ({
    ...numberedRowFor(columns, index),
    ...row,
    ...(serialColumn && !row[serialColumn] ? { [serialColumn]: String(index + 1) } : {}),
  }));
};

const ACADEMIC_PART_E_FIELD_IDS = ["auditObservations", "auditRecommendations", "auditDocumentation"];

const safeJsonParse = (value, fallback) => {
  if (value == null || value === "") return fallback;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const responseList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.submissions)) return payload.submissions;
  if (Array.isArray(payload?.snapshots)) return payload.snapshots;
  if (Array.isArray(payload?.history)) return payload.history;
  return [];
};

const snapshotPayload = (entry = {}) => entry.submission || entry.snapshot || entry.data || entry;
const normalizeStatus = (value = "") => String(value || "").trim().toLowerCase().replaceAll("_", "-");
const normalizeCategory = (value = "") => String(value || "").trim().toLowerCase().replaceAll("_", "-");
const compactAcademicYear = (value = "") => String(value || "")
  .replace(/\s+/g, "")
  .replace(/[–—]/g, "-")
  .replace(/(\d{4})-(\d{2})(?!\d)/, (_, start, end) => `${start}-20${end}`);
const draftBelongsToAcademicYear = (draft = {}, academicYear = "") => {
  const expectedYear = compactAcademicYear(academicYear);
  const draftYear = compactAcademicYear(draft.auditCycle || draft.cycleId || "");
  return !draft.exists || !expectedYear || !draftYear || draftYear === expectedYear;
};
const normalizeHistoryDraft = (entry = {}, fallbackValues = {}, fallbackTables = {}) => {
  const normalized = normalizeDraft(snapshotPayload(entry), fallbackValues, fallbackTables);
  return {
    ...normalized,
    version: Number(entry.version || entry.snapshotVersion || entry.reportVersion || normalized.version || 0),
    reportCategory: normalizeCategory(entry.reportCategory || entry.approvedReportCategory || entry.category || normalized.reportCategory),
    auditCycle: entry.auditCycle || entry.cycleLabel || normalized.auditCycle,
  };
};
const isAttachmentValue = (value) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  (value.url || value.publicUrl || value.downloadUrl || value.name || value.fileName);

const hasAcademicPartEValues = (values = {}) =>
  ACADEMIC_PART_E_FIELD_IDS.some((fieldId) => {
    const value = values?.[fieldId];
    if (Array.isArray(value)) return value.length > 0;
    if (isAttachmentValue(value)) return true;
    return String(value || "").trim().length > 0;
  });

const getAuditorSignOff = (entry = {}) => {
  const signOff = entry.values?.__auditSignOff || {};
  const auditedBy = signOff.auditedBy || signOff.auditorBy || {};
  return {
    name: auditedBy.name || entry.auditorReviewedBy || "",
    designation: auditedBy.designation || entry.auditorReviewedByDesignation || "",
    role: auditedBy.role || entry.auditorReviewedByRole || "",
    email: auditedBy.email || entry.auditorReviewedByEmail || "",
    date: auditedBy.date || entry.auditorReviewedOn || "",
  };
};

const normalizedAssignmentValues = (assignment = {}) => {
  const parsed = typeof assignment.values === "object" && assignment.values !== null
    ? assignment.values
    : safeJsonParse(assignment.valuesData || assignment.values || assignment.reviewValues || assignment.reviewValuesData, {});

  return {
    ...parsed,
    auditObservations: assignment.auditObservations || parsed.auditObservations || "",
    auditRecommendations: assignment.auditRecommendations || parsed.auditRecommendations || "",
    auditDocumentation: assignment.auditDocumentation || parsed.auditDocumentation || "",
  };
};

const assignmentAuditor = (assignment = {}) => ({
  name: assignment.auditorName || assignment.name || "",
  designation: assignment.auditorDesignation || assignment.designation || "",
  role: assignment.auditorRole || assignment.role || assignment.auditorType || "",
  email: assignment.auditorEmail || assignment.email || "",
  date: assignment.submittedAt || assignment.auditorReviewedOn || "",
});

const assignmentsForType = (assignments = [], auditorType = "") =>
  assignments.filter((assignment) =>
    normalizeCategory(assignment.auditorType || assignment.forwardedAuditorType || assignment.type).includes(auditorType) &&
    hasAcademicPartEValues(normalizedAssignmentValues(assignment))
  );
const latestSubmittedAssignment = (assignments = []) =>
  [...assignments].sort((first, second) =>
    new Date(second.submittedAt || second.auditorReviewedOn || 0) -
    new Date(first.submittedAt || first.auditorReviewedOn || 0)
  )[0];

const buildAcademicPartEReview = (draft = {}, history = []) => {
  const status = normalizeStatus(draft.overallStatus || draft.status);
  const reportCategory = normalizeCategory(draft.reportCategory || draft.cycleType);

  if (reportCategory === "internal" && status !== "approved") {
    return { isApproved: false };
  }

  const sortedHistory = [...history].sort((first, second) => Number(second.version || 0) - Number(first.version || 0));
  const previousInternal = sortedHistory.find((entry) =>
    (
      normalizeCategory(entry.reportCategory || entry.cycleType) === "internal" ||
      (reportCategory === "external" && Number(entry.version || 0) < Number(draft.version || 0))
    ) &&
    (hasAcademicPartEValues(entry.values) || (entry.auditorAssignments && entry.auditorAssignments.length > 0))
  );

  const currentHasPartE = hasAcademicPartEValues(draft.values);

  if (reportCategory === "internal") {
    const assignments = Array.isArray(draft.auditorAssignments) ? draft.auditorAssignments : [];
    const internalAssignments = assignmentsForType(assignments, "internal");
    const internalAssignment = latestSubmittedAssignment(internalAssignments);
    const internalValues =
      internalAssignment ? normalizedAssignmentValues(internalAssignment) :
      currentHasPartE ? draft.values :
      {};

    return {
      isApproved: true,
      reportCategory: "internal",
      internalValues,
      externalValues: {},
      iqacRemarks: draft.remarks || "",
      previousIqacRemarks: "",
      internalAuditor: internalAssignment ? assignmentAuditor(internalAssignment) : getAuditorSignOff(draft),
      externalAuditor: null,
      auditorAssignments: internalAssignments,
    };
  }

  // External cycle:
  const previousInternalAssignments = Array.isArray(previousInternal?.auditorAssignments) ? previousInternal.auditorAssignments : [];
  const submittedPreviousInternalAssignments = assignmentsForType(previousInternalAssignments, "internal");
  const previousInternalAssignment = latestSubmittedAssignment(submittedPreviousInternalAssignments);

  const internalValues =
    previousInternalAssignment ? normalizedAssignmentValues(previousInternalAssignment) :
    previousInternal?.values || {};

  const internalAuditor = previousInternalAssignment ? assignmentAuditor(previousInternalAssignment) : getAuditorSignOff(previousInternal);
  const previousIqacRemarks = previousInternal?.remarks || "";
  const assignments = Array.isArray(draft.auditorAssignments) ? draft.auditorAssignments : [];
  const externalAssignments = assignmentsForType(assignments, "external");
  const externalAssignment = latestSubmittedAssignment(externalAssignments);

  if (status === "approved") {
    const externalValues =
      externalAssignment ? normalizedAssignmentValues(externalAssignment) :
      currentHasPartE ? draft.values :
      {};

    return {
      isApproved: true,
      reportCategory: "external",
      internalValues,
      externalValues,
      iqacRemarks: draft.remarks || "",
      previousIqacRemarks,
      internalAuditor,
      externalAuditor: externalAssignment ? assignmentAuditor(externalAssignment) : getAuditorSignOff(draft),
      auditorAssignments: externalAssignments,
      previousInternalAssignments: submittedPreviousInternalAssignments,
    };
  }

  // External cycle, but not approved yet (e.g. draft, under-review)
  return {
    isApproved: true,
    reportCategory: "external",
    internalValues,
    externalValues: {},
    iqacRemarks: "",
    previousIqacRemarks,
    internalAuditor,
    externalAuditor: externalAssignment ? assignmentAuditor(externalAssignment) : null,
    auditorAssignments: externalAssignments,
    previousInternalAssignments: submittedPreviousInternalAssignments,
  };
};

function buildInitialValues(schema) {
  if (!schema?.sections) return {};
  return schema.sections.reduce((values, section) => {
    const fields = [
      ...(section.fields || []),
      ...(section.blocks || []).flatMap((block) => (block.type === "fields" ? block.fields : [])),
    ];

    fields.forEach((field) => {
      if (field.kind === "heading") return;
      values[field.id] = "";
    });
    return values;
  }, {});
}

function buildInitialTables(schema) {
  if (!schema?.sections) return {};
  return schema.sections.reduce((tables, section) => {
    const tableDefinitions = [
      ...(section.tables || []),
      ...(section.blocks || []).flatMap((block) => (block.type === "tables" ? block.tables : [])),
    ];

    tableDefinitions.forEach((table) => {
      const rows = table.initialRows?.length ? table.initialRows : [numberedRowFor(table.columns || [], 0)];
      const formatted = withSerialNumbers(table.columns || [], rows);
      const key = table.tableKey || table.idString || (table.id != null ? String(table.id) : "");
      if (key) tables[key] = formatted;
      if (table.id != null) tables[table.id] = formatted;
      if (table.tableKey && !tables[table.tableKey]) tables[table.tableKey] = formatted;
      if (table.idString && !tables[table.idString]) tables[table.idString] = formatted;
    });
    return tables;
  }, {});
}

export default function AuditForm({
  schema,
  academicYear = schema.academicYear,
  activeAcademicYear,
  isHistoricalYear: isHistoricalProp,
  activeSectionId,
  reportMode,
  onReportModeChange,
  onSectionChange,
}) {
  const auditType = schema.id.includes("administrative") ? "administrative" : "academic";
  const defaultSchoolName = useMemo(() => schoolFullNameFromCode(sessionStorage.getItem("school") || ""), []);
  const initialValues = useMemo(() => {
    const values = buildInitialValues(schema);
    if ("schoolName" in values) values.schoolName = defaultSchoolName;
    if ("address" in values) values.address = DEFAULT_SCHOOL_ADDRESS;
    return values;
  }, [schema, defaultSchoolName]);
  const withSchoolDefaults = useCallback((fieldValues = {}) => ({
    ...fieldValues,
    ...("schoolName" in initialValues && !fieldValues.schoolName ? { schoolName: defaultSchoolName } : {}),
    ...("address" in initialValues && !fieldValues.address ? { address: DEFAULT_SCHOOL_ADDRESS } : {}),
  }), [initialValues, defaultSchoolName]);
  const initialTables = useMemo(() => buildInitialTables(schema), [schema]);
  const [values, setValues] = useState(initialValues);
  const [tables, setTables] = useState(initialTables);
  const [attachments, setAttachments] = useState([]);
  const [status, setStatus] = useState("");
  const [submitStatus, setSubmitStatus] = useState("");
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionConfirmation, setSubmissionConfirmation] = useState(emptySubmissionConfirmation);
  const [hasExistingSubmission, setHasExistingSubmission] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [academicPartEReview, setAcademicPartEReview] = useState(null);
  const [printReportAfterRender, setPrintReportAfterRender] = useState(false);
  const activeSectionIndex = Math.max(
    0,
    schema.sections.findIndex((section) =>
      String(section.id) === String(activeSectionId) ||
      String(section.sectionKey) === String(activeSectionId) ||
      String(section.idString) === String(activeSectionId)
    )
  );
  const isLastSection = activeSectionIndex === schema.sections.length - 1;
  const isHistoricalYear = isHistoricalProp !== undefined
    ? isHistoricalProp
    : Boolean(activeAcademicYear && compactAcademicYear(academicYear) !== compactAcademicYear(activeAcademicYear));
  const readOnly = isSubmitted || isHistoricalYear;
  const canSubmit = isSubmissionConfirmed(submissionConfirmation);
  const progress = Math.round(((activeSectionIndex + 1) / schema.sections.length) * 100);

  useEffect(() => {
    if (!reportMode || !printReportAfterRender) return undefined;

    const timer = window.setTimeout(() => {
      window.print();
      setPrintReportAfterRender(false);
    }, 150);

    return () => window.clearTimeout(timer);
  }, [printReportAfterRender, reportMode]);

  useEffect(() => {
    let isActive = true;

    const loadDraft = async () => {
      setLoadingDraft(true);
      setStatus("");

      try {
        const { data } = await fetchMyDraft(auditType, academicYear);
        const draft = normalizeDraft(data, initialValues, initialTables);
        const activeDraft = draftBelongsToAcademicYear(draft, academicYear)
          ? draft
          : normalizeDraft({}, initialValues, initialTables);
        let historyEntries = responseList(activeDraft.versionHistory).map((entry, index) =>
          normalizeHistoryDraft(entry, initialValues, initialTables, index)
        );

        if (auditType === "academic" && activeDraft.id) {
          try {
            const { data: snapshotsData } = await fetchSubmissionSnapshots(activeDraft.id);
            historyEntries = [
              ...historyEntries,
              ...responseList(snapshotsData).map((entry, index) =>
                normalizeHistoryDraft(entry, initialValues, initialTables, index)
              ),
            ];
          } catch {
            // History is optional for internal approvals. External approvals still render current Part E when snapshots are unavailable.
          }
        }

        if (!isActive) return;
        setValues(withSchoolDefaults(activeDraft.values));
        setTables(activeDraft.tables);
        setAttachments(activeDraft.attachments);
        setHasExistingSubmission(activeDraft.exists);
        setIsSubmitted(activeDraft.isSubmitted);
        setAcademicPartEReview(auditType === "academic" ? buildAcademicPartEReview(activeDraft, historyEntries) : null);
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
  }, [academicYear, auditType, initialTables, initialValues, withSchoolDefaults]);

  const handleFieldChange = (fieldId, value) => {
    setValues((current) => ({ ...current, [fieldId]: value }));
    setStatus("");
  };

  const handleTableChange = (tableId, rowIndex, column, value) => {
    setTables((current) => {
      const strKey = String(tableId);
      const existing = current[strKey] || (typeof tableId === "number" ? current[tableId] : []) || [];
      let rows = Array.isArray(existing) ? [...existing] : [];
      if (rowIndex >= rows.length) {
        while (rows.length <= rowIndex) {
          rows.push({});
        }
      }
      rows = rows.map((row, index) => (index === rowIndex ? { ...row, [column]: value } : row));
      return {
        ...current,
        [strKey]: rows,
        ...(typeof tableId === "number" ? { [tableId]: rows } : {}),
      };
    });
    setStatus("");
  };

  const handleAddRow = (table) => {
    const key = table.tableKey || table.idString || (table.id != null ? String(table.id) : "");
    setTables((current) => {
      const existing = current[key] || (table.id != null ? current[table.id] : []) || [];
      const rows = Array.isArray(existing) ? existing : [];
      const nextRows = [...rows, numberedRowFor(table.columns || [], rows.length)];
      return {
        ...current,
        ...(key ? { [key]: nextRows } : {}),
        ...(table.id != null ? { [table.id]: nextRows } : {}),
        ...(table.tableKey ? { [table.tableKey]: nextRows } : {}),
      };
    });
  };

  const handleDeleteLastRow = (table) => {
    const key = table.tableKey || table.idString || (table.id != null ? String(table.id) : "");
    setTables((current) => {
      const existing = current[key] || (table.id != null ? current[table.id] : []) || [];
      const rows = Array.isArray(existing) ? existing : [];
      const nextRows = rows.slice(0, -1);
      const formatted = nextRows.length ? withSerialNumbers(table.columns || [], nextRows) : [numberedRowFor(table.columns || [], 0)];
      return {
        ...current,
        ...(key ? { [key]: formatted } : {}),
        ...(table.id != null ? { [table.id]: formatted } : {}),
        ...(table.tableKey ? { [table.tableKey]: formatted } : {}),
      };
    });
  };

  const currentPayload = () => buildSubmissionPayload({ auditType, values, tables, attachments, academicYear });

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    setStatus("");

    try {
      await saveDraft(currentPayload(), { isUpdate: hasExistingSubmission });
      setHasExistingSubmission(true);
      setStatus("Draft saved successfully.");
    } catch (error) {
      setStatus(getApiErrorMessage(error, "Could not save draft."));
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSaveAndNext = async () => {
    const currentIndex = activeSectionIndex;
    const nextSection = schema.sections[Math.min(currentIndex + 1, schema.sections.length - 1)];
    const nextSectionId = nextSection ? (nextSection.id || nextSection.sectionKey || nextSection.idString) : null;

    if (readOnly) {
      if (nextSectionId && nextSectionId !== activeSectionId) {
        onSectionChange?.(nextSectionId);
        scrollPageToTop();
      }
      return;
    }

    setSavingDraft(true);
    setStatus("");

    try {
      await saveDraft(currentPayload(), { isUpdate: hasExistingSubmission });
      setHasExistingSubmission(true);
      setStatus("Draft saved successfully.");

      if (nextSectionId && nextSectionId !== activeSectionId) {
        onSectionChange?.(nextSectionId);
        scrollPageToTop();
      }
    } catch (error) {
      setStatus(getApiErrorMessage(error, "Could not save draft."));
    } finally {
      setSavingDraft(false);
    }
  };

  const handleClear = () => {
    if (!window.confirm("Are you sure you want to clear the form? All unsaved changes will be lost.")) return;

    setValues(initialValues);
    setTables(initialTables);
    setAttachments([]);
    setAcademicPartEReview(null);
    setIsSubmitted(false);
    setStatus("Form cleared.");
  };

  const handleGenerateReport = () => {
    onReportModeChange(true);
    setPrintReportAfterRender(true);
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      setSubmitStatus("Please confirm both declarations before submitting.");
      return;
    }

    setSubmitting(true);
    setSubmitStatus("");

    try {
      const signedValues = withSubmitterSignOff(values, signOffProfileFromSession("director"));
      await submitDraft(buildSubmissionPayload({ auditType, values: signedValues, tables, attachments, academicYear }), { isUpdate: hasExistingSubmission });
      setValues(signedValues);
      setHasExistingSubmission(true);
      setIsSubmitted(true);
      setSubmitStatus("Academic Audit submitted successfully.");
    } catch (error) {
      setSubmitStatus(getApiErrorMessage(error, "Could not submit Academic Audit."));
    } finally {
      setSubmitting(false);
    }
  };

  if (reportMode) {
    const reportPartEValues = academicPartEReview?.reportCategory === "external"
      ? academicPartEReview?.externalValues
      : academicPartEReview?.internalValues;
    const reportValues = academicPartEReview ? { ...values, ...reportPartEValues } : values;
    const reportSchema = schema;

    return (
      <div className="academic-report-view" style={styles.form}>
        <div className="academic-report-actions" style={styles.actions}>
          <button type="button" className="btn btn-secondary" onClick={() => onReportModeChange(false)}>
            Close
          </button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            Print Report
          </button>
        </div>
        <AuditReportPanel
          schema={{ ...reportSchema, academicYear }}
          values={reportValues}
          tables={tables}
          submissionSchool={sessionStorage.getItem("school") || values.schoolName || ""}
          reportCategory={academicPartEReview?.reportCategory || ""}
          currentAuditor={
            academicPartEReview?.reportCategory === "external"
              ? academicPartEReview?.externalAuditor
              : academicPartEReview?.internalAuditor
          }
          previousInternalAuditor={academicPartEReview?.internalAuditor}
          previousInternalValues={academicPartEReview?.reportCategory === "external" ? academicPartEReview?.internalValues : {}}
          auditorAssignments={academicPartEReview?.auditorAssignments || []}
          iqacRemarks={academicPartEReview?.iqacRemarks}
        />
      </div>
    );
  }

  return (
    <form className="audit-form" style={styles.form} onSubmit={(event) => event.preventDefault()}>
      <header className="audit-form__header" style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.logoWrap}><img src={universityLogo} alt="DYPIU Logo" style={styles.logo} /></div>
          <div style={styles.headerCopy}>
            <p style={styles.kicker}>{schema.header.university}</p>
            <h1 style={styles.title}>{schema.title}</h1>
            <p style={styles.meta}>{schema.header.address}</p>
            <div style={styles.headerMetaRow}>
              <span style={styles.year}>Academic Year {academicYear}</span>
              <span style={isHistoricalYear ? styles.readOnlyPill : isSubmitted ? styles.readOnlyPill : styles.draftPill}>
                {isHistoricalYear ? "Read Only" : isSubmitted ? "Submitted (Read Only)" : "Current Workspace"}
              </span>
            </div>
          </div>
        </div>
        <div style={styles.headerRight}>
          <img src={iqacLogo} alt="IQAC Logo" style={styles.headerIqacLogo} />
          <div style={styles.actions}>
            <button type="button" className="btn btn-secondary" onClick={handleClear} disabled={readOnly}>
              Clear
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSaveDraft} disabled={readOnly || savingDraft || loadingDraft} aria-busy={savingDraft}>
              {savingDraft && <InlineSpinner label="Saving draft" />}
              {savingDraft ? "Saving..." : "Save Draft"}
            </button>
          </div>
        </div>
        <div className="audit-form__progress" style={styles.progressTrack}>
          <span style={{ ...styles.progressBar, width: `${progress}%` }} />
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
          <span>Viewing Historical Appraisal Record for Academic Year <strong>{academicYear}</strong>. Previous academic year records are read-only.</span>
        </div>
      )}

      {isSubmitted && !isHistoricalYear && (
        <div style={{
          backgroundColor: "#f0fdf4",
          border: "1px solid #bbf7d0",
          color: "#166534",
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
          <span style={{ fontSize: "16px" }}>✅</span>
          <span>This appraisal for Academic Year <strong>{academicYear}</strong> has already been submitted and is currently under review. The form is displayed in view-only mode.</span>
        </div>
      )}

      {status && <div style={styles.status}>{status}</div>}
      {loadingDraft && <LoadingState label="Loading saved form..." compact />}

      <div style={styles.sections}>
        {loadingDraft ? (
          <SkeletonList rows={2} />
        ) : schema.sections
          .filter((section) =>
            !activeSectionId ||
            String(section.id) === String(activeSectionId) ||
            String(section.sectionKey) === String(activeSectionId) ||
            String(section.idString) === String(activeSectionId)
          )
          .map((section) => (
            <AuditSection
              key={section.id || section.sectionKey || section.idString}
              section={section}
              values={values}
              tables={tables}
              onFieldChange={handleFieldChange}
              onTableChange={handleTableChange}
              onAddRow={handleAddRow}
              onDeleteLastRow={handleDeleteLastRow}
              onUploadAttachment={async (files) => {
                const uploaded = await uploadAttachments(files);
                setAttachments((current) => [...current, ...uploaded]);
                return uploaded;
              }}
              onDeleteAttachment={async (attachment) => {
                await deleteAttachment(attachment);
                setAttachments((current) => current.filter((file) => file.url !== attachment.url));
              }}
              readOnly={readOnly}
              academicPartEReview={auditType === "academic" ? academicPartEReview : null}
            />
          ))}
      </div>

      {isLastSection && !readOnly && (
        <SubmissionConfirmation
          value={submissionConfirmation}
          onChange={setSubmissionConfirmation}
          disabled={submitting}
        />
      )}

      <div style={styles.sectionFooter}>
        {isLastSection ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={handleGenerateReport}>
              Generate Report
            </button>
            {!readOnly && (
              <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submitting || !canSubmit} aria-busy={submitting}>
                {submitting && <InlineSpinner label="Submitting form" />}
                {submitting ? "Submitting..." : "Submit"}
              </button>
            )}
          </>
        ) : (
          <button type="button" className="btn btn-primary" onClick={handleSaveAndNext} disabled={savingDraft || loadingDraft} aria-busy={savingDraft}>
            {savingDraft && <InlineSpinner label="Saving section" />}
            {savingDraft ? "Saving..." : (readOnly ? "Next" : "Save & Next")}
          </button>
        )}
      </div>
      {isLastSection && submitStatus && <div style={styles.status}>{submitStatus}</div>}
    </form>
  );
}

const styles = {
  form: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },
  header: {
    position: "relative",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 18,
    padding: "24px 26px 28px",
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    background: "#fff",
    boxShadow: "0 10px 35px rgba(15, 23, 42, 0.055)",
    overflow: "hidden",
  },
  headerContent: {
    display: "flex",
    alignItems: "flex-start",
    gap: 18,
    minWidth: 0,
  },
  headerCopy: { minWidth: 0 },
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
    flexShrink: 0,
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
    letterSpacing: "-.025em",
    lineHeight: 1.25,
  },
  meta: {
    margin: "3px 0",
    color: "#64748b",
    fontSize: 12.5,
    lineHeight: 1.45,
  },
  headerMetaRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 10 },
  year: { color: "#334155", fontSize: 11, fontWeight: 650 },
  draftPill: { padding: "4px 8px", borderRadius: 999, color: "#0369a1", background: "#e0f2fe", fontSize: 9.5, fontWeight: 700, letterSpacing: ".03em", textTransform: "uppercase" },
  readOnlyPill: { padding: "4px 8px", borderRadius: 999, color: "#475569", background: "#e2e8f0", fontSize: 9.5, fontWeight: 700, letterSpacing: ".03em", textTransform: "uppercase" },
  progressTrack: { position: "absolute", left: 0, right: 0, bottom: 0, height: 4, background: "#eff6ff" },
  progressBar: { display: "block", height: "100%", borderRadius: "0 4px 4px 0", background: "linear-gradient(90deg, #2563eb, #38bdf8)", transition: "width .3s ease" },
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
  actions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  primaryButton: {
    border: "1px solid #2563eb",
    borderRadius: 5,
    color: "#fff",
    background: "#2563eb",
    padding: "10px 13px",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #cbd5e1",
    borderRadius: 5,
    color: "#334155",
    background: "#fff",
    padding: "10px 13px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  status: {
    padding: "10px 12px",
    border: "1px solid #bbf7d0",
    borderRadius: 10,
    color: "#166534",
    background: "#f0fdf4",
    fontSize: 14,
    fontWeight: 700,
  },
  sections: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
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
};
