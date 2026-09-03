import React, { useState, useEffect } from 'react';
import {
  getUniversitySchools,
  createUniversitySchool,
  updateUniversitySchool,
  deleteUniversitySchool,
} from './formStudioApi';

export const SchoolManager = ({ selectedUniversity }) => {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [currentSchoolId, setCurrentSchoolId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    groupName: 'engineering',
    status: 'ACTIVE',
    displayOrder: 0,
  });

  const effectiveUniversityId = selectedUniversity?.id || 1;

  const loadSchools = async () => {
    if (!effectiveUniversityId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getUniversitySchools(effectiveUniversityId, true);
      setSchools(data || []);
    } catch (err) {
      setError(err.message || 'Failed to load schools');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchools();
  }, [selectedUniversity]);

  const handleOpenAdd = () => {
    setIsEdit(false);
    setCurrentSchoolId(null);
    setFormData({
      name: '',
      code: '',
      groupName: 'engineering',
      status: 'ACTIVE',
      displayOrder: schools.length + 1,
    });
    setShowModal(true);
  };

  const handleOpenEdit = (school) => {
    setIsEdit(true);
    setCurrentSchoolId(school.id);
    setFormData({
      name: school.name || '',
      code: school.code || '',
      groupName: school.groupName || 'general',
      status: school.status || 'ACTIVE',
      displayOrder: school.displayOrder || 0,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isEdit) {
        await updateUniversitySchool(effectiveUniversityId, currentSchoolId, formData);
      } else {
        await createUniversitySchool(effectiveUniversityId, formData);
      }
      setShowModal(false);
      await loadSchools();
    } catch (err) {
      alert('Error saving school: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleDelete = async (school) => {
    if (!window.confirm(`Are you sure you want to delete "${school.name} (${school.code})"?`)) {
      return;
    }
    try {
      await deleteUniversitySchool(effectiveUniversityId, school.id);
      await loadSchools();
    } catch (err) {
      alert('Failed to delete school: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div className="school-manager-container p-4">
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
        <div>
          <h2 className="fw-bold text-dark mb-1" style={{ fontSize: '22px' }}>🏫 University Schools & Departments</h2>
          <p className="text-muted mb-0" style={{ fontSize: '13.5px' }}>
            Configure academic schools, faculties, and departments for{' '}
            <strong className="text-primary">{selectedUniversity?.name || 'Your University'}</strong>.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary px-3 py-2 fw-semibold shadow-sm"
          style={{ borderRadius: '8px', background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', padding: '8px 16px', fontWeight: 600 }}
          onClick={handleOpenAdd}
        >
          + Add New School / Department
        </button>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status"></div>
          <p className="text-muted mt-2">Loading configured schools...</p>
        </div>
      ) : error ? (
        <div className="alert alert-danger p-3 rounded">{error}</div>
      ) : schools.length === 0 ? (
        <div className="card shadow-sm p-5 text-center bg-white" style={{ borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h4 className="fw-bold text-dark">No schools configured yet</h4>
          <p className="text-muted">
            Add the academic schools/departments for this university. They will automatically populate user creation dropdowns and appraisal audit reports.
          </p>
          <div>
            <button
              className="btn btn-primary px-4 py-2"
              style={{ borderRadius: '8px', background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
              onClick={handleOpenAdd}
            >
              + Add First School
            </button>
          </div>
        </div>
      ) : (
        <div className="card shadow-sm" style={{ borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, color: '#0f172a' }}>Configured Schools ({schools.length})</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Code / Short Name</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Full School Name</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Group / Category</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {schools.map((school) => {
                  const isEng = school.groupName === 'engineering';
                  return (
                    <tr key={school.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                        <code style={{ background: '#e0f2fe', color: '#0369a1', padding: '3px 7px', borderRadius: '5px' }}>
                          {school.code}
                        </code>
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0f172a' }}>
                        {school.name}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '5px',
                            background: isEng ? '#eff6ff' : '#fdf2f8',
                            color: isEng ? '#1d4ed8' : '#be185d',
                          }}
                        >
                          {school.groupName === 'engineering' ? 'Engineering' : school.groupName === 'nonEngineering' ? 'Non-Engineering' : 'General'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '5px',
                            background: school.status === 'ACTIVE' ? '#d1fae5' : '#f1f5f9',
                            color: school.status === 'ACTIVE' ? '#065f46' : '#64748b',
                          }}
                        >
                          {school.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          <button
                            type="button"
                            style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
                            onClick={() => handleOpenEdit(school)}
                          >
                            ✏️ Edit
                          </button>
                          <button
                            type="button"
                            style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', cursor: 'pointer' }}
                            onClick={() => handleDelete(school)}
                            title="Delete School"
                          >
                            🗑️
                          </button>
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

      {/* Add / Edit School Modal */}
      {showModal && (
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
              <h4 style={{ margin: 0, fontWeight: 800, color: '#0f172a', fontSize: '16px' }}>
                {isEdit ? '✏️ Edit School / Department' : '🏫 Add New School / Department'}
              </h4>
              <button
                type="button"
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: '#64748b' }}
                onClick={() => setShowModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ padding: '20px', display: 'grid', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>Full School / Department Name*</label>
                  <input
                    type="text"
                    style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px', boxSizing: 'border-box' }}
                    placeholder="e.g. School of Computer Science & Engineering"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>School Code / Abbreviation*</label>
                  <input
                    type="text"
                    style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px', boxSizing: 'border-box' }}
                    placeholder="e.g. SoCSE, SoE, SoM, CSE"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>Category / Group</label>
                    <select
                      style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px', boxSizing: 'border-box' }}
                      value={formData.groupName}
                      onChange={(e) => setFormData({ ...formData, groupName: e.target.value })}
                    >
                      <option value="engineering">Engineering</option>
                      <option value="nonEngineering">Non-Engineering</option>
                      <option value="general">General / Other</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>Status</label>
                    <select
                      style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px', boxSizing: 'border-box' }}
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </div>
                </div>
              </div>
              <div style={{ padding: '14px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  style={{ padding: '8px 16px', borderRadius: '7px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 18px', borderRadius: '7px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  {isEdit ? 'Update School' : 'Save School'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
