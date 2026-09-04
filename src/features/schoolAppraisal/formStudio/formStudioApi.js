import apiClient from '../../../api/client';

export const getSchemas = async (universityId, universityCode, auditType) => {
  const params = {};
  if (universityId) params.universityId = universityId;
  if (universityCode) params.universityCode = universityCode;
  if (auditType) params.auditType = auditType;
  const res = await apiClient.get('/api/admin/config/schemas', { params });
  return res.data;
};

export const getSchemaDetails = async (schemaId) => {
  const res = await apiClient.get(`/api/admin/config/schemas/${schemaId}`);
  return res.data;
};

export const createSchema = async (payload) => {
  const res = await apiClient.post('/api/admin/config/schemas', payload);
  return res.data;
};

export const deleteSchema = async (schemaId) => {
  const res = await apiClient.delete(`/api/admin/config/schemas/${schemaId}`);
  return res.data;
};

export const clearAllSchemas = async (universityId) => {
  const res = await apiClient.delete(`/api/admin/config/universities/${universityId}/schemas`);
  return res.data;
};

export const createDraftVersion = async (schemaId, createdBy = 'iqac-admin') => {
  const res = await apiClient.post(`/api/admin/config/schemas/${schemaId}/versions/draft`, null, {
    params: { createdBy },
  });
  return res.data;
};

export const deleteVersion = async (versionId) => {
  const res = await apiClient.delete(`/api/admin/config/versions/${versionId}`);
  return res.data;
};

export const rollbackVersion = async (schemaId, targetVersionId) => {
  const res = await apiClient.post(`/api/admin/config/schemas/${schemaId}/rollback/${targetVersionId}`);
  return res.data;
};

export const getVersionTree = async (versionId) => {
  const res = await apiClient.get(`/api/admin/config/versions/${versionId}/tree`);
  return res.data;
};

export const publishVersion = async (versionId, publishedBy = 'iqac-admin') => {
  const res = await apiClient.post(`/api/admin/config/versions/${versionId}/publish`, null, {
    params: { publishedBy },
  });
  return res.data;
};

export const createSection = async (versionId, payload) => {
  const res = await apiClient.post(`/api/admin/config/versions/${versionId}/sections`, payload);
  return res.data;
};

export const updateSection = async (sectionId, payload) => {
  const res = await apiClient.put(`/api/admin/config/sections/${sectionId}`, payload);
  return res.data;
};

export const deleteSection = async (sectionId) => {
  const res = await apiClient.delete(`/api/admin/config/sections/${sectionId}`);
  return res.data;
};

export const createTable = async (sectionId, payload) => {
  const res = await apiClient.post(`/api/admin/config/sections/${sectionId}/tables`, payload);
  return res.data;
};

export const updateTable = async (tableId, payload) => {
  const res = await apiClient.put(`/api/admin/config/tables/${tableId}`, payload);
  return res.data;
};

export const deleteTable = async (tableId) => {
  const res = await apiClient.delete(`/api/admin/config/tables/${tableId}`);
  return res.data;
};

export const createField = async (sectionId, payload) => {
  const res = await apiClient.post(`/api/admin/config/sections/${sectionId}/fields`, payload);
  return res.data;
};

export const updateField = async (fieldId, payload) => {
  const res = await apiClient.put(`/api/admin/config/fields/${fieldId}`, payload);
  return res.data;
};

export const deleteField = async (fieldId) => {
  const res = await apiClient.delete(`/api/admin/config/fields/${fieldId}`);
  return res.data;
};

// University Schools / Departments Management
export const getUniversitySchools = async (universityId, all = false) => {
  if (!universityId) return [];
  const res = await apiClient.get(`/api/admin/config/universities/${universityId}/schools`, {
    params: all ? { all: true } : undefined,
  });
  return res.data || [];
};

export const createUniversitySchool = async (universityId, payload) => {
  const res = await apiClient.post(`/api/admin/config/universities/${universityId}/schools`, payload);
  return res.data;
};

export const updateUniversitySchool = async (universityId, schoolId, payload) => {
  const res = await apiClient.put(`/api/admin/config/universities/${universityId}/schools/${schoolId}`, payload);
  return res.data;
};

export const deleteUniversitySchool = async (universityId, schoolId) => {
  const res = await apiClient.delete(`/api/admin/config/universities/${universityId}/schools/${schoolId}`);
  return res.data;
};

export const updateSchema = async (schemaId, payload) => {
  const res = await apiClient.put(`/api/admin/config/schemas/${schemaId}`, payload);
  return res.data;
};

export const cloneSchema = async (schemaId, payload) => {
  const res = await apiClient.post(`/api/admin/config/schemas/${schemaId}/clone`, payload);
  return res.data;
};

export const copyTable = async (payload) => {
  const res = await apiClient.post('/api/admin/config/tables/copy', payload);
  return res.data;
};

export const getAvailableTables = async (universityId, universityCode) => {
  const params = {};
  if (universityId) params.universityId = universityId;
  if (universityCode) params.universityCode = universityCode;
  const res = await apiClient.get('/api/admin/config/tables/available', { params });
  return res.data || [];
};

// University Administrative Posts Management
export const getUniversityPosts = async (universityId, all = false) => {
  if (!universityId) return [];
  const res = await apiClient.get(`/api/admin/config/universities/${universityId}/posts`, {
    params: all ? { all: true } : undefined,
  });
  return res.data || [];
};

export const createUniversityPost = async (universityId, payload) => {
  const res = await apiClient.post(`/api/admin/config/universities/${universityId}/posts`, payload);
  return res.data;
};

export const updateUniversityPost = async (universityId, postId, payload) => {
  const res = await apiClient.put(`/api/admin/config/universities/${universityId}/posts/${postId}`, payload);
  return res.data;
};

export const deleteUniversityPost = async (universityId, postId) => {
  const res = await apiClient.delete(`/api/admin/config/universities/${universityId}/posts/${postId}`);
  return res.data;
};


