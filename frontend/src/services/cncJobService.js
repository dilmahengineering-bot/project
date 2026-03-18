import api from '../utils/api';

const cncJobService = {
  // Job Cards
  getAllJobCards: (params = {}) => api.get('/cnc-jobs', { params }),
  getJobCard: (id) => api.get(`/cnc-jobs/${id}`),
  getMyJobs: (status = 'active') => api.get('/cnc-jobs/my-jobs', { params: { status } }),
  getAllJobsAdmin: (status = 'active', search = '') => api.get('/cnc-jobs/all-jobs', { params: { status, search } }),
  createJobCard: (data) => api.post('/cnc-jobs', data),
  updateJobCard: (id, data) => api.put(`/cnc-jobs/${id}`, data),
  deleteJobCard: (id) => api.delete(`/cnc-jobs/${id}`),

  // Job Card Operations
  moveJobCardStage: (id, data) => api.post(`/cnc-jobs/${id}/move-stage`, data),
  completeJobCard: (id, data = {}) => api.post(`/cnc-jobs/${id}/complete`, data),

  // Attachments
  getAttachments: (jobCardId) => api.get(`/cnc-jobs/${jobCardId}/attachments`),
  uploadAttachment: (jobCardId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/cnc-jobs/${jobCardId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  deleteAttachment: (attachmentId) => api.delete(`/cnc-jobs/attachments/${attachmentId}`),

  // Report
  downloadReport: (jobCardId) => api.get(`/cnc-jobs/${jobCardId}/report`, { responseType: 'blob' }),

  // Extensions
  requestExtension: (jobCardId, data) => api.post(`/cnc-jobs/${jobCardId}/extension`, data),
  handleExtension: (extId, approval_status) => api.put(`/cnc-jobs/extensions/${extId}`, { approval_status }),

  // Helpers
  getJobCardsByWorkflow: (workflowId, status = 'active') => 
    api.get('/cnc-jobs', { params: { workflow_id: workflowId, status, limit: 1000 } }),
};

export default cncJobService;
