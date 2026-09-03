import React, { useState, useEffect } from 'react';
import {
  getSchemas,
  getSchemaDetails,
  createSchema,
  updateSchema,
  cloneSchema,
  deleteSchema,
  clearAllSchemas,
  createDraftVersion,
  deleteVersion,
  rollbackVersion,
  getUniversitySchools,
} from './formStudioApi';

export const SchemaManager = ({
  selectedUniversity,
  onOpenBuilder,
  onOpenPreview,
}) => {
  const [schemas, setSchemas] = useState([]);
  const [selectedSchema, setSelectedSchema] = useState(null);
  const [versions, setVersions] = useState([]);
  const [universitySchools, setUniversitySchools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Create Schema Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [cloneFromSchemaId, setCloneFromSchemaId] = useState('');
  const [newSchemaScope, setNewSchemaScope] = useState('ALL'); // 'ALL' or 'SPECIFIC'
  const [selectedSchoolCodes, setSelectedSchoolCodes] = useState([]);
  const [newSchemaForm, setNewSchemaForm] = useState({
    auditType: 'academic',
    name: '',
    description: '',
  });

  // Edit Scope Modal State
  const [showEditScopeModal, setShowEditScopeModal] = useState(false);
  const [editScopeSchema, setEditScopeSchema] = useState(null);
  const [editScopeMode, setEditScopeMode] = useState('ALL');
  const [editScopeSchools, setEditScopeSchools] = useState([]);
  const [editScopeName, setEditScopeName] = useState('');

  const effectiveUniversityId = selectedUniversity?.id || 1;

  const loadSchools = async () => {
    if (!effectiveUniversityId) return;
    try {
      const schools = await getUniversitySchools(effectiveUniversityId, true);
      setUniversitySchools(schools || []);
    } catch (err) {
      console.error('Failed to load schools in SchemaManager:', err);
    }
  };

  const loadSchemas = async () => {
    if (!selectedUniversity) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getSchemas(selectedUniversity.id, selectedUniversity.code);
      setSchemas(data || []);
      if (data && data.length > 0) {
        const match = selectedSchema ? data.find((s) => s.id === selectedSchema.id) : null;
        handleSelectSchema(match || data[0]);
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
    loadSchools();
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

  const handleClearAllSchemas = async () => {
    if (!window.confirm('Are you sure you want to delete ALL form schemas and start completely fresh?')) {
      return;
    }
    try {
      await clearAllSchemas(selectedUniversity?.id || 1);
      setSelectedSchema(null);
      setVersions([]);
      await loadSchemas();
    } catch (err) {
      alert('Failed to clear schemas: ' + (err.response?.data?.message || err.message));
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

  // Open Create Modal
  const handleOpenCreateModal = (cloneSource = null) => {
    if (cloneSource) {
      setCloneFromSchemaId(String(cloneSource.id));
      setNewSchemaForm({
        auditType: cloneSource.auditType || 'academic',
        name: `${cloneSource.name} (Copy)`,
        description: cloneSource.description || '',
      });
      setNewSchemaScope('SPECIFIC');
      setSelectedSchoolCodes([]);
    } else {
      setCloneFromSchemaId('');
      setNewSchemaForm({
        auditType: 'academic',
        name: '',
        description: '',
      });
      setNewSchemaScope('ALL');
      setSelectedSchoolCodes([]);
    }
    setShowCreateModal(true);
  };

  const handleToggleSchoolCode = (code) => {
    if (selectedSchoolCodes.includes(code)) {
      setSelectedSchoolCodes(selectedSchoolCodes.filter((c) => c !== code));
    } else {
      setSelectedSchoolCodes([...selectedSchoolCodes, code]);
    }
  };

  const handleCreateSchemaSubmit = async (e) => {
    e.preventDefault();
    try {
      const assigned = newSchemaScope === 'ALL'
        ? 'ALL'
        : JSON.stringify(selectedSchoolCodes);

      if (cloneFromSchemaId) {
        // Clone from existing schema
        await cloneSchema(cloneFromSchemaId, {
          newName: newSchemaForm.name,
          auditType: newSchemaForm.auditType,
          universityId: selectedUniversity.id,
          assignedSchools: assigned,
        });
      } else {
        // Create new schema from scratch
        await createSchema({
          ...newSchemaForm,
          assignedSchools: assigned,
          universityId: selectedUniversity.id,
        });
      }

      setShowCreateModal(false);
      await loadSchemas();
    } catch (err) {
      alert('Failed to create/clone schema: ' + (err.response?.data?.message || err.message));
    }
  };

  // Open Edit Scope Modal
  const handleOpenEditScope = (schema) => {
    setEditScopeSchema(schema);
    setEditScopeName(schema.name || '');
    const isAll = !schema.assignedSchools || schema.assignedSchools === 'ALL';
    setEditScopeMode(isAll ? 'ALL' : 'SPECIFIC');
    try {
      if (!isAll && schema.assignedSchools) {
        const parsed = JSON.parse(schema.assignedSchools);
        setEditScopeSchools(Array.isArray(parsed) ? parsed : [schema.assignedSchools]);
      } else {
        setEditScopeSchools([]);
      }
    } catch {
      setEditScopeSchools(schema.assignedSchools ? [schema.assignedSchools] : []);
    }
    setShowEditScopeModal(true);
  };

  const handleSaveScopeSubmit = async (e) => {
    e.preventDefault();
    try {
      const assigned = editScopeMode === 'ALL'
        ? 'ALL'
        : JSON.stringify(editScopeSchools);

      await updateSchema(editScopeSchema.id, {
        name: editScopeName,
        assignedSchools: assigned,
      });

      setShowEditScopeModal(false);
      await loadSchemas();
    } catch (err) {
      alert('Failed to update schema scope: ' + (err.response?.data?.message || err.message));
    }
  };

  const formatAssignedSchools = (assignedSchools) => {
    if (!assignedSchools || assignedSchools === 'ALL' || assignedSchools === '""') {
      return { isAll: true, label: '🌐 All Schools (Default Shared Form)' };
    }
    try {
      const parsed = JSON.parse(assignedSchools);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { isAll: false, label: `🏫 Assigned to ${parsed.length} School(s): ${parsed.join(', ')}` };
      }
    } catch {
      // plain text
    }
    return { isAll: false, label: `🏫 Assigned to: ${assignedSchools}` };
  };

  return (
    <div className="form-studio-container p-4">
      {/* Header section with instructions & actions */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
        <div>
          <h2 className="fw-bold text-dark mb-1" style={{ fontSize: '22px' }}>📋 Appraisal Form Schemas & Versions</h2>
          <p className="text-muted mb-0" style={{ fontSize: '13.5px' }}>
            Design, version, copy, and assign institutional appraisal forms for{' '}
            <strong className="text-primary">{selectedUniversity?.name || 'Your University'}</strong>.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {schemas.length > 0 && (
            <button
              type="button"
              className="btn btn-outline-danger px-3 py-2 fw-semibold"
              style={{ borderRadius: '8px', border: '1px solid #fca5a5', background: '#fff', color: '#dc2626', cursor: 'pointer', padding: '8px 16px', fontWeight: 600 }}
              onClick={handleClearAllSchemas}
            >
              🗑️ Clear All Schemas
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary px-3 py-2 fw-semibold shadow-sm"
            style={{ borderRadius: '8px', background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', padding: '8px 16px', fontWeight: 600 }}
            onClick={() => handleOpenCreateModal()}
          >
            + Create New Form Schema
          </button>
        </div>
      </div>

      {/* Info card describing the 2 conditions & copy capability */}
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 18px', marginBottom: '20px', fontSize: '13px', color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <strong>💡 School-Level Form Flexibility:</strong> Within this university, multiple schools can either share the <em>same form</em> (Condition 2), or have <em>different custom forms</em> (Condition 1). Use <strong>"📋 Copy Form"</strong> to quickly duplicate any existing form and customize columns without rebuilding from scratch!
        </div>
        <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 8px', background: '#dcfce7', color: '#15803d', borderRadius: '6px' }}>
          {universitySchools.length} Schools Configured
        </span>
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
              onClick={() => handleOpenCreateModal()}
            >
              + Create First Form Schema
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.2fr) 2fr', gap: '20px' }}>
          {/* Left Column: Schema List */}
          <div>
            <div className="card shadow-sm" style={{ borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>Form Schemas ({schemas.length})</span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Click to manage</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {schemas.map((s) => {
                  const isSelected = selectedSchema?.id === s.id;
                  const schoolInfo = formatAssignedSchools(s.assignedSchools);
                  return (
                    <div
                      key={s.id}
                      style={{
                        padding: '14px 18px',
                        borderBottom: '1px solid #f1f5f9',
                        cursor: 'pointer',
                        background: isSelected ? '#eff6ff' : '#fff',
                        borderLeft: isSelected ? '4px solid #2563eb' : '4px solid transparent',
                        transition: 'background 0.15s ease',
                      }}
                      onClick={() => handleSelectSchema(s)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                        <div style={{ fontWeight: 700, color: isSelected ? '#1d4ed8' : '#0f172a', fontSize: '14px' }}>
                          {s.name}
                        </div>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: '5px',
                            background: isSelected ? '#dbeafe' : '#f1f5f9',
                            color: isSelected ? '#1e40af' : '#475569',
                          }}
                        >
                          v{s.activeVersionNumber || 1}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                          Type: <strong>{s.auditType}</strong>
                        </span>
                      </div>

                      {/* Assigned Schools Tag */}
                      <div style={{ marginBottom: '8px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: schoolInfo.isAll ? '#f1f5f9' : '#e0e7ff',
                            color: schoolInfo.isAll ? '#475569' : '#3730a3',
                            border: `1px solid ${schoolInfo.isAll ? '#e2e8f0' : '#c7d2fe'}`,
                          }}
                        >
                          {schoolInfo.label}
                        </span>
                      </div>

                      {/* Action buttons inside card */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end', paddingTop: '4px' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          style={{ border: '1px solid #cbd5e1', background: '#fff', color: '#1e40af', padding: '3px 8px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer' }}
                          title="Copy/Duplicate this Form for another School"
                          onClick={() => handleOpenCreateModal(s)}
                        >
                          📋 Copy Form
                        </button>
                        <button
                          type="button"
                          style={{ border: '1px solid #cbd5e1', background: '#fff', color: '#475569', padding: '3px 8px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer' }}
                          title="Edit Assigned Schools"
                          onClick={() => handleOpenEditScope(s)}
                        >
                          ✏️ Scope
                        </button>
                        <button
                          type="button"
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', opacity: 0.6, fontSize: '14px' }}
                          title={`Delete "${s.name}"`}
                          onClick={() => handleDeleteSchema(s)}
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
                    <div style={{ marginTop: '3px', fontSize: '12.5px', color: '#64748b' }}>
                      Scope: <strong className="text-primary">{formatAssignedSchools(selectedSchema.assignedSchools).label}</strong>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, fontSize: '12.5px', cursor: 'pointer' }}
                      onClick={() => handleOpenEditScope(selectedSchema)}
                    >
                      ✏️ Edit Scope & Schools
                    </button>
                    <button
                      type="button"
                      style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', fontWeight: 600, fontSize: '12.5px', cursor: 'pointer' }}
                      onClick={() => handleOpenCreateModal(selectedSchema)}
                    >
                      📋 Copy As New Form
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
                                      🛠️ Edit & Build Form
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

      {/* Create / Clone Schema Modal */}
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
          <div style={{ width: '100%', maxWidth: '560px', maxHeight: '90vh', background: '#fff', borderRadius: '12px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h5 style={{ margin: 0, fontWeight: 800, color: '#0f172a', fontSize: '16px' }}>
                {cloneFromSchemaId ? '📋 Copy & Duplicate Form Schema' : '➕ Create New Form Schema'}
              </h5>
              <button
                type="button"
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: '#64748b' }}
                onClick={() => setShowCreateModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateSchemaSubmit} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '20px', overflowY: 'auto', display: 'grid', gap: '14px' }}>
                
                {/* Clone From Source Dropdown */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', marginBottom: '4px', color: '#1e40af' }}>
                    📋 Base on Existing Form Structure (Avoid Rework)
                  </label>
                  <select
                    style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px' }}
                    value={cloneFromSchemaId}
                    onChange={(e) => {
                      const sId = e.target.value;
                      setCloneFromSchemaId(sId);
                      if (sId) {
                        const src = schemas.find((s) => String(s.id) === String(sId));
                        if (src) {
                          setNewSchemaForm({
                            auditType: src.auditType || 'academic',
                            name: `${src.name} (Copy)`,
                            description: src.description || '',
                          });
                        }
                      }
                    }}
                  >
                    <option value="">-- Start Fresh From Scratch (Blank Form) --</option>
                    {schemas.map((s) => (
                      <option key={s.id} value={s.id}>
                        Copy from: {s.name} ({s.auditType.toUpperCase()})
                      </option>
                    ))}
                  </select>
                  <small style={{ color: '#64748b', fontSize: '11.5px', display: 'block', marginTop: '4px' }}>
                    Selecting an existing form will copy all sections, tables, and columns so you only need to modify what changes.
                  </small>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>Audit Category / Type*</label>
                  <select
                    style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px' }}
                    value={newSchemaForm.auditType}
                    onChange={(e) =>
                      setNewSchemaForm({ ...newSchemaForm, auditType: e.target.value })
                    }
                  >
                    <option value="academic">Academic Audit (Schools / Departments)</option>
                    <option value="administrative">Administrative Audit (University Offices)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>Schema Title / Name*</label>
                  <input
                    type="text"
                    style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px', boxSizing: 'border-box' }}
                    placeholder="e.g. School of Engineering Appraisal 2025-26"
                    required
                    value={newSchemaForm.name}
                    onChange={(e) =>
                      setNewSchemaForm({ ...newSchemaForm, name: e.target.value })
                    }
                  />
                </div>

                {/* School Scope Selection (Condition 1 vs Condition 2) */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', background: '#fafafa' }}>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', marginBottom: '6px', color: '#0f172a' }}>
                    🏫 Form Assignment & Scope:
                  </label>
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="schemaScope"
                        checked={newSchemaScope === 'ALL'}
                        onChange={() => setNewSchemaScope('ALL')}
                      />
                      <span><strong>All Schools (Default shared form)</strong></span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="schemaScope"
                        checked={newSchemaScope === 'SPECIFIC'}
                        onChange={() => setNewSchemaScope('SPECIFIC')}
                      />
                      <span><strong>Specific School(s) only</strong></span>
                    </label>
                  </div>

                  {newSchemaScope === 'SPECIFIC' && (
                    <div style={{ marginTop: '8px', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                        Select the school(s) that will use this form:
                      </div>
                      {universitySchools.length === 0 ? (
                        <p style={{ color: '#dc2626', fontSize: '12px', margin: 0 }}>
                          No schools configured yet. Please add schools in the "University Schools & Departments" tab first.
                        </p>
                      ) : (
                        <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'grid', gap: '6px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px' }}>
                          {universitySchools.map((sch) => {
                            const isChecked = selectedSchoolCodes.includes(sch.code) || selectedSchoolCodes.includes(sch.name);
                            return (
                              <label key={sch.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleSchoolCode(sch.code || sch.name)}
                                />
                                <span><strong>{sch.name}</strong> <span style={{ color: '#64748b' }}>({sch.code})</span></span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>Description</label>
                  <textarea
                    style={{ width: '100%', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: '13px', boxSizing: 'border-box' }}
                    rows={2}
                    placeholder="Form details or specific school notes..."
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
                  {cloneFromSchemaId ? '📋 Copy Structure & Create' : 'Create Schema & V1 Draft'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Scope Modal */}
      {showEditScopeModal && editScopeSchema && (
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
          <div style={{ width: '100%', maxWidth: '500px', background: '#fff', borderRadius: '12px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h5 style={{ margin: 0, fontWeight: 800, color: '#0f172a', fontSize: '16px' }}>
                ✏️ Edit Form Scope & Assigned Schools
              </h5>
              <button
                type="button"
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: '#64748b' }}
                onClick={() => setShowEditScopeModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveScopeSubmit}>
              <div style={{ padding: '20px', display: 'grid', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>Schema Name</label>
                  <input
                    type="text"
                    style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px', boxSizing: 'border-box' }}
                    required
                    value={editScopeName}
                    onChange={(e) => setEditScopeName(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', marginBottom: '6px', color: '#0f172a' }}>
                    Assigned Schools:
                  </label>
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="editScopeRadio"
                        checked={editScopeMode === 'ALL'}
                        onChange={() => setEditScopeMode('ALL')}
                      />
                      <span><strong>All Schools (Default shared form)</strong></span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="editScopeRadio"
                        checked={editScopeMode === 'SPECIFIC'}
                        onChange={() => setEditScopeMode('SPECIFIC')}
                      />
                      <span><strong>Specific School(s) only</strong></span>
                    </label>
                  </div>

                  {editScopeMode === 'SPECIFIC' && (
                    <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'grid', gap: '6px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px' }}>
                      {universitySchools.map((sch) => {
                        const isChecked = editScopeSchools.includes(sch.code) || editScopeSchools.includes(sch.name);
                        return (
                          <label key={sch.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                const code = sch.code || sch.name;
                                if (editScopeSchools.includes(code)) {
                                  setEditScopeSchools(editScopeSchools.filter((c) => c !== code));
                                } else {
                                  setEditScopeSchools([...editScopeSchools, code]);
                                }
                              }}
                            />
                            <span><strong>{sch.name}</strong> <span style={{ color: '#64748b' }}>({sch.code})</span></span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ padding: '14px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  style={{ padding: '8px 16px', borderRadius: '7px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}
                  onClick={() => setShowEditScopeModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 18px', borderRadius: '7px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
