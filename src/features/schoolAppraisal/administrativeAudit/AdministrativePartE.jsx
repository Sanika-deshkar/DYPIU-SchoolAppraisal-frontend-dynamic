import { useMemo, useState } from "react";
import { SCHOOL_OPTIONS } from "../userManagement/userManagementConfig";
import AuditTable from "../components/AuditTable";

const PLACEMENT_COLUMNS = [
  "Sr No",
  "Program",
  "(i) Number of Companies Visited",
  "(ii) Number of Students Placed",
  "(iii) Highest Salary Offered",
  "(iv) Average Salary Offered",
  "(v) Median Salary Offered",
  "List of Students Attachment",
];

const ACTIVITY_COLUMNS = [
  "Sr No",
  "Activity",
  "(i) Number of Organizations",
  "(ii) Number of Students",
  "(iii) Activities with Stipend",
  "(iv) Total Activities",
  "All Students List Attachment",
  "Certificates Attachment",
];

const SESSION_ACTIVITY_COLUMNS = [
  "Sr No",
  "Title of the Session",
  "Name of the Resource Person",
  "Date of Conduction",
  "No. of Beneficiaries",
  "Link for Proofs",
];

const TRAINING_COLUMNS = [
  "Sr No",
  "Academic Year",
  "Title of the Event",
  "Date of Conduction",
  "No. of Students Benefited",
  "Attachment",
];

const COLLABORATION_COLUMNS = [
  "Sr No",
  "Organization / Institution / Industry",
  "Year of Signing MoU",
  "Duration of MoU",
  "Activities Conducted Under the MoU",
  "Attachment",
];

const tableDefinitions = {
  placementPrograms: {
    id: "placementPrograms",
    title: "Section A - Placement Activities",
    columns: PLACEMENT_COLUMNS,
  },
  activities: {
    id: "activities",
    title: "Section B1 - Internship",
    columns: ACTIVITY_COLUMNS,
  },
  careerGuidanceActivities: {
    id: "careerGuidanceActivities",
    title: "Section B2 - Career Guidance",
    columns: SESSION_ACTIVITY_COLUMNS,
    dateColumns: ["Date of Conduction"],
  },
  industryInteractionActivities: {
    id: "industryInteractionActivities",
    title: "Section B3 - Industry Interaction",
    columns: SESSION_ACTIVITY_COLUMNS,
    dateColumns: ["Date of Conduction"],
  },
  otherActivities: {
    id: "otherActivities",
    title: "Section B4 - Other Activities",
    columns: SESSION_ACTIVITY_COLUMNS,
    dateColumns: ["Date of Conduction"],
  },
  trainingActivities: {
    id: "trainingActivities",
    title: "Section C - Training / Skill Development Activities",
    columns: TRAINING_COLUMNS,
  },
  industryCollaborations: {
    id: "industryCollaborations",
    title: "Section D - Industry Collaborations",
    columns: COLLABORATION_COLUMNS,
  },
};

const emptyRow = (columns, index, values = {}) =>
  columns.reduce((row, column) => ({
    ...row,
    [column]: column === "Sr No" ? String(index + 1) : values[column] ?? "",
  }), {});

const renumberRows = (rows = []) =>
  rows.map((row, index) => ({ ...row, "Sr No": String(index + 1) }));

const attachmentsIn = (value, attachments = []) => {
  if (Array.isArray(value)) {
    value.forEach((item) => attachmentsIn(item, attachments));
    return attachments;
  }
  if (!value || typeof value !== "object") return attachments;
  if (value.url || value.publicUrl || value.downloadUrl) {
    attachments.push(value);
    return attachments;
  }
  Object.values(value).forEach((item) => attachmentsIn(item, attachments));
  return attachments;
};

const newSchoolEntry = (code, name = "") => {
  return {
    schoolCode: String(code || "").toUpperCase(),
    schoolName: name || code,
    placementPrograms: [emptyRow(PLACEMENT_COLUMNS, 0)],
    activities: [emptyRow(ACTIVITY_COLUMNS, 0, { Activity: "Internship" })],
    careerGuidanceActivities: [emptyRow(SESSION_ACTIVITY_COLUMNS, 0)],
    industryInteractionActivities: [emptyRow(SESSION_ACTIVITY_COLUMNS, 0)],
    otherActivities: [emptyRow(SESSION_ACTIVITY_COLUMNS, 0)],
    trainingActivities: [emptyRow(TRAINING_COLUMNS, 0)],
    industryCollaborations: [emptyRow(COLLABORATION_COLUMNS, 0)],
  };
};

export default function AdministrativePartE({
  value = [],
  coursesOffered = [],
  onChange,
  onUploadAttachment,
  onDeleteAttachment,
  readOnly = false,
  showAllSchools = false,
}) {
  const schools = Array.isArray(value) ? value : [];
  const [selectedSchoolCode, setSelectedSchoolCode] = useState("");
  const [showSchoolAdder, setShowSchoolAdder] = useState(false);
  const [newSchoolCode, setNewSchoolCode] = useState("");
  const [programChoice, setProgramChoice] = useState("");
  const [customProgram, setCustomProgram] = useState("");
  const [deletingSchoolCode, setDeletingSchoolCode] = useState("");

  const programOptions = useMemo(() => [...new Set(
    coursesOffered
      .map((row) => String(row["Name of the Program"] || "").trim())
      .filter(Boolean)
  )], [coursesOffered]);
  const effectiveSchoolCode = schools.some((school) => school.schoolCode === selectedSchoolCode)
    ? selectedSchoolCode
    : schools[0]?.schoolCode || "";
  const visibleSchools = showAllSchools
    ? schools
    : schools.filter((school) => school.schoolCode === effectiveSchoolCode);
  const availableSchools = SCHOOL_OPTIONS.filter(
    (option) => !schools.some((school) => school.schoolCode === option.code.toUpperCase())
  );

  const updateSchool = (schoolCode, updater) => {
    onChange?.(schools.map((school) => school.schoolCode === schoolCode ? updater(school) : school));
  };

  const updateRows = (schoolCode, key, rows) => {
    updateSchool(schoolCode, (school) => ({ ...school, [key]: renumberRows(rows) }));
  };

  const addSchool = () => {
    if (!newSchoolCode) return;
    onChange?.([...schools, newSchoolEntry(newSchoolCode)]);
    setSelectedSchoolCode(newSchoolCode);
    setNewSchoolCode("");
    setShowSchoolAdder(false);
  };

  const deleteSchool = async (school) => {
    if (!window.confirm(`Delete all Part E details for ${school.schoolName}?`)) return;

    setDeletingSchoolCode(school.schoolCode);
    try {
      const uniqueAttachments = [...new Map(
        attachmentsIn(school).map((attachment) => [
          attachment.url || attachment.publicUrl || attachment.downloadUrl,
          attachment,
        ])
      ).values()];
      await Promise.all(uniqueAttachments.map((attachment) => onDeleteAttachment?.(attachment)));
      const remainingSchools = schools.filter((item) => item.schoolCode !== school.schoolCode);
      onChange?.(remainingSchools);
      setSelectedSchoolCode(remainingSchools[0]?.schoolCode || "");
    } finally {
      setDeletingSchoolCode("");
    }
  };

  const addProgram = (school) => {
    const program = programChoice === "__other" ? customProgram.trim() : programChoice;
    if (!program) return;
    const rows = school.placementPrograms || [];
    updateRows(
      school.schoolCode,
      "placementPrograms",
      [...rows, emptyRow(PLACEMENT_COLUMNS, rows.length, { Program: program })]
    );
    setProgramChoice("");
    setCustomProgram("");
  };

  const renderTable = (school, key) => {
    const table = tableDefinitions[key];
    const storedRows = school[key] || [];
    const rows = !storedRows.length && [
      "placementPrograms",
      "activities",
      "careerGuidanceActivities",
      "industryInteractionActivities",
      "otherActivities",
      "trainingActivities",
      "industryCollaborations",
    ].includes(key)
      ? [emptyRow(table.columns, 0, key === "activities" ? { Activity: "Internship" } : {})]
      : storedRows;
    return (
      <AuditTable
        key={`${school.schoolCode}-${key}`}
        table={table}
        rows={rows}
        onCellChange={(_tableId, rowIndex, column, cellValue) => {
          updateRows(
            school.schoolCode,
            key,
            rows.map((row, index) => index === rowIndex ? { ...row, [column]: cellValue } : row)
          );
        }}
        onAddRow={() => updateRows(
          school.schoolCode,
          key,
          [
            ...rows,
            emptyRow(table.columns, rows.length, key === "activities" ? { Activity: "Internship" } : {})
          ]
        )}
        onDeleteLastRow={() => updateRows(school.schoolCode, key, rows.slice(0, -1))}
        onUploadAttachment={onUploadAttachment}
        onDeleteAttachment={onDeleteAttachment}
        readOnly={readOnly}
        allowManualAdd
        showRowControls={!readOnly}
      />
    );
  };

  return (
    <div style={styles.root}>
      {!showAllSchools && (
        <div style={styles.schoolToolbar}>
          <label style={styles.controlLabel}>
            <span>School</span>
            <select
              className="audit-control"
              style={styles.select}
              value={effectiveSchoolCode}
              onChange={(event) => setSelectedSchoolCode(event.target.value)}
              disabled={!schools.length}
            >
              {!schools.length && <option value="">No school added</option>}
              {schools.map((school) => (
                <option key={school.schoolCode} value={school.schoolCode}>{school.schoolName}</option>
              ))}
            </select>
          </label>
          {!!effectiveSchoolCode && <span style={styles.schoolCode}>{effectiveSchoolCode}</span>}
          {!readOnly && !!visibleSchools[0] && (
            <button
              type="button"
              style={styles.deleteSchoolButton}
              onClick={() => deleteSchool(visibleSchools[0])}
              disabled={deletingSchoolCode === visibleSchools[0].schoolCode}
            >
              {deletingSchoolCode === visibleSchools[0].schoolCode ? "Deleting..." : "Delete School"}
            </button>
          )}
        </div>
      )}

      {!visibleSchools.length && (
        <div style={styles.emptyState}>Select Add School to begin entering school-wise Part E details.</div>
      )}

      {visibleSchools.map((school) => (
        <section key={school.schoolCode} style={styles.schoolSection}>
          {showAllSchools && (
            <div style={styles.schoolHeading}>
              <h3>{school.schoolName}</h3>
              <span>{school.schoolCode}</span>
            </div>
          )}

          {!readOnly && (
            <div style={styles.programComposer}>
              <div style={styles.programComposerFields}>
                <label style={{ ...styles.controlLabel, ...styles.programSelectField }}>
                  <span>Program</span>
                  <select
                    className="audit-control"
                    style={styles.select}
                    value={programChoice}
                    onChange={(event) => {
                      setProgramChoice(event.target.value);
                      if (event.target.value !== "__other") setCustomProgram("");
                    }}
                  >
                    <option value="">Select program</option>
                    {programOptions.map((program) => <option key={program} value={program}>{program}</option>)}
                    <option value="__other">Other program</option>
                  </select>
                </label>
                {programChoice === "__other" && (
                  <label style={{ ...styles.controlLabel, ...styles.customProgramField }}>
                    <span>Other Program Name</span>
                    <input
                      className="audit-control"
                      style={styles.input}
                      value={customProgram}
                      onChange={(event) => setCustomProgram(event.target.value)}
                      placeholder="Enter program name"
                    />
                  </label>
                )}
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={styles.programAddButton}
                onClick={() => addProgram(school)}
                disabled={!programChoice || (programChoice === "__other" && !customProgram.trim())}
              >
                Add Program
              </button>
            </div>
          )}
          {renderTable(school, "placementPrograms")}

          {renderTable(school, "activities")}
          {renderTable(school, "careerGuidanceActivities")}
          {renderTable(school, "industryInteractionActivities")}
          {renderTable(school, "otherActivities")}
          {renderTable(school, "trainingActivities")}
          {renderTable(school, "industryCollaborations")}
        </section>
      ))}

      {!readOnly && !showAllSchools && (
        <div style={styles.addSchoolArea}>
          {showSchoolAdder && (
            <select className="audit-control" style={styles.select} value={newSchoolCode} onChange={(event) => setNewSchoolCode(event.target.value)}>
              <option value="">Select school to add</option>
              {availableSchools.map((school) => (
                <option key={school.code} value={school.code.toUpperCase()}>{school.name}</option>
              ))}
            </select>
          )}
          {showSchoolAdder && (
            <button type="button" className="btn btn-primary" onClick={addSchool} disabled={!newSchoolCode}>Confirm Add</button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowSchoolAdder((current) => !current)}
            disabled={!availableSchools.length}
          >
            {availableSchools.length ? (showSchoolAdder ? "Cancel" : "Add School") : "All Schools Added"}
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  root: { display: "flex", flexDirection: "column", gap: 18 },
  schoolToolbar: { display: "flex", alignItems: "flex-end", gap: 10, padding: "14px 0", borderBottom: "1px solid #dbe3ef" },
  controlLabel: { minWidth: 220, display: "flex", flex: "1 1 260px", flexDirection: "column", gap: 6, color: "#334155", fontSize: 12, fontWeight: 700 },
  select: { width: "100%", minHeight: 42, border: "1px solid #cbd5e1", borderRadius: 7, padding: "8px 10px", color: "#0f172a", background: "#fff" },
  input: { width: "100%", minHeight: 42, border: "1px solid #cbd5e1", borderRadius: 7, padding: "8px 10px", color: "#0f172a", background: "#fff" },
  schoolCode: { padding: "8px 10px", border: "1px solid #bfdbfe", borderRadius: 7, color: "#1d4ed8", background: "#eff6ff", fontSize: 11, fontWeight: 800 },
  deleteSchoolButton: { minHeight: 38, border: "1px solid #fecaca", borderRadius: 7, padding: "8px 11px", color: "#b91c1c", background: "#fff", fontFamily: "inherit", fontSize: 11.5, fontWeight: 750, cursor: "pointer" },
  emptyState: { padding: 18, border: "1px dashed #cbd5e1", borderRadius: 7, color: "#64748b", background: "#f8fafc", fontSize: 12, textAlign: "center" },
  schoolSection: { display: "flex", flexDirection: "column", gap: 18 },
  schoolHeading: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingBottom: 10, borderBottom: "1px solid #cbd5e1" },
  programComposer: { display: "flex", alignItems: "end", flexWrap: "wrap", gap: 10, padding: 12, border: "1px solid #e2e8f0", borderRadius: 7, background: "#f8fafc" },
  programComposerFields: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", flex: "1 1 560px", gap: 10, alignItems: "end" },
  programSelectField: { minWidth: 0, flex: "initial" },
  customProgramField: { minWidth: 0, flex: "initial" },
  programAddButton: { minHeight: 42, alignSelf: "end" },
  addRow: { display: "flex", alignItems: "flex-end", flexWrap: "wrap", gap: 10, padding: 12, border: "1px solid #e2e8f0", borderRadius: 7, background: "#f8fafc" },
  addSchoolArea: { display: "flex", alignItems: "flex-end", justifyContent: "flex-start", flexWrap: "wrap", gap: 10, paddingTop: 16, borderTop: "1px solid #dbe3ef" },
};
