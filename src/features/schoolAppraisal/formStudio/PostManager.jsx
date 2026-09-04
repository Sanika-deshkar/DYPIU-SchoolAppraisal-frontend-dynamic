import React, { useState, useEffect } from 'react';
import {
  getUniversityPosts,
  createUniversityPost,
  updateUniversityPost,
  deleteUniversityPost,
} from './formStudioApi';

export const PostManager = ({ selectedUniversity }) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [currentPostId, setCurrentPostId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    status: 'ACTIVE',
    displayOrder: 0,
  });

  const effectiveUniversityId = selectedUniversity?.id || 1;

  const loadPosts = async () => {
    if (!effectiveUniversityId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getUniversityPosts(effectiveUniversityId, true);
      setPosts(data || []);
    } catch (err) {
      setError(err.message || 'Failed to load administrative posts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, [selectedUniversity]);

  const handleOpenAdd = () => {
    setIsEdit(false);
    setCurrentPostId(null);
    setFormData({
      name: '',
      code: '',
      description: '',
      status: 'ACTIVE',
      displayOrder: posts.length + 1,
    });
    setShowModal(true);
  };

  const handleOpenEdit = (post) => {
    setIsEdit(true);
    setCurrentPostId(post.id);
    setFormData({
      name: post.name || '',
      code: post.code || '',
      description: post.description || '',
      status: post.status || 'ACTIVE',
      displayOrder: post.displayOrder || 0,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isEdit) {
        await updateUniversityPost(effectiveUniversityId, currentPostId, formData);
      } else {
        await createUniversityPost(effectiveUniversityId, formData);
      }
      setShowModal(false);
      await loadPosts();
    } catch (err) {
      alert('Error saving post: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleDelete = async (post) => {
    if (!window.confirm(`Are you sure you want to delete administrative post "${post.name} (${post.code})"?`)) {
      return;
    }
    try {
      await deleteUniversityPost(effectiveUniversityId, post.id);
      await loadPosts();
    } catch (err) {
      alert('Failed to delete post: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div className="post-manager-container p-4">
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
        <div>
          <h2 className="fw-bold text-dark mb-1" style={{ fontSize: '22px' }}>👔 University Administrative Posts</h2>
          <p className="text-muted mb-0" style={{ fontSize: '13.5px' }}>
            Configure administrative posts & offices (Registrar, HR, Dean Student Welfare, CFO, etc.) for{' '}
            <strong className="text-primary">{selectedUniversity?.name || 'Your University'}</strong>.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary px-3 py-2 fw-semibold shadow-sm"
          style={{ borderRadius: '8px', background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', padding: '8px 16px', fontWeight: 600 }}
          onClick={handleOpenAdd}
        >
          + Add New Administrative Post
        </button>
      </div>

      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 18px', marginBottom: '20px', fontSize: '13px', color: '#334155' }}>
        <strong>ℹ️ Role of Administrative Posts:</strong> In the Administrative flow, there is <strong>one unified form</strong> divided into sections. Each section is assigned to one of these posts. Administrative users mapped to a post will fill only their assigned section(s).
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status"></div>
          <p className="text-muted mt-2">Loading configured administrative posts...</p>
        </div>
      ) : error ? (
        <div className="alert alert-danger p-3 rounded">{error}</div>
      ) : posts.length === 0 ? (
        <div className="card shadow-sm p-5 text-center bg-white" style={{ borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h4 className="fw-bold text-dark">No administrative posts configured yet</h4>
          <p className="text-muted">
            Add administrative posts such as Registrar, HR, Dean Student Welfare, Dean Placement, CFO, etc.
          </p>
          <div>
            <button
              className="btn btn-primary px-4 py-2"
              style={{ borderRadius: '8px', background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
              onClick={handleOpenAdd}
            >
              + Add First Post
            </button>
          </div>
        </div>
      ) : (
        <div className="card shadow-sm" style={{ borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, color: '#0f172a' }}>Configured Posts ({posts.length})</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Post Code / Identifier</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Post Title / Designation</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Description</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr key={post.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                      <code style={{ background: '#f1f5f9', color: '#475569', padding: '3px 7px', borderRadius: '5px' }}>
                        {post.code}
                      </code>
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0f172a' }}>
                      {post.name}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#64748b' }}>
                      {post.description || '-'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '5px',
                          background: post.status === 'ACTIVE' ? '#d1fae5' : '#f1f5f9',
                          color: post.status === 'ACTIVE' ? '#065f46' : '#64748b',
                        }}
                      >
                        {post.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '8px' }}>
                        <button
                          type="button"
                          style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
                          onClick={() => handleOpenEdit(post)}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          type="button"
                          style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', cursor: 'pointer' }}
                          onClick={() => handleDelete(post)}
                          title="Delete Post"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Post Modal */}
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
                {isEdit ? '✏️ Edit Administrative Post' : '👔 Add New Administrative Post'}
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
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>Post Title / Name*</label>
                  <input
                    type="text"
                    style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px', boxSizing: 'border-box' }}
                    placeholder="e.g. Registrar, HR, Dean Student Welfare, Chief Financial Officer"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>Post Code / Identifier*</label>
                  <input
                    type="text"
                    style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px', boxSizing: 'border-box' }}
                    placeholder="e.g. REGISTRAR, HR, DSW, PLACEMENT, CFO"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>Description / Department Office</label>
                  <textarea
                    style={{ width: '100%', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: '13px', boxSizing: 'border-box' }}
                    rows={2}
                    placeholder="e.g. Office of the Registrar, responsible for governance & academic operations"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
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
                  {isEdit ? 'Update Post' : 'Save Post'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
