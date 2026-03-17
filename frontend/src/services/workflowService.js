import api from '../utils/api';

const workflowService = {
  // Workflows
  getAllWorkflows: () => api.get('/workflows'),
  getWorkflow: (id) => api.get(`/workflows/${id}`),
  createWorkflow: (data) => api.post('/workflows', data),
  updateWorkflow: (id, data) => api.put(`/workflows/${id}`, data),
  deleteWorkflow: (id) => api.delete(`/workflows/${id}`),

  // Stages
  getStages: (workflowId) => api.get(`/workflows/${workflowId}/stages`),
  addStage: (workflowId, data) => api.post(`/workflows/${workflowId}/stages`, data),
  updateStage: (stageId, data) => api.put(`/workflows/stages/${stageId}`, data),
  deleteStage: (stageId) => api.delete(`/workflows/stages/${stageId}`),
  reorderStages: (workflowId, data) => api.post(`/workflows/${workflowId}/stages/reorder`, data),
};

export default workflowService;
