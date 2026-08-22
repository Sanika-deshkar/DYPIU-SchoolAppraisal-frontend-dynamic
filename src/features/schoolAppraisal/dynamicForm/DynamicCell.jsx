import React, { useRef } from 'react';

export const DynamicCell = ({
  column,
  value,
  onChange,
  readOnly = false,
  selectOptions = {},
  dateColumns = [],
  numberColumns = [],
  textareaColumns = [],
  textareaMaxLengths = {},
  fieldDef = null,
  onUploadAttachment = null,
}) => {
  const fileInputRef = useRef(null);
  const colName = column || '';
  const colLower = colName.toLowerCase();

  // Determine type from fieldDef or heuristics
  let type = fieldDef?.fieldType?.toUpperCase();
  if (!type) {
    if (dateColumns.includes(colName) || colLower.includes('date')) {
      type = 'DATE';
    } else if (numberColumns.includes(colName) || colLower.includes('intake') || colLower.includes('admitted') || colLower.includes('count')) {
      type = 'NUMBER';
    } else if (selectOptions[colName] && selectOptions[colName].length > 0) {
      type = 'SELECT';
    } else if (textareaColumns.includes(colName) || colLower.includes('remarks') || colLower.includes('details') || colLower.includes('address')) {
      type = 'TEXTAREA';
    } else if (/\b(link|proof|attachment|document|mom|letter)\b/i.test(colName)) {
      type = 'ATTACHMENT';
    } else {
      type = 'TEXT';
    }
  }

  // 1. ATTACHMENT CELL
  if (type === 'ATTACHMENT') {
    const handleFileChange = async (e) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      if (onUploadAttachment) {
        const uploadedUrl = await onUploadAttachment(files[0]);
        if (uploadedUrl) {
          onChange(uploadedUrl);
        }
      } else {
        onChange(files[0].name);
      }
    };

    const hasAttachment = Boolean(value && String(value).trim());
    return (
      <div className="dynamic-attachment-cell d-flex align-items-center gap-2">
        {hasAttachment ? (
          <div className="d-flex align-items-center gap-1">
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-outline-primary text-truncate"
              style={{ maxWidth: '150px' }}
            >
              📄 View Doc
            </a>
            {!readOnly && (
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => onChange('')}
                title="Remove attachment"
              >
                ✕
              </button>
            )}
          </div>
        ) : !readOnly ? (
          <div>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileChange}
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            />
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              📎 Upload
            </button>
          </div>
        ) : (
          <span className="text-muted small">No file</span>
        )}
      </div>
    );
  }

  // 2. SELECT CELL
  if (type === 'SELECT' || (selectOptions && selectOptions[colName])) {
    const options = fieldDef?.options || selectOptions[colName] || [];
    return (
      <select
        className="form-select form-select-sm"
        disabled={readOnly}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">-- Select --</option>
        {options.map((opt, i) => (
          <option key={i} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  // 3. DATE CELL
  if (type === 'DATE') {
    return (
      <input
        type="date"
        className="form-control form-control-sm"
        disabled={readOnly}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // 4. NUMBER CELL
  if (type === 'NUMBER') {
    return (
      <input
        type="number"
        className="form-control form-control-sm"
        disabled={readOnly}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // 5. TEXTAREA CELL
  if (type === 'TEXTAREA') {
    const maxLen = textareaMaxLengths[colName] || fieldDef?.validationRules?.maxLength || 500;
    return (
      <textarea
        className="form-control form-control-sm"
        rows={2}
        disabled={readOnly}
        maxLength={maxLen}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // 6. DEFAULT TEXT CELL
  return (
    <input
      type="text"
      className="form-control form-control-sm"
      disabled={readOnly}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    />
  );
};
