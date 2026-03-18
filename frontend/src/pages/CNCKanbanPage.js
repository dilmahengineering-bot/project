import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import cncJobService from '../services/cncJobService';
import workflowService from '../services/workflowService';
import CNCJobCardModal from '../components/kanban/CNCJobCardModal';
import './CNCKanbanPage.css';

const getLeadTime = (card) => {
  const start = card.job_date ? new Date(card.job_date) : null;
  if (!start) return null;
  const end = card.status === 'completed' && card.updated_at ? new Date(card.updated_at) : new Date();
  const diffMs = end - start;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 0) return null;
  if (days === 0) return '< 1 day';
  return days === 1 ? '1 day' : days + ' days';
};

const getDaysRemaining = (card) => {
  if (!card.estimate_end_date || card.status === 'completed') return null;
  const deadline = new Date(card.estimate_end_date);
  const now = new Date();
  return Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
};

const getCardUrgencyClass = (card) => {
  const days = getDaysRemaining(card);
  if (days === null) return '';
  if (days < 1) return 'card-overdue';
  if (days <= 5) return 'card-warning';
  return '';
};

export default function CNCKanbanPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [jobCards, setJobCards] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedJobCard, setSelectedJobCard] = useState(null);
  const [draggedCard, setDraggedCard] = useState(null);
  const [viewMode, setViewMode] = useState('active'); // 'active' or 'completed'

  // Load workflows and job cards
  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedWorkflow) {
      loadJobCards(selectedWorkflow.id);
    }
  }, [selectedWorkflow, viewMode]);

  const loadData = async () => {
    try {
      setLoading(true);
      const response = await workflowService.getAllWorkflows();
      setWorkflows(response.data);
      if (response.data.length > 0) {
        // Fetch full workflow details (with stages) for the first workflow
        const detail = await workflowService.getWorkflow(response.data[0].id);
        setSelectedWorkflow(detail.data);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load workflows');
      console.error('Error loading workflows:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadJobCards = async (workflowId) => {
    try {
      // Fetch workflow details to get stages (avoids stale closure issue)
      const [jobResponse, wfResponse] = await Promise.all([
        cncJobService.getJobCardsByWorkflow(workflowId, viewMode === 'completed' ? 'completed' : 'active'),
        workflowService.getWorkflow(workflowId)
      ]);
      const groupedByStage = {};

      // Initialize stages from fresh workflow data
      const stages = wfResponse.data?.stages || [];
      stages.forEach(stage => {
        groupedByStage[stage.id] = [];
      });

      // Group job cards by stage (only if viewing active jobs; completed jobs don't have stages)
      if (viewMode === 'active') {
        jobResponse.data.data?.forEach(card => {
          const stageId = card.current_stage_id;
          if (stageId) {
            if (!groupedByStage[stageId]) {
              groupedByStage[stageId] = [];
            }
            groupedByStage[stageId].push(card);
          }
        });
      }

      setJobCards(groupedByStage);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load job cards');
      console.error('Error loading job cards:', err);
    }
  };

  const handleOpenModal = (jobCard = null) => {
    setSelectedJobCard(jobCard);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedJobCard(null);
  };

  const handleCardCreated = () => {
    if (selectedWorkflow) {
      loadJobCards(selectedWorkflow.id);
    }
  };

  const handleDragStart = (e, card) => {
    setDraggedCard(card);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnStage = async (e, stage) => {
    e.preventDefault();
    if (!draggedCard || !selectedWorkflow) return;

    if (draggedCard.current_stage_id === stage.id) {
      setDraggedCard(null);
      return;
    }

    try {
      await cncJobService.moveJobCardStage(draggedCard.id, {
        stage_id: stage.id,
        notes: `Moved from Kanban board`
      });

      // Update local state
      const newJobCards = { ...jobCards };
      
      // Remove from old stage
      if (newJobCards[draggedCard.current_stage_id]) {
        newJobCards[draggedCard.current_stage_id] = 
          newJobCards[draggedCard.current_stage_id].filter(c => c.id !== draggedCard.id);
      }

      // Add to new stage
      if (!newJobCards[stage.id]) {
        newJobCards[stage.id] = [];
      }
      draggedCard.current_stage_id = stage.id;
      newJobCards[stage.id].push(draggedCard);

      setJobCards(newJobCards);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to move job card');
    } finally {
      setDraggedCard(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="cnc-kanban-page">
      <div className="kanban-header">
        <div>
          <h1>📊 CNC Manufacturing Kanban</h1>
          <p className="subtitle">Manage CNC job cards and workflows</p>
        </div>
        <div className="header-controls">
          <select 
            className="workflow-selector"
            value={selectedWorkflow?.id || ''}
            onChange={async (e) => {
              try {
                const detail = await workflowService.getWorkflow(e.target.value);
                setSelectedWorkflow(detail.data);
              } catch (err) {
                console.error('Error loading workflow:', err);
              }
            }}
          >
            <option value="">Select Workflow</option>
            {workflows.map(wf => (
              <option key={wf.id} value={wf.id}>
                {wf.name}
              </option>
            ))}
          </select>
          <button 
            className="btn btn-secondary"
            onClick={() => navigate('/cnc-completed-records')}
            title="View archived completed job cards"
          >
            📋 Completed Records
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => handleOpenModal()}
          >
            + New Job Card
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          ✕ {error}
          <button className="close-btn" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {selectedWorkflow ? (
        <div className="kanban-board">
          {selectedWorkflow.stages?.map(stage => (
            <div
              key={stage.id}
              className="kanban-column"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDropOnStage(e, stage)}
            >
              <div className="column-header" style={{ borderTopColor: stage.color }}>
                <h3>{stage.stage_name}</h3>
                <span className="card-count">{(jobCards[stage.id] || []).length}</span>
              </div>

              <div className="cards-list">
                {(jobCards[stage.id] || []).map(card => (
                  <div
                    key={card.id}
                    className={`job-card ${getCardUrgencyClass(card)}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, card)}
                    onClick={() => handleOpenModal(card)}
                  >
                    <div className="card-header">
                      <h4>{card.job_name}</h4>
                      <span className="priority-badge" data-priority={card.priority}>
                        {card.priority.toUpperCase()}
                      </span>
                    </div>

                    <div className="card-info">
                      <p><strong>Job #:</strong> {card.job_card_number}</p>
                      {card.subjob_card_number && (
                        <p><strong>Sub #:</strong> {card.subjob_card_number}</p>
                      )}
                      <p><strong>Part #:</strong> {card.part_number}</p>
                      {card.drawing_number && (
                        <p><strong>Drawing:</strong> {card.drawing_number}</p>
                      )}
                      {card.machine_name && (
                        <p><strong>Machine:</strong> {card.machine_name}</p>
                      )}
                      {card.client_name && (
                        <p><strong>Client:</strong> {card.client_name}</p>
                      )}
                      {card.material && (
                        <p><strong>Material:</strong> {card.material}</p>
                      )}
                      <p><strong>Type:</strong> {card.manufacturing_type === 'internal' ? '🏭 Internal' : '🤝 External'}</p>
                      <p><strong>Qty:</strong> {card.quantity}</p>
                    </div>

                    {card.estimate_end_date ? (
                      <div className="card-deadline">
                        <span>⏰ Due: {new Date(card.estimate_end_date).toLocaleDateString()}</span>
                      </div>
                    ) : (
                      <div className="card-deadline card-no-deadline">
                        <span>⚠️ No deadline set</span>
                      </div>
                    )}

                    {card.assigned_user && (
                      <div className="card-assignee">
                        <div 
                          className="avatar"
                          style={{ backgroundColor: '#6366f1' }}
                        >
                          {card.assigned_user.charAt(0).toUpperCase()}
                        </div>
                        <span>{card.assigned_user}</span>
                      </div>
                    )}

                    {getLeadTime(card) && (
                      <div className="card-lead-time">
                        <span>🕐 Lead Time: <strong>{getLeadTime(card)}</strong></span>
                      </div>
                    )}

                    <div className="card-footer">
                      <span className="created-date">
                        Created: {new Date(card.created_at).toLocaleDateString()}
                      </span>
                      <div className="card-badges">
                        {parseInt(card.attachment_count) > 0 && (
                          <span className="badge-attachment" title={`${card.attachment_count} attachment(s)`}>📎 {card.attachment_count}</span>
                        )}
                        {card.tolerance && (
                          <span className="badge-spec" title={`Tolerance: ${card.tolerance}`}>📐</span>
                        )}
                        {card.surface_finish && (
                          <span className="badge-spec" title={`Surface: ${card.surface_finish}`}>✨</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {(!jobCards[stage.id] || jobCards[stage.id].length === 0) && (
                  <div className="empty-state">
                    <p>No job cards</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-board">
          <p>No workflows available. Create one in the Workflow Manager.</p>
        </div>
      )}

      {showModal && (
        <CNCJobCardModal
          jobCard={selectedJobCard}
          workflow={selectedWorkflow}
          onClose={handleCloseModal}
          onSave={handleCardCreated}
        />
      )}
    </div>
  );
}
