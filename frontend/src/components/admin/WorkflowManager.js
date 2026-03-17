import React, { useState, useEffect } from 'react';
import workflowService from '../../services/workflowService';
import './WorkflowManager.css';

export default function WorkflowManager() {
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [showNewWorkflow, setShowNewWorkflow] = useState(false);
  const [showNewStage, setShowNewStage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editMode, setEditMode] = useState({});
  
  const [newWorkflow, setNewWorkflow] = useState({
    name: '',
    description: '',
    workflow_type: 'cnc_manufacturing',
    stages: [
      { name: 'Backlog', color: '#ef4444' },
      { name: 'In Progress', color: '#f97316' },
      { name: 'Quality Check', color: '#eab308' },
      { name: 'Ready for Delivery', color: '#22c55e' }
    ]
  });

  const [newStage, setNewStage] = useState({
    stage_name: '',
    stage_order: 0,
    color: '#6366f1'
  });

  const colors = [
    '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#10b981',
    '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6',
    '#a855f7', '#d946ef', '#ec4899', '#f43f5e'
  ];

  // Load workflows
  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async (keepSelectedId) => {
    try {
      setLoading(true);
      const response = await workflowService.getAllWorkflows();
      setWorkflows(response.data);

      // Determine which workflow to select (keep current or default to first)
      const selectId = keepSelectedId || selectedWorkflow?.id || (response.data.length > 0 ? response.data[0].id : null);
      if (selectId) {
        try {
          const detail = await workflowService.getWorkflow(selectId);
          setSelectedWorkflow(detail.data);
        } catch {
          if (response.data.length > 0) {
            const detail = await workflowService.getWorkflow(response.data[0].id);
            setSelectedWorkflow(detail.data);
          } else {
            setSelectedWorkflow(null);
          }
        }
      } else {
        setSelectedWorkflow(null);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load workflows');
      console.error('Error loading workflows:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWorkflow = async () => {
    try {
      if (!newWorkflow.name) {
        setError('Workflow name is required');
        return;
      }

      await workflowService.createWorkflow(newWorkflow);
      setShowNewWorkflow(false);
      setNewWorkflow({
        name: '',
        description: '',
        workflow_type: 'cnc_manufacturing',
        stages: [
          { name: 'Backlog', color: '#ef4444' },
          { name: 'In Progress', color: '#f97316' },
          { name: 'Quality Check', color: '#eab308' },
          { name: 'Ready for Delivery', color: '#22c55e' }
        ]
      });
      await loadWorkflows();
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create workflow');
    }
  };

  const handleAddStage = async () => {
    try {
      if (!selectedWorkflow || !newStage.stage_name) {
        setError('Stage name is required');
        return;
      }

      await workflowService.addStage(selectedWorkflow.id, newStage);
      setShowNewStage(false);
      setNewStage({ stage_name: '', stage_order: 0, color: '#6366f1' });
      await loadWorkflows();
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add stage');
    }
  };

  const handleDeleteStage = async (stageId) => {
    if (window.confirm('Are you sure you want to delete this stage?')) {
      try {
        await workflowService.deleteStage(stageId);
        await loadWorkflows();
        setError(null);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to delete stage');
      }
    }
  };

  const handleDeleteWorkflow = async (id) => {
    if (window.confirm('Are you sure you want to delete this workflow?')) {
      try {
        await workflowService.deleteWorkflow(id);
        setSelectedWorkflow(null);
        await loadWorkflows();
        setError(null);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to delete workflow');
      }
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="workflow-manager">
      <div className="workflow-manager-header">
        <h2>🔧 Workflow Master</h2>
        <button 
          className="btn btn-primary"
          onClick={() => setShowNewWorkflow(true)}
        >
          + New Workflow
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          ✕ {error}
          <button className="close-btn" onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="workflow-manager-content">
        {/* Workflows List */}
        <div className="workflows-list">
          <h3>Workflows</h3>
          {workflows.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No workflows yet</p>
          ) : (
            <div className="workflows">
              {workflows.map(wf => (
                <div 
                  key={wf.id}
                  className={`workflow-item ${selectedWorkflow?.id === wf.id ? 'active' : ''}`}
                  onClick={async () => {
                    try {
                      const detail = await workflowService.getWorkflow(wf.id);
                      setSelectedWorkflow(detail.data);
                    } catch {
                      setSelectedWorkflow(wf);
                    }
                  }}
                >
                  <div className="workflow-item-header">
                    <h4>{wf.name}</h4>
                    <span className={`badge ${wf.is_active ? 'badge-success' : 'badge-warning'}`}>
                      {wf.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{wf.workflow_type}</p>
                  {wf.description && <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{wf.description}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Workflow Details */}
        {selectedWorkflow && (
          <div className="workflow-details">
            <div className="workflow-details-header">
              <div>
                <h3>{selectedWorkflow.name}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                  Type: {selectedWorkflow.workflow_type}
                </p>
              </div>
              <button 
                className="btn btn-danger"
                onClick={() => handleDeleteWorkflow(selectedWorkflow.id)}
              >
                Delete
              </button>
            </div>

            {selectedWorkflow.description && (
              <p className="workflow-description">{selectedWorkflow.description}</p>
            )}

            <div className="stages-section">
              <div className="section-header">
                <h4>Stages</h4>
                <button 
                  className="btn btn-secondary"
                  onClick={() => setShowNewStage(true)}
                >
                  + Add Stage
                </button>
              </div>

              {!selectedWorkflow.stages || selectedWorkflow.stages.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No stages configured</p>
              ) : (
                <div className="stages-grid">
                  {selectedWorkflow.stages.map((stage, index) => (
                    <div key={stage.id} className="stage-card">
                      <div className="stage-header">
                        <div className="stage-color-dot" style={{ backgroundColor: stage.color }}></div>
                        <h5>{stage.stage_name}</h5>
                      </div>
                      <div className="stage-meta">
                        <span className="stage-order">Order: {index + 1}</span>
                        <span className={`badge ${stage.is_active ? 'badge-success' : 'badge-warning'}`}>
                          {stage.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <button 
                        className="btn btn-small btn-danger"
                        onClick={() => handleDeleteStage(stage.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* New Workflow Modal */}
      {showNewWorkflow && (
        <div className="modal-overlay" onClick={() => setShowNewWorkflow(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Create New Workflow</h3>
            
            <div className="form-group">
              <label>Workflow Name *</label>
              <input
                type="text"
                value={newWorkflow.name}
                onChange={e => setNewWorkflow({...newWorkflow, name: e.target.value})}
                placeholder="e.g., CNC Manufacturing"
              />
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                value={newWorkflow.description}
                onChange={e => setNewWorkflow({...newWorkflow, description: e.target.value})}
                placeholder="Optional description"
                rows={3}
              />
            </div>

            <div className="form-group">
              <label>Workflow Type</label>
              <select
                value={newWorkflow.workflow_type}
                onChange={e => setNewWorkflow({...newWorkflow, workflow_type: e.target.value})}
              >
                <option value="cnc_manufacturing">CNC Manufacturing</option>
                <option value="regular_tasks">Regular Tasks</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div className="form-group">
              <label>Initial Stages</label>
              <div className="stages-editor">
                {newWorkflow.stages.map((stage, index) => (
                  <div key={index} className="stage-editor-row">
                    <input
                      type="text"
                      value={stage.name}
                      onChange={e => {
                        const stages = [...newWorkflow.stages];
                        stages[index].name = e.target.value;
                        setNewWorkflow({...newWorkflow, stages});
                      }}
                      placeholder="Stage name"
                    />
                    <div className="color-picker-inline">
                      <div 
                        className="color-preview"
                        style={{ backgroundColor: stage.color }}
                      ></div>
                      <select
                        value={stage.color}
                        onChange={e => {
                          const stages = [...newWorkflow.stages];
                          stages[index].color = e.target.value;
                          setNewWorkflow({...newWorkflow, stages});
                        }}
                      >
                        {colors.map(color => (
                          <option key={color} value={color}>
                            {color}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      className="btn btn-small btn-danger"
                      onClick={() => {
                        const stages = newWorkflow.stages.filter((_, i) => i !== index);
                        setNewWorkflow({...newWorkflow, stages});
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => setNewWorkflow({
                  ...newWorkflow,
                  stages: [...newWorkflow.stages, { name: '', color: '#6366f1' }]
                })}
              >
                + Add Another Stage
              </button>
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowNewWorkflow(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCreateWorkflow}>
                Create Workflow
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Stage Modal */}
      {showNewStage && selectedWorkflow && (
        <div className="modal-overlay" onClick={() => setShowNewStage(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Add New Stage to {selectedWorkflow.name}</h3>
            
            <div className="form-group">
              <label>Stage Name *</label>
              <input
                type="text"
                value={newStage.stage_name}
                onChange={e => setNewStage({...newStage, stage_name: e.target.value})}
                placeholder="e.g., Quality Check"
              />
            </div>

            <div className="form-group">
              <label>Order</label>
              <input
                type="number"
                value={newStage.stage_order}
                onChange={e => setNewStage({...newStage, stage_order: parseInt(e.target.value)})}
                min="0"
              />
            </div>

            <div className="form-group">
              <label>Color</label>
              <div className="color-grid">
                {colors.map(color => (
                  <button
                    key={color}
                    className={`color-option ${newStage.color === color ? 'selected' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewStage({...newStage, color})}
                    title={color}
                  >
                    {newStage.color === color && '✓'}
                  </button>
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowNewStage(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleAddStage}>
                Add Stage
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
