import React, { useState, useEffect } from 'react';
import {
  getVersionTree,
  publishVersion,
  createSection,
  updateSection,
  deleteSection,
  createTable,
  updateTable,
  deleteTable,
  createField,
  updateField,
  deleteField,
} from './formStudioApi';

export const FormBuilderCanvas = ({
  versionId,
  onPublishSuccess,
  onOpenPreview,
  onBackToSchemas,
}) => {
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState(null);

  // Active navigation selection
  const [activeSectionId, setActiveSectionId] = useState(null);

  // Section Modal State
  const [sectionModal, setSectionModal] = useState({
    show: false,
    isEdit: false,
    data: { id: null, title: '', sectionNumber: '', ownerRole: 'director-schools', description: '' },
  });

  // Table Modal State
  const [tableModal, setTableModal] = useState({
    show: false,
    sectionId: null,
    isEdit: false,
    data: { id: null, title: '', tableKey: '', isRepeatable: true, showTitle: true },
  });

  // Field / Column Modal State
  const [fieldModal, setFieldModal] = useState({
    show: false,
    sectionId: null,
    tableId: null,
    isEdit: false,
    data: {
      id: null,
      label: '',
      fieldKey: '',
      fieldType: 'TEXT',
      isRequired: false,
      placeholder: '',
      optionsString: '',
    },
  });

  const loadTree = async () => {
    if (!versionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getVersionTree(versionId);
      setTree(data);
      if (data.sections && data.sections.length > 0 && !activeSectionId) {
        setActiveSectionId(data.sections[0].id);
      }
    } catch (err) {
      setError(err.message || 'Failed to load form tree');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTree();
  }, [versionId]);

  // Section Handlers
  const handleOpenAddSection = () => {
    setSectionModal({
      show: true,
      isEdit: false,
      data: { id: null, title: '', sectionNumber: '', ownerRole: 'director-schools', description: '' },
    });
  };

  const handleOpenEditSection = (sec) => {
    setSectionModal({
      show: true,
      isEdit: true,
      data: {
        id: sec.id,
        title: sec.title,
        sectionNumber: sec.number || '',
        ownerRole: sec.ownerRole || 'director-schools',
        description: sec.description || '',
      },
    });
  };

  const handleSaveSection = async (e) => {
    e.preventDefault();
    try {
      if (sectionModal.isEdit) {
        await updateSection(sectionModal.data.id, {
          title: sectionModal.data.title,
          sectionNumber: sectionModal.data.sectionNumber,
          ownerRole: sectionModal.data.ownerRole,
          description: sectionModal.data.description,
        });
      } else {
        await createSection(versionId, {
          versionId: versionId,
          title: sectionModal.data.title,
          sectionNumber: sectionModal.data.sectionNumber,
          ownerRole: sectionModal.data.ownerRole,
          description: sectionModal.data.description,
        });
      }
      setSectionModal({ ...sectionModal, show: false });
      await loadTree();
    } catch (err) {
      alert('Error saving section: ' + err.message);
    }
  };

  const handleDeleteSection = async (secId) => {
    if (!window.confirm('Are you sure you want to delete this entire section and all its tables?')) return;
    try {
      await deleteSection(secId);
      await loadTree();
    } catch (err) {
      alert('Error deleting section: ' + err.message);
    }
  };

  // Table Handlers
  const handleOpenAddTable = (secId) => {
    setTableModal({
      show: true,
      sectionId: secId,
      isEdit: false,
      data: { id: null, title: '', tableKey: '', isRepeatable: true, showTitle: true },
    });
  };

  const handleOpenEditTable = (tbl, secId) => {
    setTableModal({
      show: true,
      sectionId: secId,
      isEdit: true,
      data: {
        id: tbl.id,
        title: tbl.title,
        tableKey: tbl.tableKey,
        isRepeatable: tbl.isRepeatable ?? true,
        showTitle: tbl.showTitle ?? true,
      },
    });
  };

  const handleSaveTable = async (e) => {
    e.preventDefault();
    try {
      if (tableModal.isEdit) {
        await updateTable(tableModal.data.id, {
          title: tableModal.data.title,
          tableKey: tableModal.data.tableKey,
          isRepeatable: tableModal.data.isRepeatable,
          showTitle: tableModal.data.showTitle,
        });
      } else {
        await createTable(tableModal.sectionId, {
          sectionId: tableModal.sectionId,
          title: tableModal.data.title,
          tableKey: tableModal.data.tableKey,
          isRepeatable: tableModal.data.isRepeatable,
          showTitle: tableModal.data.showTitle,
        });
      }
      setTableModal({ ...tableModal, show: false });
      await loadTree();
    } catch (err) {
      alert('Error saving table: ' + err.message);
    }
  };

  const handleDeleteTable = async (tblId) => {
    if (!window.confirm('Are you sure you want to delete this table?')) return;
    try {
      await deleteTable(tblId);
      await loadTree();
    } catch (err) {
      alert('Error deleting table: ' + err.message);
    }
  };

  // Field Handlers
  const handleOpenAddField = (secId, tblId = null) => {
    setFieldModal({
      show: true,
      sectionId: secId,
      tableId: tblId,
      isEdit: false,
      data: {
        id: null,
        label: '',
        fieldKey: '',
        fieldType: 'TEXT',
        isRequired: false,
        placeholder: '',
        optionsString: '',
      },
    });
  };

  const handleOpenEditField = (f, secId, tblId = null) => {
    setFieldModal({
      show: true,
      sectionId: secId,
      tableId: tblId,
      isEdit: true,
      data: {
        id: f.id,
        label: f.label || '',
        fieldKey: f.fieldKey || '',
        fieldType: f.fieldType || 'TEXT',
        isRequired: f.isRequired ?? false,
        placeholder: f.placeholder || '',
        optionsString: Array.isArray(f.options) ? f.options.join(', ') : '',
      },
    });
  };

  const handleSaveField = async (e) => {
    e.preventDefault();
    try {
      const opts = fieldModal.data.optionsString
        ? JSON.stringify(fieldModal.data.optionsString.split(',').map((s) => s.trim()).filter(Boolean))
        : null;

      if (fieldModal.isEdit) {
        await updateField(fieldModal.data.id, {
          label: fieldModal.data.label,
          fieldKey: fieldModal.data.fieldKey,
          fieldType: fieldModal.data.fieldType,
          isRequired: fieldModal.data.isRequired,
          placeholder: fieldModal.data.placeholder,
          options: opts,
        });
      } else {
        await createField(fieldModal.sectionId, {
          sectionId: fieldModal.sectionId,
          tableId: fieldModal.tableId,
          label: fieldModal.data.label,
          fieldKey: fieldModal.data.fieldKey,
          fieldType: fieldModal.data.fieldType,
          isRequired: fieldModal.data.isRequired,
          placeholder: fieldModal.data.placeholder,
          options: opts,
        });
      }
      setFieldModal({ ...fieldModal, show: false });
      await loadTree();
    } catch (err) {
      alert('Error saving field: ' + err.message);
    }
  };

  const handleDeleteField = async (fId) => {
    if (!window.confirm('Are you sure you want to delete this field/column?')) return;
    try {
      await deleteField(fId);
      await loadTree();
    } catch (err) {
      alert('Error deleting field: ' + err.message);
    }
  };

  // Publish
  const handlePublish = async () => {
    if (!window.confirm('Publishing will freeze this schema version and activate it immediately for all contributors. Continue?')) {
      return;
    }
    setPublishing(true);
    setPublishMessage(null);
    try {
      const published = await publishVersion(versionId, 'iqac-admin');
      setPublishMessage('✅ Schema version published and activated successfully!');
      if (onPublishSuccess) onPublishSuccess(published);
      await loadTree();
    } catch (err) {
      alert('Publish Failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status"></div>
        <p className="text-muted mt-2">Loading Form Studio Tree...</p>
      </div>
    );
  }

  if (error || !tree) {
    return (
      <div className="p-5 text-center">
        <div className="alert alert-danger" style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '8px', marginBottom: '16px' }}>
          {error || 'Version tree not found'}
        </div>
        <button
          className="btn btn-secondary"
          style={{ padding: '8px 18px', borderRadius: '7px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, cursor: 'pointer' }}
          onClick={onBackToSchemas}
        >
          Back to Schemas
        </button>
      </div>
    );
  }

  const currentSection = tree.sections?.find((s) => s.id === activeSectionId) || tree.sections?.[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc' }}>
      {/* Top Toolbar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
            onClick={onBackToSchemas}
          >
            ← Back
          </button>
          <div>
            <h3 style={{ margin: 0, fontWeight: 800, color: '#0f172a', fontSize: '17px' }}>{tree.title}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', background: '#fef3c7', color: '#92400e' }}>
                Draft Version {tree.versionNumber}
              </span>
              <small style={{ color: '#64748b', fontSize: '12px' }}>Type: {tree.auditType?.toUpperCase()}</small>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {publishMessage && <span style={{ color: '#059669', fontWeight: 600, fontSize: '13px' }}>{publishMessage}</span>}
          <button
            type="button"
            style={{ padding: '7px 14px', borderRadius: '7px', border: '1px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
            onClick={() => onOpenPreview(versionId)}
          >
            👁️ Interactive Preview
          </button>
          <button
            type="button"
            style={{ padding: '7px 18px', borderRadius: '7px', border: 'none', background: '#059669', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
            onClick={handlePublish}
            disabled={publishing}
          >
            {publishing ? 'Publishing...' : '🚀 Publish & Activate Version'}
          </button>
        </div>
      </div>

      {/* Main 2-Pane Editor Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', flex: 1, minHeight: 'calc(100vh - 140px)' }}>
        {/* Left Tree Navigator */}
        <div style={{ background: '#fff', borderRight: '1px solid #e2e8f0', padding: '16px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Form Structure
            </span>
            <button
              type="button"
              style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: '11.5px', cursor: 'pointer' }}
              onClick={handleOpenAddSection}
            >
              + Section
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {tree.sections?.map((sec, idx) => {
              const isSelected = sec.id === currentSection?.id;
              return (
                <div
                  key={sec.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    background: isSelected ? '#eff6ff' : '#fff',
                    border: isSelected ? '1px solid #bfdbfe' : '1px solid transparent',
                    color: isSelected ? '#1d4ed8' : '#0f172a',
                    fontWeight: isSelected ? 700 : 500,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '13px',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => setActiveSectionId(sec.id)}
                >
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                    <span style={{ display: 'inline-block', minWidth: '18px', padding: '1px 5px', background: '#e2e8f0', borderRadius: '4px', fontSize: '10.5px', marginRight: '6px', textAlign: 'center' }}>
                      {sec.number || idx + 1}
                    </span>
                    {sec.title}
                  </div>
                  <span style={{ fontSize: '11px', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '999px' }}>
                    {sec.tables?.length || 0}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Canvas / Section Editor */}
        <div style={{ padding: '24px', overflowY: 'auto', background: '#f8fafc' }}>
          {currentSection ? (
            <div>
              {/* Section Header Card */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '5px', background: '#dbeafe', color: '#1e40af', display: 'inline-block', marginBottom: '8px' }}>
                      Section {currentSection.number || 'A'}
                    </span>
                    <h3 style={{ margin: '0 0 4px', fontWeight: 800, color: '#0f172a', fontSize: '18px' }}>{currentSection.title}</h3>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '12.5px' }}>
                      Owner Role: <strong>{currentSection.ownerRole || 'director-schools'}</strong>
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, fontSize: '12.5px', cursor: 'pointer' }}
                      onClick={() => handleOpenEditSection(currentSection)}
                    >
                      ✏️ Edit Section
                    </button>
                    <button
                      type="button"
                      style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', cursor: 'pointer' }}
                      onClick={() => handleDeleteSection(currentSection.id)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>

              {/* Top-Level Fields in Section */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h4 style={{ margin: 0, fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>📌 Header Fields (Non-table Inputs)</h4>
                  <button
                    type="button"
                    style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
                    onClick={() => handleOpenAddField(currentSection.id, null)}
                  >
                    + Add Header Field
                  </button>
                </div>

                {currentSection.fields && currentSection.fields.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                    {currentSection.fields.map((f) => (
                      <div key={f.id} style={{ padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>{f.label}</span>
                          <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '2px 6px', background: '#e0f2fe', color: '#0369a1', borderRadius: '4px', marginLeft: '6px' }}>
                            {f.fieldType}
                          </span>
                          {f.isRequired && <span style={{ color: '#ef4444', marginLeft: '3px' }}>*</span>}
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            type="button"
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px' }}
                            onClick={() => handleOpenEditField(f, currentSection.id, null)}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px', color: '#ef4444' }}
                            onClick={() => handleDeleteField(f.id)}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#94a3b8', fontSize: '12.5px', margin: 0 }}>No header fields in this section.</p>
                )}
              </div>

              {/* Tables in Section */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{ margin: 0, fontWeight: 800, color: '#0f172a', fontSize: '16px' }}>📊 Tables in Section</h4>
                <button
                  type="button"
                  style={{ padding: '6px 14px', borderRadius: '7px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                  onClick={() => handleOpenAddTable(currentSection.id)}
                >
                  + Add New Table
                </button>
              </div>

              {currentSection.tables && currentSection.tables.length > 0 ? (
                currentSection.tables.map((tbl, tIdx) => (
                  <div key={tbl.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <h4 style={{ margin: '0 0 3px', fontWeight: 700, color: '#0f172a', fontSize: '15px' }}>
                          {tbl.title || `Table ${tIdx + 1}`}
                        </h4>
                        <small style={{ color: '#64748b', fontSize: '12px' }}>
                          Key: <code>{tbl.tableKey}</code> | {tbl.isRepeatable ? 'Dynamic Rows' : 'Fixed Form'}
                        </small>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          style={{ padding: '5px 11px', borderRadius: '6px', border: '1px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
                          onClick={() => handleOpenAddField(currentSection.id, tbl.id)}
                        >
                          + Add Column
                        </button>
                        <button
                          type="button"
                          style={{ padding: '5px 11px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
                          onClick={() => handleOpenEditTable(tbl, currentSection.id)}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          type="button"
                          style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', cursor: 'pointer' }}
                          onClick={() => handleDeleteTable(tbl.id)}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    {/* Columns List */}
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', background: '#f8fafc' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginRight: '4px' }}>Columns:</span>
                        {tbl.fields && tbl.fields.length > 0 ? (
                          tbl.fields.map((col) => (
                            <span
                              key={col.id}
                              style={{
                                background: '#fff',
                                border: '1px solid #cbd5e1',
                                borderRadius: '6px',
                                padding: '5px 10px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '12.5px',
                                fontWeight: 600,
                                color: '#0f172a',
                              }}
                            >
                              <span>{col.label || col.fieldKey}</span>
                              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 5px', background: '#dbeafe', color: '#1e40af', borderRadius: '4px' }}>
                                {col.fieldType}
                              </span>
                              <button
                                type="button"
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '0 2px' }}
                                onClick={() => handleOpenEditField(col, currentSection.id, tbl.id)}
                                title="Edit Column"
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '0 2px', color: '#ef4444' }}
                                onClick={() => handleDeleteField(col.id)}
                                title="Delete Column"
                              >
                                ✕
                              </button>
                            </span>
                          ))
                        ) : (
                          <span style={{ color: '#ef4444', fontSize: '12.5px' }}>⚠️ No columns defined. Add columns to allow data entry.</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ background: '#fff', border: '1px dashed #cbd5e1', borderRadius: '12px', padding: '32px', textAlign: 'center' }}>
                  <p style={{ color: '#64748b', margin: '0 0 10px' }}>No tables created in this section yet.</p>
                  <button
                    type="button"
                    style={{ padding: '6px 14px', borderRadius: '7px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                    onClick={() => handleOpenAddTable(currentSection.id)}
                  >
                    + Create First Table
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
              Select or add a section from the left panel to start editing.
            </div>
          )}
        </div>
      </div>

      {/* Section Modal */}
      {sectionModal.show && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1050, background: 'rgba(15,23,42,0.5)', display: 'grid', placeItems: 'center', padding: '20px' }}>
          <div style={{ width: '100%', maxWidth: '520px', background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontWeight: 800, color: '#0f172a', fontSize: '16px' }}>
                {sectionModal.isEdit ? '✏️ Edit Section' : '➕ Add New Section'}
              </h4>
              <button
                type="button"
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: '#64748b' }}
                onClick={() => setSectionModal({ ...sectionModal, show: false })}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveSection}>
              <div style={{ padding: '20px', display: 'grid', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>Section Title*</label>
                  <input
                    type="text"
                    style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px', boxSizing: 'border-box' }}
                    placeholder="e.g. Part A - Academic Activities"
                    required
                    value={sectionModal.data.title}
                    onChange={(e) =>
                      setSectionModal({
                        ...sectionModal,
                        data: { ...sectionModal.data, title: e.target.value },
                      })
                    }
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>Section Number/Code</label>
                    <input
                      type="text"
                      style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px', boxSizing: 'border-box' }}
                      placeholder="e.g. A, B, 1, 2"
                      value={sectionModal.data.sectionNumber}
                      onChange={(e) =>
                        setSectionModal({
                          ...sectionModal,
                          data: { ...sectionModal.data, sectionNumber: e.target.value },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>Owner Role</label>
                    <select
                      style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px', boxSizing: 'border-box' }}
                      value={sectionModal.data.ownerRole}
                      onChange={(e) =>
                        setSectionModal({
                          ...sectionModal,
                          data: { ...sectionModal.data, ownerRole: e.target.value },
                        })
                      }
                    >
                      <option value="director-schools">Director / Dean</option>
                      <option value="registrar">Registrar</option>
                      <option value="hr">HR Office</option>
                      <option value="dean-student-welfare">Dean Student Welfare</option>
                      <option value="dean-placement">Dean Placement</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>Description</label>
                  <textarea
                    style={{ width: '100%', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: '13px', boxSizing: 'border-box' }}
                    rows={2}
                    placeholder="Optional section description..."
                    value={sectionModal.data.description}
                    onChange={(e) =>
                      setSectionModal({
                        ...sectionModal,
                        data: { ...sectionModal.data, description: e.target.value },
                      })
                    }
                  />
                </div>
              </div>
              <div style={{ padding: '14px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  style={{ padding: '8px 16px', borderRadius: '7px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}
                  onClick={() => setSectionModal({ ...sectionModal, show: false })}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 18px', borderRadius: '7px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  Save Section
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table Modal */}
      {tableModal.show && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1050, background: 'rgba(15,23,42,0.5)', display: 'grid', placeItems: 'center', padding: '20px' }}>
          <div style={{ width: '100%', maxWidth: '520px', background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontWeight: 800, color: '#0f172a', fontSize: '16px' }}>
                {tableModal.isEdit ? '✏️ Edit Table' : '➕ Add New Table'}
              </h4>
              <button
                type="button"
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: '#64748b' }}
                onClick={() => setTableModal({ ...tableModal, show: false })}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveTable}>
              <div style={{ padding: '20px', display: 'grid', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>Table Title*</label>
                  <input
                    type="text"
                    style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px', boxSizing: 'border-box' }}
                    placeholder="e.g. 1. Research Publications in UGC CARE / Scopus"
                    required
                    value={tableModal.data.title}
                    onChange={(e) =>
                      setTableModal({
                        ...tableModal,
                        data: { ...tableModal.data, title: e.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>Unique Table Key</label>
                  <input
                    type="text"
                    style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px', boxSizing: 'border-box' }}
                    placeholder="e.g. researchPublications (auto-generated if empty)"
                    value={tableModal.data.tableKey}
                    onChange={(e) =>
                      setTableModal({
                        ...tableModal,
                        data: { ...tableModal.data, tableKey: e.target.value },
                      })
                    }
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="repeatableCheck"
                    checked={tableModal.data.isRepeatable}
                    onChange={(e) =>
                      setTableModal({
                        ...tableModal,
                        data: { ...tableModal.data, isRepeatable: e.target.checked },
                      })
                    }
                  />
                  <label htmlFor="repeatableCheck" style={{ fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
                    Allow adding dynamic rows (Dynamic Repeatable Table)
                  </label>
                </div>
              </div>
              <div style={{ padding: '14px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  style={{ padding: '8px 16px', borderRadius: '7px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}
                  onClick={() => setTableModal({ ...tableModal, show: false })}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 18px', borderRadius: '7px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  Save Table
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Field / Column Modal */}
      {fieldModal.show && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1050, background: 'rgba(15,23,42,0.5)', display: 'grid', placeItems: 'center', padding: '20px' }}>
          <div style={{ width: '100%', maxWidth: '520px', background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontWeight: 800, color: '#0f172a', fontSize: '16px' }}>
                {fieldModal.isEdit ? '✏️ Edit Field / Column' : '➕ Add Field / Column'}
              </h4>
              <button
                type="button"
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: '#64748b' }}
                onClick={() => setFieldModal({ ...fieldModal, show: false })}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveField}>
              <div style={{ padding: '20px', display: 'grid', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>Label / Column Header*</label>
                  <input
                    type="text"
                    style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px', boxSizing: 'border-box' }}
                    placeholder="e.g. Title of Paper, Date of Meeting"
                    required
                    value={fieldModal.data.label}
                    onChange={(e) =>
                      setFieldModal({
                        ...fieldModal,
                        data: { ...fieldModal.data, label: e.target.value },
                      })
                    }
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>Field Type*</label>
                  <select
                    style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px', boxSizing: 'border-box' }}
                    value={fieldModal.data.fieldType}
                    onChange={(e) =>
                      setFieldModal({
                        ...fieldModal,
                        data: { ...fieldModal.data, fieldType: e.target.value },
                      })
                    }
                  >
                    <option value="TEXT">Short Text</option>
                    <option value="NUMBER">Number</option>
                    <option value="DATE">Date Picker</option>
                    <option value="SELECT">Dropdown (Select)</option>
                    <option value="TEXTAREA">Multi-line Textarea</option>
                    <option value="ATTACHMENT">File / Document Attachment</option>
                    <option value="EMAIL">Email</option>
                    <option value="URL">Web URL</option>
                  </select>
                </div>

                {fieldModal.data.fieldType === 'SELECT' && (
                  <div>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>Dropdown Options (Comma-separated)*</label>
                    <input
                      type="text"
                      style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px', boxSizing: 'border-box' }}
                      placeholder="e.g. Available, Not Available OR SC, ST, OBC, General"
                      required
                      value={fieldModal.data.optionsString}
                      onChange={(e) =>
                        setFieldModal({
                          ...fieldModal,
                          data: { ...fieldModal.data, optionsString: e.target.value },
                        })
                      }
                    />
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="reqCheck"
                    checked={fieldModal.data.isRequired}
                    onChange={(e) =>
                      setFieldModal({
                        ...fieldModal,
                        data: { ...fieldModal.data, isRequired: e.target.checked },
                      })
                    }
                  />
                  <label htmlFor="reqCheck" style={{ fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
                    Required Field
                  </label>
                </div>
              </div>
              <div style={{ padding: '14px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  style={{ padding: '8px 16px', borderRadius: '7px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}
                  onClick={() => setFieldModal({ ...fieldModal, show: false })}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 18px', borderRadius: '7px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  Save Field
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
