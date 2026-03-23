import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getNowInSLST } from '../utils/timezoneHelper';
import cncJobService from '../services/cncJobService';
import workflowService from '../services/workflowService';
import CNCJobCardModal from '../components/kanban/CNCJobCardModal';
import './CNCKanbanPage.css';

const getCardAge = (card) => {
  if (!card.job_date) return null;
  try {
    const start = new Date(card.job_date);
    if (isNaN(start)) return null;
    const now = getNowInSLST();
    const days = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    if (days < 0) return null;
    if (days === 0) return '< 1 day';
    return days === 1 ? '1 day' : `${days} days`;
  } catch (err) {
    console.error('Error calculating card age:', err);
    return null;
  }
};

const getDaysToComplete = (card) => {
  try {
    // Check if card is completed by status or actual_end_date
    const isCompleted = card.status === 'completed' || card.actual_end_date;
    if (isCompleted) return null;
    
    const extDate = card.approved_extension_date;
    const estimateDate = card.estimate_end_date;
    
    // Determine the deadline to use
    let deadline = null;
    if (extDate) {
      deadline = new Date(extDate);
    } else if (estimateDate) {
      deadline = new Date(estimateDate);
    }
    
    if (!deadline || isNaN(deadline)) return null;
    
    const now = getNowInSLST();
    const days = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
    return { days, isExtended: !!extDate };
  } catch (err) {
    console.error('Error calculating days to complete:', err);
    return null;
  }
};

const getDaysRemaining = (card) => {
  try {
    // Check if card is completed
    const isCompleted = card.status === 'completed' || card.actual_end_date;
    if (isCompleted) return null;
    
    const extDate = card.approved_extension_date;
    const estimateDate = card.estimate_end_date;
    
    // Use extended date if available, otherwise use estimate date
    const deadlineStr = extDate || estimateDate;
    if (!deadlineStr) return null;
    
    const deadline = new Date(deadlineStr);
    if (isNaN(deadline)) return null;
    
    const now = getNowInSLST();
    return Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
  } catch (err) {
    console.error('Error calculating days remaining:', err);
    return null;
  }
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
  const { user, isGuest } = useAuth();
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [jobCards, setJobCards] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedJobCard, setSelectedJobCard] = useState(null);
  const [draggedCard, setDraggedCard] = useState(null);
  const [viewMode, setViewMode] = useState('active'); // 'active' or 'completed'
  const [, setTzRefreshKey] = useState(0);

  // Listen for timezone changes and force re-render so date helpers recalculate
  useEffect(() => {
    const handleSettingsChanged = (event) => {
      if (event.detail.changed?.includes('timezone')) {
        setTzRefreshKey(k => k + 1);
        if (selectedWorkflow) {
          loadJobCards(selectedWorkflow.id);
        }
      }
    };
    window.addEventListener('settingsChanged', handleSettingsChanged);
    return () => window.removeEventListener('settingsChanged', handleSettingsChanged);
  }, [selectedWorkflow]);

  // Load workflows and job cards
  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedWorkflow) {
      loadJobCards(selectedWorkflow.id);
    }
  }, [selectedWorkflow, viewMode]);

  // Auto-refresh for guest users (every 30 seconds)
  useEffect(() => {
    if (!isGuest || !selectedWorkflow) return;
    const interval = setInterval(() => {
      loadJobCards(selectedWorkflow.id);
    }, 30000);
    return () => clearInterval(interval);
  }, [isGuest, selectedWorkflow, viewMode]);

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
    if (isGuest) { e.preventDefault(); return; }
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
          {!isGuest && (
          <button 
            className="btn btn-secondary"
            onClick={() => navigate('/cnc-completed-records')}
            title="View archived completed job cards"
          >
            📋 Completed Records
          </button>
          )}
          {!isGuest && (
          <button 
            className="btn btn-primary"
            onClick={() => handleOpenModal()}
          >
            + New Job Card
          </button>
          )}
          {isGuest && (
          <button 
            className="btn btn-primary"
            onClick={() => navigate('/display-rotation')}
            title="Open fullscreen display rotation mode"
          >
            🖥️ Display Rotation
          </button>
          )}
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          ✕ {error}
          <button className="close-btn" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {selectedWorkflow ? (
        <>
          {/* CNC Summary Stats */}
          {(() => {
            const allCards = Object.values(jobCards).flat();
            if (allCards.length === 0) return null;
            const active = allCards.filter(j => j.status === 'active').length;
            const completed = allCards.filter(j => j.status === 'completed').length;
            const overdue = allCards.filter(j => {
              if (j.status === 'completed' || !j.estimate_end_date) return false;
              return new Date(j.estimate_end_date) < new Date();
            }).length;
            const dueSoon = allCards.filter(j => {
              if (j.status === 'completed' || !j.estimate_end_date) return false;
              const days = Math.ceil((new Date(j.estimate_end_date) - new Date()) / (1000 * 60 * 60 * 24));
              return days >= 0 && days <= 5;
            }).length;
            const noDeadline = allCards.filter(j => j.status === 'active' && !j.estimate_end_date).length;
            const stats = [
              { label: 'Total', value: allCards.length, icon: '📊', color: '#4f46e5', bg: '#ede9fe' },
              { label: 'Active', value: active, icon: '⚙️', color: '#0891b2', bg: '#cffafe' },
              { label: 'Completed', value: completed, icon: '✅', color: '#059669', bg: '#d1fae5' },
              { label: 'Overdue', value: overdue, icon: '🚨', color: '#dc2626', bg: '#fee2e2' },
              { label: 'Due ≤ 5 Days', value: dueSoon, icon: '⚠️', color: '#d97706', bg: '#fef3c7' },
              { label: 'No Deadline', value: noDeadline, icon: '📅', color: '#ea580c', bg: '#ffedd5' },
            ];
            return (
              <div className="stats-grid" style={{marginBottom:'20px'}}>
                {stats.map((s, i) => (
                  <div key={i} className="stat-card">
                    <div className="stat-icon" style={{background: s.bg}}>
                      <span style={{fontSize:'22px'}}>{s.icon}</span>
                    </div>
                    <div className="stat-value" style={{color: s.color}}>{s.value}</div>
                    <div className="stat-label">{s.label}</div>
                  </div>
                ))}
              </div>
            );
          })()}

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
                    draggable={!isGuest}
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

                    {card.job_date && (
                      <div className="card-metadata">
                        {getCardAge(card) && (
                          <div className="card-age">
                            <span>📅 Age: <strong>{getCardAge(card)}</strong></span>
                          </div>
                        )}

                        {(() => {
                          const dtc = getDaysToComplete(card);
                          if (!dtc) return null;
                          const isOverdue = dtc.days < 1;
                          const isWarning = dtc.days >= 1 && dtc.days <= 5;
                          const label = isOverdue
                            ? `Overdue by ${Math.abs(dtc.days)} day${Math.abs(dtc.days) !== 1 ? 's' : ''}`
                            : `${dtc.days} day${dtc.days !== 1 ? 's' : ''} remaining`;
                          return (
                            <div className={`card-days-remaining ${isOverdue ? 'days-overdue' : isWarning ? 'days-warning' : 'days-safe'} ${dtc.isExtended ? 'days-extended' : ''}`}>
                              <span>{isOverdue ? '🔴' : isWarning ? '🟡' : '🟢'} {label}</span>
                              {dtc.isExtended && <span className="extended-badge">Extended</span>}
                            </div>
                          );
                        })()}
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
        </>
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
          isCompletedRecord={isGuest}
        />
      )}
    </div>
  );
}
