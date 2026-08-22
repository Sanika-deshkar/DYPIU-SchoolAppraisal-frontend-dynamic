import React from 'react';
import { DynamicField } from './DynamicField';
import { DynamicTable } from './DynamicTable';

export const DynamicSection = ({
  section,
  valuesData = {},
  tablesData = {},
  onValueChange,
  onTableChange,
  readOnly = false,
  errors = {},
  onUploadAttachment = null,
}) => {
  if (!section) return null;

  const {
    idString,
    sectionKey,
    title,
    number,
    description,
    fields = [],
    tables = [],
  } = section;

  return (
    <div className="dynamic-section mb-5">
      <div className="section-header bg-primary text-white p-3 rounded mb-4 shadow-sm">
        <h4 className="mb-0 fw-bold">
          {number ? `Section ${number}: ` : ''}
          {title}
        </h4>
        {description && <p className="mb-0 mt-1 small opacity-75">{description}</p>}
      </div>

      {/* Top-level fields */}
      {fields && fields.length > 0 && (
        <div className="card mb-4 shadow-sm border-0">
          <div className="card-body">
            <div className="row g-3">
              {fields.map((field) => {
                const key = field.fieldKey || field.idString;
                return (
                  <div key={field.id || key} className="col-md-6 col-12">
                    <DynamicField
                      field={field}
                      value={valuesData[key]}
                      onChange={onValueChange}
                      readOnly={readOnly}
                      error={errors[key]}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tables in section */}
      {tables && tables.length > 0 && (
        <div className="section-tables">
          {tables.map((table) => {
            const tKey = table.tableKey || table.idString;
            return (
              <DynamicTable
                key={table.id || tKey}
                table={table}
                data={tablesData[tKey] || []}
                onChange={onTableChange}
                readOnly={readOnly}
                onUploadAttachment={onUploadAttachment}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
