//renders a section of the audit form, like part A, part B, etc. It can contain fields and tables
import AuditTable from "./AuditTable";
import DateInput from "./DateInput";
import { getAttachmentUrl } from "../../../utils/attachment";

const ACADEMIC_PART_E_SECTION_ID = "part-e-observations";

const isAttachmentValue = (value) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  (value.url || value.publicUrl || value.downloadUrl || value.name || value.fileName);

const hasPartEValues = (values = {}) =>
  ["auditObservations", "auditRecommendations", "auditDocumentation"].some((fieldId) => {
    const value = values?.[fieldId];
    if (Array.isArray(value)) return value.length > 0;
    if (isAttachmentValue(value)) return true;
    return String(value || "").trim().length > 0;
  });

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

const assignmentPartEValues = (assignment = {}) => {
  const values = safeObjectValue(assignment.values || assignment.valuesData || assignment.reviewValues || assignment.reviewValuesData);
  return {
    ...values,
    auditObservations: assignment.auditObservations || values.auditObservations || "",
    auditRecommendations: assignment.auditRecommendations || values.auditRecommendations || "",
    auditDocumentation: assignment.auditDocumentation || values.auditDocumentation || "",
  };
};

const assignmentAuditor = (assignment = {}) => ({
  name: assignment.auditorName || assignment.name || "",
  designation: assignment.auditorDesignation || assignment.designation || "",
  role: assignment.auditorRole || assignment.role || assignment.auditorType || "",
  email: assignment.auditorEmail || assignment.email || "",
  date: assignment.submittedAt || assignment.auditorReviewedOn || "",
});

function FieldGrid({ fields, values, onFieldChange, readOnly = false }) {
  return (
    <div className="audit-field-grid" style={styles.fieldGrid}>
      {fields.map((field) => {
        if (field.kind === "heading") {
          return (
            <h3 key={field.id} style={styles.subheading}>
              {field.label}
            </h3>
          );
        }

        return (
          <label className="audit-field" key={field.id} style={field.type === "textarea" ? styles.wideField : styles.field}>
            <span style={styles.label}>{field.label}</span>
            {field.type === "textarea" ? (
              <textarea
                value={values[field.id] ?? ""}
                onChange={(event) => onFieldChange(field.id, event.target.value)}
                className="audit-control"
                style={styles.textarea}
                rows={4}
                readOnly={readOnly}
              />
            ) : field.type === "select" ? (
              <select
                value={values[field.id] ?? ""}
                onChange={(event) => onFieldChange(field.id, event.target.value)}
                className="audit-control"
                style={styles.input}
                disabled={readOnly}
              >
                <option value="">Select</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : field.type === "date" ? (
              <DateInput
                value={values[field.id] ?? ""}
                onChange={(value) => onFieldChange(field.id, value)}
                className="audit-control"
                style={styles.input}
                readOnly={readOnly}
              />
            ) : (
              <input
                value={values[field.id] ?? ""}
                onChange={(event) => onFieldChange(field.id, event.target.value)}
                className="audit-control"
                style={styles.input}
                type={field.type || "text"}
                readOnly={readOnly}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

function TableList({ tableDefinitions, tableValues, values, onFieldChange, onTableChange, onAddRow, onDeleteLastRow, onUploadAttachment, onDeleteAttachment, readOnly = false }) {
  return (
    <div style={styles.tables}>
      {tableDefinitions.map((table) => {
        const tableKey = table.tableKey || table.idString || (table.id != null ? String(table.id) : "");
        const rows = tableValues[tableKey] || (table.id != null ? tableValues[table.id] : []) || (table.tableKey ? tableValues[table.tableKey] : []) || [];
        return (
          <AuditTable
            key={table.id || tableKey}
            table={table}
            rows={rows}
            values={values}
            onFieldChange={onFieldChange}
            onChange={(rowIndex, column, value) => onTableChange(tableKey, rowIndex, column, value)}
            onAddRow={onAddRow}
            onDeleteLastRow={onDeleteLastRow}
            onUploadAttachment={onUploadAttachment}
            onDeleteAttachment={onDeleteAttachment}
            readOnly={readOnly}
          />
        );
      })}
    </div>
  );
}

function ReadOnlyPartEValue({ value }) {
  if (Array.isArray(value)) {
    const attachments = value.filter(isAttachmentValue);
    if (attachments.length) {
      return (
        <div style={styles.attachmentList}>
          {attachments.map((file, index) => {
            const url = file.url || file.publicUrl || file.downloadUrl;
            const name = file.name || file.fileName || file.filename || "View attachment";
            return url ? (
              <a key={`${url}-${index}`} href={getAttachmentUrl(url)} target="_blank" rel="noreferrer" style={styles.attachmentLink}>
                {name}
              </a>
            ) : (
              <span key={`${name}-${index}`}>{name}</span>
            );
          })}
        </div>
      );
    }

    return value.length ? <span>{value.join(", ")}</span> : <span style={styles.emptyText}>-</span>;
  }

  if (isAttachmentValue(value)) {
    const url = value.url || value.publicUrl || value.downloadUrl;
    const name = value.name || value.fileName || value.filename || "View attachment";
    return url ? (
      <a href={getAttachmentUrl(url)} target="_blank" rel="noreferrer" style={styles.attachmentLink}>
        {name}
      </a>
    ) : (
      <span>{name}</span>
    );
  }

  const text = String(value || "").trim();
  return text ? <span style={styles.readOnlyText}>{text}</span> : <span style={styles.emptyText}>-</span>;
}

function PartEAuditorBlock({ title, fields, values, auditor }) {
  if (!hasPartEValues(values)) return null;

  return (
    <section style={styles.partEReviewBlock}>
      <div style={styles.partEReviewHeader}>
        <h3 style={styles.partEReviewTitle}>{title}</h3>
        {auditor?.name && <span style={styles.partEReviewMeta}>{auditor.name}</span>}
      </div>
      <div style={styles.partEReviewGrid}>
        {fields.map((field) => (
          <div key={field.id} style={styles.partEReviewField}>
            <span style={styles.partEReviewLabel}>{field.label}</span>
            <ReadOnlyPartEValue value={values?.[field.id]} />
          </div>
        ))}
      </div>
    </section>
  );
}

function PartEAuditorAssignmentBlocks({ title, fields, assignments = [] }) {
  const reviews = assignments
    .map((assignment) => ({
      values: assignmentPartEValues(assignment),
      auditor: assignmentAuditor(assignment),
    }))
    .filter((review) => hasPartEValues(review.values));

  if (!reviews.length) return null;

  return reviews.map((review, index) => (
    <PartEAuditorBlock
      key={`${title}-${review.auditor.email || review.auditor.name || index}`}
      title={reviews.length > 1 ? `${title} - ${index + 1}` : title}
      fields={fields}
      values={review.values}
      auditor={review.auditor}
    />
  ));
}

function AcademicPartEReviewPanel({ fields, review }) {
  if (!review || review.isApproved === false) {
    return (
      <div style={styles.pendingIqacCard}>
        <div style={styles.pendingIqacTitle}>IQAC Approval Pending</div>
        <div style={styles.pendingIqacMessage}>
          IQAC has not approved your form yet. Part E audit observations, recommendations, and IQAC review remarks will be displayed here once your form is reviewed and approved by IQAC.
        </div>
      </div>
    );
  }

  const hasExternalReview = hasPartEValues(review?.externalValues);
  const internalAssignments = review?.reportCategory === "external"
    ? review?.previousInternalAssignments
    : review?.auditorAssignments;
  const hasInternalAssignmentReviews = (internalAssignments || []).some((assignment) => hasPartEValues(assignmentPartEValues(assignment)));
  const externalAssignments = review?.reportCategory === "external" ? review?.auditorAssignments : [];
  const hasExternalAssignmentReviews = externalAssignments.some((assignment) => hasPartEValues(assignmentPartEValues(assignment)));

  return (
    <div style={styles.partEReviewPanel}>
      {hasInternalAssignmentReviews ? (
        <PartEAuditorAssignmentBlocks title="Internal Auditor Part E" fields={fields} assignments={internalAssignments} />
      ) : (
        <PartEAuditorBlock
          title="Internal Auditor Part E"
          fields={fields}
          values={review?.internalValues}
          auditor={review?.internalAuditor}
        />
      )}
      {review?.reportCategory === "external" && (
        hasExternalAssignmentReviews ? (
          <PartEAuditorAssignmentBlocks title="External Auditor Part E" fields={fields} assignments={externalAssignments} />
        ) : hasExternalReview ? (
          <PartEAuditorBlock
            title="External Auditor Part E"
            fields={fields}
            values={review?.externalValues}
            auditor={review?.externalAuditor}
          />
        ) : (
          <section style={styles.partEReviewBlock}>
            <div style={styles.partEReviewHeader}>
              <h3 style={styles.partEReviewTitle}>External Auditor Part E</h3>
            </div>
            <div style={styles.pendingIqacCard}>
              <div style={styles.pendingIqacMessage}>
                Your form has not been reviewed by external.
              </div>
            </div>
          </section>
        )
      )}
      {review?.previousIqacRemarks && review?.reportCategory === "external" && (
        <section style={styles.partEReviewBlock}>
          <div style={styles.partEReviewHeader}>
            <h3 style={styles.partEReviewTitle}>IQAC Internal Audit Review Remarks</h3>
          </div>
          <p style={styles.readOnlyText}>{review.previousIqacRemarks}</p>
        </section>
      )}
      {review?.iqacRemarks && (
        <section style={styles.partEReviewBlock}>
          <div style={styles.partEReviewHeader}>
            <h3 style={styles.partEReviewTitle}>
              {review?.reportCategory === "external" ? "IQAC External Audit Review Remarks" : "IQAC Review Remarks"}
            </h3>
          </div>
          <p style={styles.readOnlyText}>{review.iqacRemarks}</p>
        </section>
      )}
    </div>
  );
}

export default function AuditSection({ section, values, tables, onFieldChange, onTableChange, onAddRow, onDeleteLastRow, onUploadAttachment, onDeleteAttachment, readOnly = false, academicPartEReview = null }) {
  const blocks = section.blocks || [
    ...(section.fields?.length ? [{ type: "fields", fields: section.fields }] : []),
    ...(section.tables?.length ? [{ type: "tables", tables: section.tables }] : []),
  ];
  const isPartESection = section.id === ACADEMIC_PART_E_SECTION_ID;

  return (
    <section className="audit-section-card" id={section.id} style={styles.section}>
      <div style={styles.headingRow}>
        <h2 style={styles.heading}>{section.title}</h2>
      </div>

      {blocks.map((block, index) => {
        if (block.type === "fields") {
          if (isPartESection) {
            return <AcademicPartEReviewPanel key={`part-e-review-${index}`} fields={block.fields} review={academicPartEReview} />;
          }

          return <FieldGrid key={`fields-${index}`} fields={block.fields} values={values} onFieldChange={onFieldChange} readOnly={readOnly} />;
        }

        return (
          <TableList
            key={`tables-${index}`}
            tableValues={tables}
            tableDefinitions={block.tables}
            values={values}
            onFieldChange={onFieldChange}
            onTableChange={onTableChange}
            onAddRow={onAddRow}
            onDeleteLastRow={onDeleteLastRow}
            onUploadAttachment={onUploadAttachment}
            onDeleteAttachment={onDeleteAttachment}
            readOnly={readOnly}
          />
        );
      })}
    </section>
  );
}

const styles = {
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 15,
    padding: 20,
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    background: "#fff",
    boxShadow: "0 12px 35px rgba(15, 23, 42, 0.045)",
  },
  headingRow: {
    padding: "0 0 15px",
    borderBottom: "1px solid #edf1f6",
  },
  heading: {
    margin: 0,
    color: "#0f172a",
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: "-.015em",
    lineHeight: 1.3,
  },
  fieldGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "18px 16px",
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
  label: {
    color: "#334155",
    fontSize: 12,
    fontWeight: 650,
  },
  subheading: {
    gridColumn: "1 / -1",
    margin: "8px 0 0",
    padding: 0,
    color: "#0f172a",
    background: "transparent",
    fontSize: 15,
    lineHeight: 1.35,
  },
  input: {
    width: "100%",
    minHeight: 42,
    border: "1px solid #d7dee9",
    borderRadius: 8,
    padding: "9px 11px",
    color: "#0f172a",
    background: "#fbfcfe",
    outline: "none",
  },
  textarea: {
    width: "100%",
    minHeight: 84,
    resize: "vertical",
    border: "1px solid #d7dee9",
    borderRadius: 8,
    padding: "9px 11px",
    color: "#0f172a",
    background: "#fbfcfe",
    outline: "none",
  },
  tables: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  pendingIqacCard: {
    padding: "20px 24px",
    border: "1px solid #fed7aa",
    borderRadius: 12,
    background: "#fff7ed",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  pendingIqacTitle: {
    color: "#c2410c",
    fontSize: 15,
    fontWeight: 750,
  },
  pendingIqacMessage: {
    color: "#9a3412",
    fontSize: 13.5,
    lineHeight: 1.5,
    fontWeight: 500,
  },
  partEReviewPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  partEReviewBlock: {
    padding: 16,
    border: "1px solid #dbe3ef",
    borderRadius: 12,
    background: "#f8fafc",
  },
  partEReviewHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottom: "1px solid #e2e8f0",
  },
  partEReviewTitle: {
    margin: 0,
    color: "#0f172a",
    fontSize: 15,
    fontWeight: 800,
  },
  partEReviewMeta: {
    color: "#475569",
    fontSize: 12,
    fontWeight: 700,
  },
  partEReviewGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 12,
  },
  partEReviewField: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  partEReviewLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: 750,
  },
  readOnlyText: {
    margin: 0,
    color: "#0f172a",
    fontSize: 13,
    fontWeight: 650,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
  },
  emptyText: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: 700,
  },
  attachmentList: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 6,
  },
  attachmentLink: {
    color: "#1d4ed8",
    fontSize: 13,
    fontWeight: 750,
    textDecoration: "none",
  },
};
