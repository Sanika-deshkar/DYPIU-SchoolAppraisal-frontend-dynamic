import React, { useState } from 'react';
import { DynamicSection } from './DynamicSection';

export const DynamicForm = ({
  schema,
  valuesData = {},
  tablesData = {},
  onValuesChange,
  onTablesChange,
  readOnly = false,
  onSaveDraft = null,
  onSubmit = null,
  isSaving = false,
  isSubmitting = false,
  errors = {},
  onUploadAttachment = null,
  activeSectionKey = null,
  onSelectSection = null,
}) => {
  if (!schema) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading Form Schema...</span>
        </div>
        <p className="text-muted mt-2">Loading form definition...</p>
      </div>
    );
  }

  const { title, academicYear, header, sections = [] } = schema;
  const [internalActiveSection, setInternalActiveSection] = useState(
    sections.length > 0 ? (sections[0].sectionKey || sections[0].idString) : ''
  );

  const currentSectionKey = activeSectionKey || internalActiveSection;
  const handleSectionTabClick = (key) => {
    if (onSelectSection) {
      onSelectSection(key);
    } else {
      setInternalActiveSection(key);
    }
  };

  const handleValueChange = (fieldKey, value) => {
    if (onValuesChange) {
      onValuesChange({ ...valuesData, [fieldKey]: value });
    }
  };

  const handleTableChange = (tableKey, updatedRows) => {
    if (onTablesChange) {
      onTablesChange({ ...tablesData, [tableKey]: updatedRows });
    }
  };

  const currentSection = sections.find(
    (s) => (s.sectionKey || s.idString) === currentSectionKey
  ) || sections[0];

  return (
    <div className="dynamic-form-wrapper">
      {/* 1. University Header & Branding */}
      {header && (
        <div className="university-form-header text-center mb-4 p-4 bg-white rounded shadow-sm border">
          {header.logoUrl && (
            <img
              src={header.logoUrl}
              alt="University Logo"
              style={{ maxHeight: '70px', marginBottom: '10px' }}
            />
          )}
          <h3 className="fw-bold text-primary mb-1">{header.university || 'University Appraisal'}</h3>
          {header.address && <p className="text-muted small mb-1">{header.address}</p>}
          {header.act && <p className="text-muted small mb-2 fst-italic">{header.act}</p>}
          <hr className="my-2" />
          <h4 className="fw-bold text-dark mt-2">{title}</h4>
          {academicYear && (
            <span className="badge bg-secondary px-3 py-2 fs-6">
              Academic Year: {academicYear}
            </span>
          )}
        </div>
      )}

      {/* 2. Section Navigation Tabs */}
      {sections.length > 1 && (
        <ul className="nav nav-pills nav-fill mb-4 bg-white p-2 rounded shadow-sm border">
          {sections.map((sec) => {
            const sKey = sec.sectionKey || sec.idString;
            const isActive = sKey === currentSectionKey;
            return (
              <li key={sec.id || sKey} className="nav-item">
                <button
                  type="button"
                  className={`nav-link fw-semibold text-start text-truncate ${
                    isActive ? 'active bg-primary text-white' : 'text-secondary'
                  }`}
                  onClick={() => handleSectionTabClick(sKey)}
                  style={{ borderRadius: '6px', margin: '2px' }}
                  title={sec.title}
                >
                  {sec.number ? `Sec ${sec.number}: ` : ''}
                  {sec.title}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* 3. Render Current Active Section */}
      {currentSection && (
        <DynamicSection
          section={currentSection}
          valuesData={valuesData}
          tablesData={tablesData}
          onValueChange={handleValueChange}
          onTableChange={handleTableChange}
          readOnly={readOnly}
          errors={errors}
          onUploadAttachment={onUploadAttachment}
        />
      )}

      {/* 4. Action Bar (Save Draft, Submit) */}
      {!readOnly && (onSaveDraft || onSubmit) && (
        <div className="dynamic-form-actions d-flex justify-content-between align-items-center bg-white p-3 rounded shadow-sm border mt-4">
          <div>
            {onSaveDraft && (
              <button
                type="button"
                className="btn btn-outline-primary px-4 py-2 fw-semibold me-2"
                onClick={onSaveDraft}
                disabled={isSaving || isSubmitting}
              >
                {isSaving ? 'Saving...' : '💾 Save Draft'}
              </button>
            )}
          </div>
          <div>
            {onSubmit && (
              <button
                type="button"
                className="btn btn-success px-4 py-2 fw-semibold"
                onClick={onSubmit}
                disabled={isSaving || isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : '🚀 Submit Appraisal'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
