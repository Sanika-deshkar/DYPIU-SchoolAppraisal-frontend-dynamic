import api from './client';

const getSessionUniversityCode = () =>
  sessionStorage.getItem("universityCode") || localStorage.getItem("universityCode") || 'dypiu';

export const fetchActiveSchema = async (auditType = 'academic', universityCode = null) => {
  try {
    const code = universityCode || getSessionUniversityCode();
    const response = await api.get('/api/config/active', {
      params: { auditType, universityCode: code },
    });
    return response.data;
  } catch (error) {
    console.warn('Failed to fetch active schema from backend, returning null for fallback:', error.message);
    return null;
  }
};

export const fetchSchemaByVersion = async (versionId) => {
  try {
    const response = await api.get(`/api/config/version/${versionId}`);
    return response.data;
  } catch (error) {
    console.warn(`Failed to fetch schema for version ${versionId}:`, error.message);
    return null;
  }
};

export const fetchUniversityBranding = async (universityCode = null) => {
  try {
    const code = universityCode || getSessionUniversityCode();
    const response = await api.get('/api/config/branding', {
      params: { universityCode: code },
    });
    return response.data;
  } catch (error) {
    console.warn('Failed to fetch branding:', error.message);
    return null;
  }
};

export const fetchUniversitiesDirectory = async () => {
  try {
    const response = await api.get('/api/config/universities');
    return response.data;
  } catch (error) {
    console.warn('Failed to fetch universities directory:', error.message);
    return [];
  }
};

