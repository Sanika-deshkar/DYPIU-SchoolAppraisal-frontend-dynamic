import React, { useState, useEffect } from 'react';
import { SchemaManager } from './SchemaManager';
import { FormBuilderCanvas } from './FormBuilderCanvas';
import { LiveFormPreview } from './LiveFormPreview';
import { SchoolManager } from './SchoolManager';
import apiClient from '../../../api/client';

export default function AppraisalFormStudio({ currentUser }) {
  const [mainNav, setMainNav] = useState('schemas'); // 'schemas' or 'schools'
  const [currentTab, setCurrentTab] = useState('schemas'); // 'schemas', 'builder', 'preview'
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
    setCurrentTab('builder');
  };

  const handleOpenPreview = (versionId) => {
    setActiveVersionId(versionId);
    setCurrentTab('preview');
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
    <div className="appraisal-form-studio-root" style={{ minHeight: '100%' }}>
      {/* Top Main Navigation Tabs */}
      {currentTab === 'schemas' && (
        <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '12px 24px', display: 'flex', gap: '10px' }}>
          <button
            type="button"
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: mainNav === 'schemas' ? '#2563eb' : '#f1f5f9',
              color: mainNav === 'schemas' ? '#fff' : '#475569',
              fontWeight: 700,
              fontSize: '13.5px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onClick={() => setMainNav('schemas')}
          >
            📋 Form Schemas & Versions
          </button>
          <button
            type="button"
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: mainNav === 'schools' ? '#2563eb' : '#f1f5f9',
              color: mainNav === 'schools' ? '#fff' : '#475569',
              fontWeight: 700,
              fontSize: '13.5px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onClick={() => setMainNav('schools')}
          >
            🏫 University Schools & Departments
          </button>
        </div>
      )}

      {currentTab === 'schemas' && mainNav === 'schemas' && (
        <SchemaManager
          selectedUniversity={currentUniversity}
          onOpenBuilder={handleOpenBuilder}
          onOpenPreview={handleOpenPreview}
        />
      )}

      {currentTab === 'schemas' && mainNav === 'schools' && (
        <SchoolManager selectedUniversity={currentUniversity} />
      )}

      {currentTab === 'builder' && (
        <FormBuilderCanvas
          versionId={activeVersionId}
          onPublishSuccess={() => {
            // Can remain or go to preview
          }}
          onOpenPreview={handleOpenPreview}
          onBackToSchemas={() => setCurrentTab('schemas')}
        />
      )}

      {currentTab === 'preview' && (
        <LiveFormPreview
          versionId={activeVersionId}
          onBack={() => setCurrentTab('builder')}
        />
      )}
    </div>
  );
}
