import React from 'react';
import { DynamicCell } from './DynamicCell';

export const DynamicTable = ({
  table,
  data = [],
  onChange,
  readOnly = false,
  onUploadAttachment = null,
}) => {
  if (!table) return null;

  const {
    idString,
    tableKey,
    title,
    showTitle = true,
    isRepeatable = true,
    columns = [],
    fields = [],
    selectOptions = {},
    dateColumns = [],
    numberColumns = [],
    textareaColumns = [],
    textareaMaxLengths = {},
  } = table;

  const rows = Array.isArray(data) ? data : [];

  // Determine headers
  let displayColumns = columns;
  if (!displayColumns || displayColumns.length === 0) {
    if (fields && fields.length > 0) {
      displayColumns = fields.map((f) => f.label || f.fieldKey);
    } else if (rows.length > 0) {
      displayColumns = Object.keys(rows[0]);
    }
  }

  const handleCellChange = (rowIndex, colName, newValue) => {
    const updated = rows.map((r, i) => (i === rowIndex ? { ...r, [colName]: newValue } : r));
    onChange(tableKey || idString, updated);
  };

  const handleAddRow = () => {
    const newRow = {};
    displayColumns.forEach((col) => {
      newRow[col] = '';
    });
    // If first col is Sr No or SN, set it
    if (displayColumns[0] && /^(sr\.?\s*no\.?|sn)$/i.test(displayColumns[0])) {
      newRow[displayColumns[0]] = String(rows.length + 1);
    }
    onChange(tableKey || idString, [...rows, newRow]);
  };

  const handleDeleteRow = (index) => {
    const updated = rows.filter((_, i) => i !== index);
    // Re-index Sr No if present
    if (displayColumns[0] && /^(sr\.?\s*no\.?|sn)$/i.test(displayColumns[0])) {
      updated.forEach((r, idx) => {
        r[displayColumns[0]] = String(idx + 1);
      });
    }
    onChange(tableKey || idString, updated);
  };

  return (
    <div className="dynamic-table-container card mb-4 shadow-sm border-0">
      {showTitle && title && (
        <div className="card-header bg-light py-2">
          <h6 className="mb-0 fw-bold text-secondary">{title}</h6>
        </div>
      )}
      <div className="card-body p-0">
        <div className="table-responsive">
          <table className="table table-bordered table-hover mb-0 align-middle">
            <thead className="table-light text-center">
              <tr>
                {displayColumns.map((col, idx) => (
                  <th key={idx} className="small fw-semibold">
                    {col}
                  </th>
                ))}
                {isRepeatable && !readOnly && <th style={{ width: '60px' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={displayColumns.length + (isRepeatable && !readOnly ? 1 : 0)} className="text-center text-muted py-3">
                    No records added yet.
                  </td>
                </tr>
              ) : (
                rows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {displayColumns.map((col, cIdx) => {
                      const fieldDef = fields?.find((f) => (f.label || f.fieldKey) === col);
                      return (
                        <td key={cIdx}>
                          <DynamicCell
                            column={col}
                            value={row[col]}
                            onChange={(val) => handleCellChange(rIdx, col, val)}
                            readOnly={readOnly}
                            selectOptions={selectOptions}
                            dateColumns={dateColumns}
                            numberColumns={numberColumns}
                            textareaColumns={textareaColumns}
                            textareaMaxLengths={textareaMaxLengths}
                            fieldDef={fieldDef}
                            onUploadAttachment={onUploadAttachment}
                          />
                        </td>
                      );
                    })}
                    {isRepeatable && !readOnly && (
                      <td className="text-center">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => handleDeleteRow(rIdx)}
                          title="Delete Row"
                        >
                          ✕
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {isRepeatable && !readOnly && (
        <div className="card-footer bg-white border-top-0 d-flex justify-content-end py-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={handleAddRow}
          >
            + Add Row
          </button>
        </div>
      )}
    </div>
  );
};
