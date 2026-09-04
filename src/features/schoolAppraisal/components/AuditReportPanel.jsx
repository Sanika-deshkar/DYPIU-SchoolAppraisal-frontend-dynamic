import { columnsWithSerial } from "./tableHelpers";
import universityLogo from "../../../assets/images/image.png";
import iqacLogo from "../../../assets/images/IQAS.png";
import { SIGN_OFF_FIELD } from "../../../api/submissions";
import { formatDateDDMMYYYY } from "../../../utils/dateFormat";
import { getAttachmentUrl } from "../../../utils/attachment";

const blocksFor = (section) =>
  section.blocks || [
    ...(section.fields?.length ? [{ type: "fields", fields: section.fields }] : []),
    ...(section.tables?.length ? [{ type: "tables", tables: section.tables }] : []),
  ];

const isOmittedReportText = (value) =>
  String(value || "").trim().toLowerCase() === "reviewers (vc & iqac) cannot create or submit audits";
const ACADEMIC_PART_E_SECTION_ID = "part-e-observations";
const ACADEMIC_PART_E_FIELD_IDS = ["auditObservations", "auditRecommendations", "auditDocumentation"];
const isAttachmentValue = (value) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  (value.url || value.publicUrl || value.downloadUrl || value.name || value.fileName);
const hasAcademicPartEValues = (values = {}) =>
  ACADEMIC_PART_E_FIELD_IDS.some((fieldId) => {
    const value = values[fieldId];
    if (Array.isArray(value)) return value.length > 0;
    if (isAttachmentValue(value)) return true;
    if (value && typeof value === "object") return Object.keys(value).length > 0;
    return String(value || "").trim().length > 0;
  });
const normalizeStatus = (value = "") => String(value).trim().toLowerCase().replaceAll("_", "-");
const isSubmittedAuditorAssignment = (assignment = {}) =>
  ["submitted", "completed", "auditor-completed", "approved"].includes(normalizeStatus(assignment.status)) ||
  Boolean(assignment.submittedAt);
const titleCase = (value = "") => String(value || "").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
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
const normalizeAssignmentText = (value = "") => String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const uniqueValues = (values) => [...new Set(values.filter(Boolean))];
const fieldValueKey = (value) => {
  if (isAttachmentValue(value)) return value.url || value.publicUrl || value.downloadUrl || value.fileName || value.name;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
};
const isEmptyReviewValue = (value) => {
  if (Array.isArray(value)) return value.length === 0;
  if (isAttachmentValue(value)) return false;
  if (value && typeof value === "object") return Object.keys(value).length === 0;
  return String(value || "").trim() === "";
};
const mergeReviewValues = (base = {}, next = {}) => {
  const merged = { ...base };
  Object.entries(next).forEach(([fieldId, value]) => {
    if (Array.isArray(merged[fieldId]) || Array.isArray(value)) {
      const seen = new Set();
      merged[fieldId] = [...valueList(merged[fieldId]), ...valueList(value)].filter((item) => {
        const key = fieldValueKey(item);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return;
    }
    if (isEmptyReviewValue(merged[fieldId]) && !isEmptyReviewValue(value)) {
      merged[fieldId] = value;
    }
  });
  return merged;
};
const auditorDisplayKeyFor = (assignment = {}, index = 0) => {
  const type = normalizeAssignmentText(assignment.auditorType || assignment.type || "");
  const id = String(assignment.auditorId || assignment.userId || "").trim();
  if (id) return `id:${type}:${id}`;
  const email = normalizeAssignmentText(assignment.auditorEmail || assignment.email || assignment.username || "");
  if (email) return `email:${type}:${email}`;
  return `assignment:${assignment.key || index}`;
};
const assignmentLabel = (value = "") => {
  const labels = {
    registrar: "Registrar",
    hr: "HR",
    "dean-student-welfare": "Dean Student Welfare",
    "dean-placement": "Dean Placement",
  };
  return labels[value] || titleCase(value || "Assigned Review");
};
const groupAuditorAssignmentsForDisplay = (assignments = []) => {
  const groups = new Map();
  assignments.forEach((assignment, index) => {
    const key = auditorDisplayKeyFor(assignment, index);
    const values = safeObjectValue(assignment.values || assignment.valuesData || assignment.reviewValues || assignment.reviewValuesData);
    const posts = uniqueValues(valueList(assignment.school || assignment.post));
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, { ...assignment, values, displayPosts: posts, groupedAssignments: [assignment] });
      return;
    }

    existing.values = mergeReviewValues(existing.values, values);
    existing.displayPosts = uniqueValues([...existing.displayPosts, ...posts]);
    existing.groupedAssignments = [...existing.groupedAssignments, assignment];
    existing.submittedAt = existing.submittedAt || assignment.submittedAt;
  });
  return [...groups.values()];
};

export default function AuditReportPanel({
  schema,
  values,
  tables,
  submissionSchool = "",
  reportCategory = "",
  auditorAssignments = [],
  currentAuditor = {},
  previousInternalAuditor = {},
  previousInternalValues = {},
  previousInternalMeta = "",
  iqacRemarks = "",
}) {
  const isExternalReport = String(reportCategory).toLowerCase() === "external";
  const submittedAuditorAssignments = auditorAssignments.filter(isSubmittedAuditorAssignment);

  return (
    <div className="generated-report" style={styles.panel}>
      <header className="generated-report__cover" style={styles.header}>
        <img src={universityLogo} alt="DYPIU Logo" style={styles.logo} />
        <div style={styles.headerText}>
          <p style={styles.kicker}>{schema.header.university}</p>
          <h1 style={styles.title}>{schema.title}</h1>
          <p style={styles.meta}>{schema.header.address}</p>
          <p style={styles.meta}>{schema.header.act}</p>
          <p style={styles.year}>Academic Year {schema.academicYear}</p>
        </div>
        <div className="generated-report__document-meta" style={styles.documentMeta}>
          <img src={iqacLogo} alt="IQAC Logo" style={styles.documentLogo} />
          <span style={styles.generatedDate}>Prepared {formatDateDDMMYYYY(new Date())}</span>
        </div>
      </header>

      {schema.sections.map((section, sectionIndex) => (
        <section className="generated-report__section" key={section.id} style={styles.section}>
          <div className="generated-report__section-heading" style={styles.sectionHeading}>
            <span style={styles.sectionNumber}>{String(sectionIndex + 1).padStart(2, "0")}</span>
            <h2 style={styles.sectionTitle}>{section.title}</h2>
          </div>
          {blocksFor(section).map((block, blockIndex) => {
            if (block.type === "fields") {
              if (section.id === ACADEMIC_PART_E_SECTION_ID && submittedAuditorAssignments.length) {
                return (
                  <AuditorReportReviews
                    key={`auditor-reviews-${blockIndex}`}
                    fields={block.fields}
                    assignments={submittedAuditorAssignments}
                  />
                );
              }

              const showPreviousInternalPartE =
                isExternalReport &&
                section.id === ACADEMIC_PART_E_SECTION_ID &&
                hasAcademicPartEValues(previousInternalValues);

              if (showPreviousInternalPartE) {
                return (
                  <div key={`part-e-comparison-${blockIndex}`} style={styles.partEReportComparison}>
                    <div style={styles.partEReportBlock}>
                      <div style={styles.partEReportHeader}>
                        <h3 style={styles.partEReportTitle}>Internal Auditor Part E - V1</h3>
                        {previousInternalMeta && <span style={styles.partEReportMeta}>{previousInternalMeta}</span>}
                      </div>
                      <ReportFieldsTable fields={block.fields} values={previousInternalValues} />
                    </div>
                    <div style={styles.partEReportBlock}>
                      <h3 style={styles.partEReportTitle}>External Auditor Part E - Current External Audit</h3>
                      <ReportFieldsTable fields={block.fields} values={values} />
                    </div>
                  </div>
                );
              }

              return (
                <ReportFieldsTable key={`fields-${blockIndex}`} fields={block.fields} values={values} />
              );
            }

            if (!Array.isArray(block.tables)) {
              return null;
            }

            return block.tables.map((table) => {
              const columns = columnsWithSerial(table.columns);
              const tableKey = table.tableKey || table.idString || (table.id != null ? String(table.id) : "");
              const rows = tables[tableKey] || (table.id != null ? tables[table.id] : []) || (table.tableKey ? tables[table.tableKey] : []) || [];

              return (
                <div className="generated-report__table-block" key={table.id || tableKey} style={styles.tableBlock}>
                  {table.showTitle !== false && <h3 className="generated-report__table-title" style={styles.tableTitle}>{table.title}</h3>}
                  <div className="generated-report__table-wrap" style={styles.tableScroller}>
                  <table className="audit-data-table" style={styles.table}>
                      <thead>
                        <tr>
                          {columns.map((column) => (
                            <th key={column} style={styles.th}>
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, rowIndex) => (
                          <tr key={`${table.id || tableKey}-${rowIndex}`}>
                            {columns.map((column) => (
                              <td key={column} style={styles.td}>
                                <ReportCellValue value={row[column]} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            });
          })}
        </section>
      ))}

      {iqacRemarks && <IqacReviewRemarks remarks={iqacRemarks} />}

      <CertificationSignOff
        signOff={values[SIGN_OFF_FIELD]}
        submissionSchool={submissionSchool}
        reportCategory={reportCategory}
        currentAuditor={currentAuditor}
        previousInternalAuditor={previousInternalAuditor}
      />
    </div>
  );
}

function AuditorReportReviews({ fields, assignments }) {
  const visibleFields = fields.filter((field) => field.kind !== "heading");
  const displayAssignments = groupAuditorAssignmentsForDisplay(assignments);
  return (
    <div style={styles.auditorReportGrid}>
      {displayAssignments.map((assignment, index) => {
        const values = safeObjectValue(assignment.values);
        const displayPost = (assignment.displayPosts || [assignment.school || assignment.post])
          .map(assignmentLabel)
          .join(", ");
        return (
          <section key={assignment.key || `${assignment.auditorId}-${assignment.school || assignment.post}-${index}`} style={styles.auditorReportCard}>
            <div style={styles.auditorReportHeader}>
              <div>
                <h3 style={styles.auditorReportTitle}>Auditor {index + 1}: {assignment.auditorName || assignment.name || "Auditor"}</h3>
                {(assignment.auditorEmail || assignment.email) && <p style={styles.auditorReportMeta}>{assignment.auditorEmail || assignment.email}</p>}
              </div>
              <div style={styles.auditorReportChips}>
                <span>{titleCase(assignment.auditorType || "auditor")}</span>
                <span>{displayPost}</span>
                <span>{assignment.submittedAt ? `Submitted ${formatDateDDMMYYYY(assignment.submittedAt)}` : "Submitted"}</span>
              </div>
            </div>
            <ReportFieldsTable fields={visibleFields} values={values} />
          </section>
        );
      })}
    </div>
  );
}

function formatSignOffDate(value) {
  return formatDateDDMMYYYY(value);
}

function approverLabel(role = "") {
  return String(role).includes("vice-chancellor") ? "Vice Chancellor" : String(role).includes("iqac") ? "IQAC Authority" : "Approving Authority";
}

function SignerDetails({ signer = {}, pendingText }) {
  if (!signer.name) return <div style={styles.pendingApproval}>{pendingText}</div>;

  return (
    <>
      <div style={styles.signatureRow}><span>Name</span><strong>{signer.name}</strong></div>
      <div style={styles.signatureRow}><span>Designation</span><strong>{signer.designation || "-"}</strong></div>
      {signer.role && <div style={styles.signatureRow}><span>Role</span><strong>{signer.role}</strong></div>}
      {signer.email && <div style={styles.signatureRow}><span>Email</span><strong>{signer.email}</strong></div>}
      <div style={styles.signatureRow}><span>Date</span><strong>{formatSignOffDate(signer.date)}</strong></div>
    </>
  );
}

function CertificationSignOff({
  signOff = {},
  submissionSchool = "",
  reportCategory = "",
  currentAuditor = {},
  previousInternalAuditor = {},
}) {
  const submittedBy = signOff?.submittedBy || {};
  const storedAuditor = signOff?.auditedBy || signOff?.auditorBy || {};
  const approvedBy = signOff?.approvedBy || {};
  const activeAuditor = currentAuditor.name ? currentAuditor : storedAuditor;
  const isExternalReport = String(reportCategory).toLowerCase() === "external";
  const internalAuditor = isExternalReport ? previousInternalAuditor : activeAuditor;
  const submitterDesignation = submissionSchool
    ? `Director, ${submissionSchool}`
    : submittedBy.designation || "Director";

  return (
    <section className="generated-report__signatures" style={styles.signatureWrap}>
      <div style={styles.signatureBlock}>
        <h3 style={styles.signerTitle}>Form filled and submitted by</h3>
        <div style={styles.signatureRow}><span>Name</span><strong>{submittedBy.name || "-"}</strong></div>
        <div style={styles.signatureRow}><span>Designation</span><strong>{submitterDesignation}</strong></div>
        <div style={styles.signatureRow}><span>Date</span><strong>{formatSignOffDate(submittedBy.date)}</strong></div>
      </div>
      <div style={styles.signatureBlock}>
        <h3 style={styles.signerTitle}>Internal Auditor remarks filled by</h3>
        <SignerDetails signer={internalAuditor} pendingText="Pending internal auditor remarks" />
      </div>
      {isExternalReport && (
        <div style={styles.signatureBlock}>
          <h3 style={styles.signerTitle}>External Auditor remarks filled by</h3>
          <SignerDetails signer={activeAuditor} pendingText="Pending external auditor remarks" />
        </div>
      )}
      <div style={styles.signatureBlock}>
        <h3 style={styles.signerTitle}>Approved by {approverLabel(approvedBy.role)}</h3>
        <SignerDetails signer={approvedBy} pendingText="Pending approval" />
      </div>
    </section>
  );
}

function IqacReviewRemarks({ remarks }) {
  return (
    <section className="generated-report__iqac-remarks" style={styles.iqacReviewSection}>
      <div style={styles.sectionHeading}>
        <span style={styles.sectionNumber}>IQ</span>
        <h2 style={styles.sectionTitle}>IQAC Review Remarks</h2>
      </div>
      <p style={styles.iqacReviewText}>{remarks}</p>
    </section>
  );
}

function ReportFieldsTable({ fields, values }) {
  return (
    <table className="generated-report__detail-table" style={styles.detailsTable}>
      <tbody>
        {fields.filter((field) => !isOmittedReportText(field.label) && !isOmittedReportText(values[field.id])).map((field) => field.kind === "heading" ? (
          <tr key={field.id}>
            <th className="generated-report__detail-heading" colSpan="2" style={styles.detailHeading}>{field.label}</th>
          </tr>
        ) : (
          <tr key={field.id}>
            <th scope="row" style={styles.detailLabel}>{field.label}</th>
            <td style={styles.detailValue}><ReportCellValue value={values[field.id]} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportCellValue({ value }) {
  if (!value) return "-";
  if (Array.isArray(value)) {
    return value.length ? (
      <div>{value.map((file, index) => <ReportCellValue key={`${file?.url || file?.name || "attachment"}-${index}`} value={file} />)}</div>
    ) : "-";
  }
  if (typeof value !== "object") return isOmittedReportText(value) ? "-" : String(value);
  const name = value.name || value.fileName || value.filename || "View attachment";
  const url = value.url || value.publicUrl || value.downloadUrl;
  return url ? <a className="generated-report__attachment" href={getAttachmentUrl(url)} target="_blank" rel="noreferrer">{name}</a> : name;
}

const styles = {
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  header: {
    display: "grid",
    gridTemplateColumns: "76px minmax(0, 1fr) 132px",
    alignItems: "center",
    gap: 18,
    padding: 22,
    border: "1px solid #dbe3ef",
    borderTop: "5px solid #2563eb",
    borderRadius: 16,
    background: "#fff",
    boxShadow: "0 14px 36px rgba(15, 23, 42, 0.07)",
  },
  headerText: {
    minWidth: 0,
    textAlign: "center",
  },
  logo: {
    width: 72,
    height: 72,
    objectFit: "contain",
    flexShrink: 0,
  },
  kicker: {
    margin: "0 0 7px",
    color: "#1d4ed8",
    fontSize: 14,
    fontWeight: 900,
    textTransform: "uppercase",
  },
  title: {
    margin: "0 0 8px",
    color: "#0f172a",
    fontSize: 18,
  },
  meta: {
    margin: "2px 0",
    color: "#64748b",
    fontSize: 14,
  },
  year: {
    margin: "10px 0 0",
    color: "#334155",
    fontWeight: 900,
    fontSize: 14,
  },
  documentMeta: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, justifySelf: "end", width: 132 },
  documentLogo: {
    width: 54,
    height: 54,
    objectFit: "contain",
  },
  generatedDate: { color: "#64748b", fontSize: 11 },
  section: {
    padding: 18,
    border: "1px solid #dbe3ef",
    borderRadius: 14,
    background: "#fff",
  },
  sectionHeading: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid #e2e8f0" },
  sectionNumber: { width: 34, height: 34, display: "grid", placeItems: "center", flex: "0 0 34px", borderRadius: 9, color: "#fff", background: "#1e293b", fontSize: 11, fontWeight: 800 },
  sectionTitle: {
    margin: 0,
    color: "#0f172a",
    fontSize: 18,
  },
  detailsTable: { width: "100%", marginBottom: 14, borderCollapse: "collapse", tableLayout: "fixed" },
  detailHeading: { padding: "9px 12px", border: "1px solid #cbd5e1", color: "#1e3a8a", background: "#eff6ff", fontSize: 12, textAlign: "left" },
  detailLabel: { width: "36%", padding: "9px 12px", border: "1px solid #dbe3ef", color: "#475569", background: "#f8fafc", fontSize: 11, fontWeight: 700, textAlign: "left", verticalAlign: "top" },
  detailValue: { padding: "9px 12px", border: "1px solid #dbe3ef", color: "#0f172a", background: "#fff", fontSize: 11.5, whiteSpace: "pre-wrap", verticalAlign: "top" },
  auditorReportGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
    gap: 12,
  },
  auditorReportCard: {
    breakInside: "avoid",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    border: "1px solid #dbe3ef",
    borderRadius: 8,
    padding: 12,
    background: "#fbfdff",
  },
  auditorReportHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    paddingBottom: 10,
    borderBottom: "1px solid #e2e8f0",
    flexWrap: "wrap",
  },
  auditorReportTitle: { margin: 0, color: "#0f172a", fontSize: 13.5, fontWeight: 900 },
  auditorReportMeta: { margin: "3px 0 0", color: "#64748b", fontSize: 11.5, fontWeight: 700 },
  auditorReportChips: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 6,
    color: "#1d4ed8",
    fontSize: 10.5,
    fontWeight: 850,
  },
  partEReportComparison: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  partEReportBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  partEReportHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  partEReportTitle: {
    margin: "0 0 8px",
    padding: "9px 12px",
    borderLeft: "4px solid #2563eb",
    borderRadius: 6,
    background: "#eff6ff",
    color: "#0f172a",
    fontSize: 14,
  },
  partEReportMeta: {
    color: "#2563eb",
    fontSize: 11,
    fontWeight: 800,
  },
  subheading: {
    gridColumn: "1 / -1",
    margin: "6px 0 0",
    color: "#0f172a",
    fontSize: 18,
  },
  fieldGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
    marginBottom: 14,
  },
  fieldBlock: {
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: 10,
    background: "#f8fafc",
  },
  fieldLabel: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: 900,
    marginBottom: 5,
  },
  fieldValue: {
    color: "#0f172a",
    fontSize: 14,
    whiteSpace: "pre-wrap",
  },
  tableBlock: {
    marginTop: 24,
  },
  tableTitle: {
    margin: "0 0 8px",
    padding: "10px 12px",
    borderLeft: "4px solid #2563eb",
    borderRadius: 6,
    background: "#eff6ff",
    color: "#0f172a",
    fontSize: 18,
  },
  tableScroller: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    minWidth: 0,
    borderCollapse: "collapse",
    tableLayout: "fixed",
  },
  th: {
    padding: "8px 9px",
    border: "1px solid #cbd5e1",
    background: "#eef4fb",
    color: "#334155",
    fontSize: 14,
    textAlign: "left",
  },
  td: {
    padding: "8px 9px",
    border: "1px solid #e2e8f0",
    color: "#0f172a",
    fontSize: 14,
    verticalAlign: "top",
  },
  signatureWrap: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 28,
    padding: "28px 36px",
    border: "1px solid #dbe3ef",
    borderRadius: 10,
    background: "#fff",
  },
  signatureTitle: { gridColumn: "1 / -1", margin: 0, color: "#0f172a", fontSize: 16 },
  signatureBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 800,
  },
  signerTitle: { margin: "0 0 12px", color: "#0f172a", fontSize: 14 },
  iqacReviewSection: {
    breakBefore: "page",
    pageBreakBefore: "always",
    padding: 18,
    border: "1px solid #dbe3ef",
    borderRadius: 14,
    background: "#fff",
  },
  iqacReviewText: {
    margin: 0,
    color: "#1e293b",
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1.65,
    whiteSpace: "pre-wrap",
  },
  pendingApproval: { padding: "18px 0", color: "#64748b", fontSize: 13, fontWeight: 700 },
  signatureRow: {
    display: "grid",
    gridTemplateColumns: "118px 1fr",
    alignItems: "center",
    gap: 8,
  },
  signatureLine: {
    borderBottom: "1px solid #0f172a",
    minHeight: 18,
  },
  dateLine: {
    minHeight: 18,
  },
};
