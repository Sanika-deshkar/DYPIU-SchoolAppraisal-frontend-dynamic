import React, { useState, useEffect } from 'react';
import { getVersionTree } from './formStudioApi';

export const LiveFormPreview = ({ versionId, onBack }) => {
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState('');
  const [valuesData, setValuesData] = useState({});
  const [tablesData, setTablesData] = useState({});

  useEffect(() => {
    if (!versionId) return;
    const fetchTree = async () => {
      setLoading(true);
      try {
        const data = await getVersionTree(versionId);
        setSchema(data);
        if (data.sections && data.sections.length > 0) {
          setActiveSectionId(data.sections[0].sectionKey || data.sections[0].idString || data.sections[0].id);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTree();
  }, [versionId]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status"></div>
        <p className="text-muted mt-2">Loading Live Form Preview...</p>
      </div>
    );
  }

  if (!schema) {
    return (
      <div className="p-5 text-center">
        <div className="alert alert-warning" style={{ padding: '16px', background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: '8px', marginBottom: '16px' }}>
          No schema loaded for preview.
        </div>
        <button
          className="btn btn-secondary"
          style={{ padding: '8px 18px', borderRadius: '7px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, cursor: 'pointer' }}
          onClick={onBack}
        >
          Back
        </button>
      </div>
    );
  }

  const { header, sections = [] } = schema;
  const currentSection =
    sections.find(
      (s) => (s.sectionKey || s.idString || s.id) === activeSectionId
    ) || sections[0];

  const handleCellChange = (tableKey, rowIndex, colName, val) => {
    const existing = tablesData[tableKey] || [];
    const updated = existing.map((r, i) => (i === rowIndex ? { ...r, [colName]: val } : r));
    setTablesData({ ...tablesData, [tableKey]: updated });
  };

  const handleAddRow = (tableKey, columns) => {
    const existing = tablesData[tableKey] || [];
    const newRow = {};
    columns.forEach((c) => (newRow[c] = ''));
    if (columns[0] && /^(sr\.?\s*no\.?|sn)$/i.test(columns[0])) {
      newRow[columns[0]] = String(existing.length + 1);
    }
    setTablesData({ ...tablesData, [tableKey]: [...existing, newRow] });
  };

  const handleDeleteRow = (tableKey, index, columns) => {
    const existing = tablesData[tableKey] || [];
    const updated = existing.filter((_, i) => i !== index);
    if (columns[0] && /^(sr\.?\s*no\.?|sn)$/i.test(columns[0])) {
      updated.forEach((r, idx) => {
        r[columns[0]] = String(idx + 1);
      });
    }
    setTablesData({ ...tablesData, [tableKey]: updated });
  };

  return (
    <div style={{ padding: '24px', background: '#f8fafc' }}>
      {/* Top Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', background: '#fff', padding: '14px 20px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
            onClick={onBack}
          >
            ← Back to Editor
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '5px', background: '#d1fae5', color: '#065f46' }}>
              Interactive Live Preview
            </span>
            <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '15px' }}>{schema.title}</span>
          </div>
        </div>
        <div>
          <button
            type="button"
            style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', fontWeight: 600, fontSize: '12.5px', cursor: 'pointer' }}
            onClick={() => {
              alert('Preview State Payload:\n\n' + JSON.stringify({ valuesData, tablesData }, null, 2));
            }}
          >
            🔍 Inspect JSON Payload
          </button>
        </div>
      </div>

      {/* University Header */}
      {header && (
        <div style={{ textAlign: 'center', marginBottom: '24px', padding: '24px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          {header.logoUrl && (
            <img
              src={header.logoUrl}
              alt="Logo"
              style={{ maxHeight: '60px', marginBottom: '10px' }}
            />
          )}
          <h2 style={{ margin: '0 0 4px', fontWeight: 800, color: '#1d4ed8', fontSize: '20px' }}>{header.university}</h2>
          {header.address && <p style={{ margin: '0 0 4px', color: '#64748b', fontSize: '12.5px' }}>{header.address}</p>}
          {header.act && <p style={{ margin: '0 0 10px', color: '#64748b', fontSize: '12px', fontStyle: 'italic' }}>{header.act}</p>}
          <hr style={{ margin: '14px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />
          <h3 style={{ margin: '0 0 8px', fontWeight: 800, color: '#0f172a', fontSize: '17px' }}>{schema.title}</h3>
          {schema.academicYear && (
            <span style={{ fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', background: '#f1f5f9', color: '#475569' }}>
              Academic Year: {schema.academicYear}
            </span>
          )}
        </div>
      )}

      {/* Section Navigation Tabs */}
      {sections.length > 1 && (
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginBottom: '20px', background: '#fff', padding: '8px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          {sections.map((sec) => {
            const sKey = sec.sectionKey || sec.idString || sec.id;
            const isActive = sKey === activeSectionId;
            return (
              <button
                key={sec.id || sKey}
                type="button"
                style={{
                  padding: '8px 14px',
                  borderRadius: '7px',
                  border: 'none',
                  background: isActive ? '#2563eb' : 'transparent',
                  color: isActive ? '#fff' : '#475569',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '13px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
                onClick={() => setActiveSectionId(sKey)}
              >
                {sec.number ? `Sec ${sec.number}: ` : ''}
                {sec.title}
              </button>
            );
          })}
        </div>
      )}

      {/* Current Section Fields & Tables */}
      {currentSection && (
        <div style={{ marginBottom: '40px' }}>
          <div style={{ background: '#2563eb', color: '#fff', padding: '16px 20px', borderRadius: '10px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(37,99,235,0.2)' }}>
            <h3 style={{ margin: 0, fontWeight: 800, fontSize: '17px' }}>
              {currentSection.number ? `Section ${currentSection.number}: ` : ''}
              {currentSection.title}
            </h3>
            {currentSection.description && (
              <p style={{ margin: '4px 0 0', fontSize: '12.5px', opacity: 0.9 }}>{currentSection.description}</p>
            )}
          </div>

          {/* Section Header Fields */}
          {currentSection.fields && currentSection.fields.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {currentSection.fields.map((f) => {
                  const key = f.fieldKey || f.idString;
                  return (
                    <div key={f.id}>
                      <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '5px', color: '#0f172a' }}>
                        {f.label} {f.isRequired && <span style={{ color: '#ef4444' }}>*</span>}
                      </label>
                      {f.fieldType === 'TEXTAREA' ? (
                        <textarea
                          style={{ width: '100%', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: '13px', boxSizing: 'border-box' }}
                          rows={3}
                          placeholder={f.placeholder}
                          value={valuesData[key] || ''}
                          onChange={(e) => setValuesData({ ...valuesData, [key]: e.target.value })}
                        />
                      ) : f.fieldType === 'SELECT' ? (
                        <select
                          style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px', boxSizing: 'border-box' }}
                          value={valuesData[key] || ''}
                          onChange={(e) => setValuesData({ ...valuesData, [key]: e.target.value })}
                        >
                          <option value="">-- Select --</option>
                          {f.options &&
                            f.options.map((opt, i) => (
                              <option key={i} value={opt}>
                                {opt}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <input
                          type={f.fieldType === 'NUMBER' ? 'number' : f.fieldType === 'DATE' ? 'date' : 'text'}
                          style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px', boxSizing: 'border-box' }}
                          placeholder={f.placeholder}
                          value={valuesData[key] || ''}
                          onChange={(e) => setValuesData({ ...valuesData, [key]: e.target.value })}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section Tables */}
          {currentSection.tables &&
            currentSection.tables.map((tbl) => {
              const tKey = tbl.tableKey || tbl.idString;
              const rows = tablesData[tKey] || [];
              const columns = tbl.columns && tbl.columns.length > 0
                ? tbl.columns
                : tbl.fields?.map((f) => f.label || f.fieldKey) || [];

              return (
                <div key={tbl.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', marginBottom: '20px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  {tbl.showTitle && tbl.title && (
                    <div style={{ padding: '12px 18px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <h4 style={{ margin: 0, fontWeight: 700, color: '#334155', fontSize: '14.5px' }}>{tbl.title}</h4>
                    </div>
                  )}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                          {columns.map((col, idx) => (
                            <th key={idx} style={{ padding: '10px 14px', fontWeight: 700, borderRight: '1px solid #e2e8f0' }}>
                              {col}
                            </th>
                          ))}
                          {tbl.isRepeatable && <th style={{ width: '60px', padding: '10px 14px', textAlign: 'center' }}>Action</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={columns.length + (tbl.isRepeatable ? 1 : 0)}
                              style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}
                            >
                              No records added yet. Click "+ Add Row" below.
                            </td>
                          </tr>
                        ) : (
                          rows.map((row, rIdx) => (
                            <tr key={rIdx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              {columns.map((col, cIdx) => (
                                <td key={cIdx} style={{ padding: '8px 10px', borderRight: '1px solid #f1f5f9' }}>
                                  <input
                                    type="text"
                                    style={{ width: '100%', height: '32px', borderRadius: '5px', border: '1px solid #cbd5e1', padding: '0 8px', fontSize: '12.5px', boxSizing: 'border-box' }}
                                    value={row[col] || ''}
                                    onChange={(e) => handleCellChange(tKey, rIdx, col, e.target.value)}
                                  />
                                </td>
                              ))}
                              {tbl.isRepeatable && (
                                <td style={{ textAlign: 'center', padding: '8px 10px' }}>
                                  <button
                                    type="button"
                                    style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', cursor: 'pointer', fontWeight: 700 }}
                                    onClick={() => handleDeleteRow(tKey, rIdx, columns)}
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
                  {tbl.isRepeatable && (
                    <div style={{ padding: '10px 18px', background: '#fff', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', fontWeight: 600, fontSize: '12.5px', cursor: 'pointer' }}
                        onClick={() => handleAddRow(tKey, columns)}
                      >
                        + Add Row
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
};
