import React, { useState, useEffect } from 'react';
import {
  getSchemas,
  getSchemaDetails,
  createSchema,
  deleteSchema,
  createDraftVersion,
  deleteVersion,
  rollbackVersion,
} from './formStudioApi';

export const SchemaManager = ({
  selectedUniversity,
  onOpenBuilder,
  onOpenPreview,
}) => {
  const [schemas, setSchemas] = useState([]);
  const [selectedSchema, setSelectedSchema] = useState(null);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSchemaForm, setNewSchemaForm] = useState({
    auditType: 'academic',
    name: '',
    description: '',
  });

  const loadSchemas = async () => {
    if (!selectedUniversity) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getSchemas(selectedUniversity.id, selectedUniversity.code);
      setSchemas(data || []);
      if (data && data.length > 0) {
        handleSelectSchema(data[0]);
      } else {
        setSelectedSchema(null);
        setVersions([]);
      }
    } catch (err) {
      setError(err.message || 'Failed to load schemas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchemas();
  }, [selectedUniversity]);

  const handleSelectSchema = async (s) => {
    setSelectedSchema(s);
    try {
      const details = await getSchemaDetails(s.id);
      setVersions(details.versions || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateDraft = async (schemaId) => {
    try {
      const draft = await createDraftVersion(schemaId, 'iqac-admin');
      await handleSelectSchema(selectedSchema);
      onOpenBuilder(draft.id);
    } catch (err) {
      alert('Error creating draft: ' + err.message);
    }
  };

  const handleRollback = async (targetVersionId) => {
    if (!window.confirm('Are you sure you want to rollback the active form to Version ' + targetVersionId + '?')) {
      return;
    }
    try {
      await rollbackVersion(selectedSchema.id, targetVersionId);
      await loadSchemas();
      alert('Rollback successful.');
    } catch (err) {
      alert('Error rolling back: ' + err.message);
    }
  };

  const handleDeleteSchema = async (schema) => {
    if (!window.confirm(`Are you sure you want to permanently delete the Form Schema "${schema.name}" and all its versions?`)) {
      return;
    }
    try {
      await deleteSchema(schema.id);
      await loadSchemas();
    } catch (err) {
      alert('Failed to delete schema: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleDeleteVersion = async (version) => {
    if (!window.confirm(`Are you sure you want to delete Version V${version.versionNumber} (${version.status})?`)) {
      return;
    }
    try {
      await deleteVersion(version.id);
      if (selectedSchema) {
        await handleSelectSchema(selectedSchema);
      }
      await loadSchemas();
    } catch (err) {
      alert('Failed to delete version: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleCreateSchemaSubmit = async (e) => {
    e.preventDefault();
    try {
      await createSchema({
        ...newSchemaForm,
        universityId: selectedUniversity.id,
      });
      setShowCreateModal(false);
      await loadSchemas();
    } catch (err) {
      alert('Failed to create schema: ' + err.message);
    }
  };

  return (
    <div className="form-studio-container p-4">
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
        <div>
          <h2 className="fw-bold text-dark mb-1" style={{ fontSize: '22px' }}>📋 Appraisal Form Schemas & Versions</h2>
          <p className="text-muted mb-0" style={{ fontSize: '13.5px' }}>
            Design, version, and manage institutional audit forms for{' '}
            <strong className="text-primary">{selectedUniversity?.name || 'Your University'}</strong>.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary px-3 py-2 fw-semibold shadow-sm"
          style={{ borderRadius: '8px', background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', padding: '8px 16px', fontWeight: 600 }}
          onClick={() => setShowCreateModal(true)}
        >
          + Create New Form Schema
        </button>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status"></div>
          <p className="text-muted mt-2">Loading appraisal schemas...</p>
        </div>
      ) : schemas.length === 0 ? (
        <div className="card shadow-sm p-5 text-center bg-white" style={{ borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h4 className="fw-bold text-dark">No form schemas configured yet</h4>
          <p className="text-muted">Create your first Academic or Administrative audit schema to begin building.</p>
          <div>
            <button
              className="btn btn-primary px-4 py-2"
              style={{ borderRadius: '8px', background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
              onClick={() => setShowCreateModal(true)}
            >
              + Create First Form Schema
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) 2fr', gap: '20px' }}>
          {/* Left Column: Schema List */}
          <div>
            <div className="card shadow-sm" style={{ borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#0f172a' }}>
                Form Schemas ({schemas.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {schemas.map((s) => {
                  const isSelected = selectedSchema?.id === s.id;
                  return (
                    <div
                      key={s.id}
                      style={{
                        padding: '14px 18px',
                        borderBottom: '1px solid #f1f5f9',
                        cursor: 'pointer',
                        background: isSelected ? '#eff6ff' : '#fff',
                        borderLeft: isSelected ? '4px solid #2563eb' : '4px solid transparent',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'background 0.15s ease',
                      }}
                      onClick={() => handleSelectSchema(s)}
                    >
                      <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
                        <div style={{ fontWeight: 700, color: isSelected ? '#1d4ed8' : '#0f172a', fontSize: '14px' }}>{s.name}</div>
                        <small style={{ color: '#64748b', fontSize: '12px' }}>
                          Type: <strong>{s.auditType.toUpperCase()}</strong>
                        </small>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 7px',
                            borderRadius: '6px',
                            background: isSelected ? '#dbeafe' : '#f1f5f9',
                            color: isSelected ? '#1e40af' : '#475569',
                          }}
                        >
                          v{s.activeVersionNumber || 1} Active
                        </span>
                        <button
                          type="button"
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', opacity: 0.6 }}
                          title={`Delete "${s.name}"`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSchema(s);
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Version History & Actions */}
          <div>
            {selectedSchema && (
              <div className="card shadow-sm" style={{ borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <h4 style={{ margin: 0, fontWeight: 800, color: '#0f172a', fontSize: '16px' }}>{selectedSchema.name}</h4>
                    <small style={{ color: '#64748b', fontSize: '12.5px' }}>
                      Active Version: <strong>V{selectedSchema.activeVersionNumber || 1}</strong>
                    </small>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      type="button"
                      style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', fontWeight: 600, fontSize: '12.5px', cursor: 'pointer' }}
                      onClick={() => handleDeleteSchema(selectedSchema)}
                      title="Delete this entire schema and all its versions"
                    >
                      🗑️ Delete Schema
                    </button>
                    <button
                      type="button"
                      style={{ padding: '6px 14px', borderRadius: '7px', border: 'none', background: '#059669', color: '#fff', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}
                      onClick={() => handleCreateDraft(selectedSchema.id)}
                    >
                      + Open / Create Draft Version
                    </button>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                        <th style={{ padding: '10px 14px', fontWeight: 700 }}>Version</th>
                        <th style={{ padding: '10px 14px', fontWeight: 700 }}>Status</th>
                        <th style={{ padding: '10px 14px', fontWeight: 700 }}>Academic Year</th>
                        <th style={{ padding: '10px 14px', fontWeight: 700 }}>Published By</th>
                        <th style={{ padding: '10px 14px', fontWeight: 700 }}>Published Date</th>
                        <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {versions.map((v) => {
                        const isDraft = String(v.status || '').toUpperCase() === 'DRAFT';
                        const isActive = v.id === selectedSchema.activeVersionId;
                        return (
                          <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '12px 14px', fontWeight: 700 }}>
                              V{v.versionNumber}{' '}
                              {isActive && <span style={{ fontSize: '10px', padding: '2px 6px', background: '#2563eb', color: '#fff', borderRadius: '4px', marginLeft: '4px' }}>ACTIVE</span>}
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  padding: '3px 8px',
                                  borderRadius: '5px',
                                  background: isDraft ? '#fef3c7' : isActive ? '#d1fae5' : '#f1f5f9',
                                  color: isDraft ? '#92400e' : isActive ? '#065f46' : '#475569',
                                }}
                              >
                                {v.status}
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px' }}>{v.academicYear || '2025-26'}</td>
                            <td style={{ padding: '12px 14px' }}>{v.publishedBy || '-'}</td>
                            <td style={{ padding: '12px 14px' }}>
                              {v.publishedAt ? new Date(v.publishedAt).toLocaleDateString() : '-'}
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '6px' }}>
                                {isDraft ? (
                                  <>
                                    <button
                                      type="button"
                                      style={{ padding: '5px 11px', borderRadius: '6px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                                      onClick={() => onOpenBuilder(v.id)}
                                    >
                                      🛠️ Edit Draft
                                    </button>
                                    <button
                                      type="button"
                                      style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', cursor: 'pointer' }}
                                      onClick={() => handleDeleteVersion(v)}
                                      title="Delete this draft version"
                                    >
                                      🗑️
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      style={{ padding: '5px 11px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
                                      onClick={() => onOpenPreview(v.id)}
                                    >
                                      👁️ View
                                    </button>
                                    {!isActive && (
                                      <button
                                        type="button"
                                        style={{ padding: '5px 11px', borderRadius: '6px', border: '1px solid #fde68a', background: '#fffbeb', color: '#92400e', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
                                        onClick={() => handleRollback(v.id)}
                                      >
                                        Rollback
                                      </button>
                                    )}
                                    {versions.length > 1 && (
                                      <button
                                        type="button"
                                        style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', cursor: 'pointer' }}
                                        onClick={() => handleDeleteVersion(v)}
                                        title="Delete this version"
                                      >
                                        🗑️
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Schema Modal */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1050,
            background: 'rgba(15, 23, 42, 0.5)',
            display: 'grid',
            placeItems: 'center',
            padding: '20px',
          }}
        >
          <div style={{ width: '100%', maxWidth: '520px', background: '#fff', borderRadius: '12px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h5 style={{ margin: 0, fontWeight: 800, color: '#0f172a', fontSize: '16px' }}>📋 Create New Form Schema</h5>
              <button
                type="button"
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: '#64748b' }}
                onClick={() => setShowCreateModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateSchemaSubmit}>
              <div style={{ padding: '20px', display: 'grid', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>Audit Type*</label>
                  <select
                    style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px' }}
                    value={newSchemaForm.auditType}
                    onChange={(e) =>
                      setNewSchemaForm({ ...newSchemaForm, auditType: e.target.value })
                    }
                  >
                    <option value="academic">Academic Audit</option>
                    <option value="administrative">Administrative Audit</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>Schema Title / Name*</label>
                  <input
                    type="text"
                    style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px', boxSizing: 'border-box' }}
                    placeholder="e.g. Annual Academic Appraisal 2025-26"
                    required
                    value={newSchemaForm.name}
                    onChange={(e) =>
                      setNewSchemaForm({ ...newSchemaForm, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>Description</label>
                  <textarea
                    style={{ width: '100%', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: '13px', boxSizing: 'border-box' }}
                    rows={2}
                    placeholder="Form description..."
                    value={newSchemaForm.description}
                    onChange={(e) =>
                      setNewSchemaForm({ ...newSchemaForm, description: e.target.value })
                    }
                  />
                </div>
              </div>
              <div style={{ padding: '14px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  style={{ padding: '8px 16px', borderRadius: '7px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 18px', borderRadius: '7px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  Create Schema & V1 Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
