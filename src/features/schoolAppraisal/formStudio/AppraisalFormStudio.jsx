import React, { useState, useEffect } from 'react';
import { SchemaManager } from './SchemaManager';
import { FormBuilderCanvas } from './FormBuilderCanvas';
import { LiveFormPreview } from './LiveFormPreview';
import { SchoolManager } from './SchoolManager';
import { PostManager } from './PostManager';
import apiClient from '../../../api/client';

export default function AppraisalFormStudio({ currentUser }) {
  // Top-Level Form Type Selector: 'academic' vs 'administrative'
  const [formType, setFormType] = useState('academic');

  // Sub-navigation:
  // For academic: 'schemas' | 'schools'
  // For administrative: 'single-form' | 'posts'
  const [academicNav, setAcademicNav] = useState('schemas');
  const [adminNav, setAdminNav] = useState('single-form');

  // Main Canvas View: 'list' (shows sub-nav views) | 'builder' | 'preview'
  const [viewMode, setViewMode] = useState('list');
  const [activeVersionId, setActiveVersionId] = useState(null);
  const [currentUniversity, setCurrentUniversity] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const resolveUniversity = async () => {
      try {
        let universities = [];
        try {
          const uniRes = await apiClient.get('/api/config/universities');
          universities = uniRes.data || [];
        } catch {
          const uniRes2 = await apiClient.get('/api/universities');
          universities = uniRes2.data || [];
        }

        const userUniId = currentUser?.universityId;
        const userUniCode = currentUser?.universityCode;

        if (universities.length > 0) {
          const matched = universities.find(
            (u) => (userUniId && String(u.id) === String(userUniId)) ||
                   (userUniCode && u.code?.toLowerCase() === userUniCode.toLowerCase())
          ) || universities[0];
          setCurrentUniversity(matched);
        } else {
          setCurrentUniversity({
            id: userUniId || 1,
            code: userUniCode || 'DYPIU',
            name: currentUser?.universityName || (userUniCode ? userUniCode.toUpperCase() : 'Your University'),
          });
        }
      } catch (err) {
        console.error('Failed to load universities in Form Studio:', err);
        const userUniId = currentUser?.universityId;
        const userUniCode = currentUser?.universityCode;
        setCurrentUniversity({
          id: userUniId || 1,
          code: userUniCode || 'DYPIU',
          name: currentUser?.universityName || (userUniCode ? userUniCode.toUpperCase() : 'Your University'),
        });
      } finally {
        setLoading(false);
      }
    };
    resolveUniversity();
  }, [currentUser]);

  const handleOpenBuilder = (versionId) => {
    setActiveVersionId(versionId);
    setViewMode('builder');
  };

  const handleOpenPreview = (versionId) => {
    setActiveVersionId(versionId);
    setViewMode('preview');
  };

  if (loading) {
    return (
      <div className="p-5 text-center">
        <div className="spinner-border text-primary" role="status"></div>
        <p className="text-muted mt-2">Initializing Appraisal Form Studio...</p>
      </div>
    );
  }

  return (
    <div className="appraisal-form-studio-root" style={{ minHeight: '100%', background: '#f8fafc' }}>
      {/* Top Banner & Main Form Type Selector (Academic vs Administrative) */}
      {viewMode === 'list' && (
        <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
          {/* Header & University Info */}
          <div style={{ padding: '16px 24px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#2563eb' }}>
                IQAC Appraisal Form Studio
              </div>
              <h2 style={{ margin: '2px 0 0', fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
                Institutional Form & Schema Studio
              </h2>
            </div>

            {/* Form Type Selector (A: Academic vs B: Administrative) */}
            <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <button
                type="button"
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: formType === 'academic' ? '#2563eb' : 'transparent',
                  color: formType === 'academic' ? '#fff' : '#475569',
                  fontWeight: 700,
                  fontSize: '13.5px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: formType === 'academic' ? '0 2px 6px rgba(37,99,235,0.25)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                onClick={() => setFormType('academic')}
              >
                <span>🏫</span>
                <span>A) Academic Flow</span>
              </button>

              <button
                type="button"
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: formType === 'administrative' ? '#2563eb' : 'transparent',
                  color: formType === 'administrative' ? '#fff' : '#475569',
                  fontWeight: 700,
                  fontSize: '13.5px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: formType === 'administrative' ? '0 2px 6px rgba(37,99,235,0.25)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                onClick={() => setFormType('administrative')}
              >
                <span>🏢</span>
                <span>B) Administrative Flow</span>
              </button>
            </div>
          </div>

          {/* Sub-Navigation Tabs based on Form Type */}
          <div style={{ padding: '0 24px', display: 'flex', gap: '8px', borderTop: '1px solid #f1f5f9' }}>
            {formType === 'academic' ? (
              <>
                <button
                  type="button"
                  style={{
                    padding: '10px 16px',
                    border: 'none',
                    borderBottom: academicNav === 'schemas' ? '3px solid #2563eb' : '3px solid transparent',
                    background: 'transparent',
                    color: academicNav === 'schemas' ? '#2563eb' : '#64748b',
                    fontWeight: academicNav === 'schemas' ? 800 : 600,
                    fontSize: '13.5px',
                    cursor: 'pointer',
                    borderRadius: 0,
                  }}
                  onClick={() => setAcademicNav('schemas')}
                >
                  📋 Form Schemas & Versions (Academic)
                </button>
                <button
                  type="button"
                  style={{
                    padding: '10px 16px',
                    border: 'none',
                    borderBottom: academicNav === 'schools' ? '3px solid #2563eb' : '3px solid transparent',
                    background: 'transparent',
                    color: academicNav === 'schools' ? '#2563eb' : '#64748b',
                    fontWeight: academicNav === 'schools' ? 800 : 600,
                    fontSize: '13.5px',
                    cursor: 'pointer',
                    borderRadius: 0,
                  }}
                  onClick={() => setAcademicNav('schools')}
                >
                  🏫 University Schools & Departments
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  style={{
                    padding: '10px 16px',
                    border: 'none',
                    borderBottom: adminNav === 'single-form' ? '3px solid #2563eb' : '3px solid transparent',
                    background: 'transparent',
                    color: adminNav === 'single-form' ? '#2563eb' : '#64748b',
                    fontWeight: adminNav === 'single-form' ? 800 : 600,
                    fontSize: '13.5px',
                    cursor: 'pointer',
                    borderRadius: 0,
                  }}
                  onClick={() => setAdminNav('single-form')}
                >
                  📋 Single Administrative Form
                </button>
                <button
                  type="button"
                  style={{
                    padding: '10px 16px',
                    border: 'none',
                    borderBottom: adminNav === 'posts' ? '3px solid #2563eb' : '3px solid transparent',
                    background: 'transparent',
                    color: adminNav === 'posts' ? '#2563eb' : '#64748b',
                    fontWeight: adminNav === 'posts' ? 800 : 600,
                    fontSize: '13.5px',
                    cursor: 'pointer',
                    borderRadius: 0,
                  }}
                  onClick={() => setAdminNav('posts')}
                >
                  👔 Administrative Posts & Offices
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Content Rendering */}
      {viewMode === 'list' && formType === 'academic' && academicNav === 'schemas' && (
        <SchemaManager
          selectedUniversity={currentUniversity}
          formType="academic"
          onOpenBuilder={handleOpenBuilder}
          onOpenPreview={handleOpenPreview}
        />
      )}

      {viewMode === 'list' && formType === 'academic' && academicNav === 'schools' && (
        <SchoolManager selectedUniversity={currentUniversity} />
      )}

      {viewMode === 'list' && formType === 'administrative' && adminNav === 'single-form' && (
        <SchemaManager
          selectedUniversity={currentUniversity}
          formType="administrative"
          onOpenBuilder={handleOpenBuilder}
          onOpenPreview={handleOpenPreview}
        />
      )}

      {viewMode === 'list' && formType === 'administrative' && adminNav === 'posts' && (
        <PostManager selectedUniversity={currentUniversity} />
      )}

      {viewMode === 'builder' && (
        <FormBuilderCanvas
          versionId={activeVersionId}
          selectedUniversity={currentUniversity}
          onPublishSuccess={() => {}}
          onOpenPreview={handleOpenPreview}
          onBackToSchemas={() => setViewMode('list')}
        />
      )}

      {viewMode === 'preview' && (
        <LiveFormPreview
          versionId={activeVersionId}
          onBack={() => setViewMode('builder')}
        />
      )}
    </div>
  );
}
