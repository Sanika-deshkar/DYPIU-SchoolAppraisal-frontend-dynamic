import React, { useState, useEffect } from 'react';
import { SchemaManager } from './SchemaManager';
import { FormBuilderCanvas } from './FormBuilderCanvas';
import { LiveFormPreview } from './LiveFormPreview';
import apiClient from '../../../api/client';

export default function AppraisalFormStudio({ currentUser }) {
  const [currentTab, setCurrentTab] = useState('schemas'); // 'schemas', 'builder', 'preview'
  const [activeVersionId, setActiveVersionId] = useState(null);
  const [currentUniversity, setCurrentUniversity] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const resolveUniversity = async () => {
      try {
        const uniRes = await apiClient.get('/api/config/universities');
        const universities = uniRes.data || [];
        if (universities.length > 0) {
          // Match by current user's universityId or code if available, else first
          const userUniId = currentUser?.universityId;
          const userUniCode = currentUser?.universityCode;
          const matched = universities.find(
            (u) => (userUniId && u.id === userUniId) || (userUniCode && u.code?.toLowerCase() === userUniCode.toLowerCase())
          ) || universities[0];
          setCurrentUniversity(matched);
        }
      } catch (err) {
        console.error('Failed to load universities in Form Studio:', err);
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
      {currentTab === 'schemas' && (
        <SchemaManager
          selectedUniversity={currentUniversity}
          onOpenBuilder={handleOpenBuilder}
          onOpenPreview={handleOpenPreview}
        />
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
