import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import cncJobService from '../services/cncJobService';
import CNCJobCardModal from '../components/kanban/CNCJobCardModal';
import { formatDate } from '../utils/helpers';
import toast from 'react-hot-toast';
import './CompletedRecordsPage.css';

export default function CompletedRecordsPage() {
  const { user } = useAuth();
  const [completedJobs, setCompletedJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [sortBy, setSortBy] = useState('date'); // 'date', 'job_name', 'part_number'

  useEffect(() => {
    loadCompletedRecords();
  }, []);

  const loadCompletedRecords = async () => {
    try {
      setLoading(true);
      // Fetch all job cards with status='completed'
      const response = await cncJobService.getAllJobCards({ status: 'completed' });
      setCompletedJobs(response.data.data || []);
      setError(null);
    } catch (err) {
      console.error('Error loading completed records:', err);
      setError(err.response?.data?.error || 'Failed to load completed records');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenRecord = (job) => {
    setSelectedJob(job);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedJob(null);
  };

  const handleRecordUpdated = () => {
    loadCompletedRecords();
  };

  // Filter and sort records
  const filteredJobs = completedJobs
    .filter(job => {
      const term = searchTerm.toLowerCase();
      return (
        job.job_name?.toLowerCase().includes(term) ||
        job.job_card_number?.toLowerCase().includes(term) ||
        job.part_number?.toLowerCase().includes(term) ||
        job.client_name?.toLowerCase().includes(term)
      );
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'job_name':
          return (a.job_name || '').localeCompare(b.job_name || '');
        case 'part_number':
          return (a.part_number || '').localeCompare(b.part_number || '');
        case 'date':
        default:
          return new Date(b.updated_at) - new Date(a.updated_at);
      }
    });

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="completed-records-page">
      <div className="records-header">
        <div>
          <h1>📋 Completed Records</h1>
          <p className="subtitle">Archive of completed CNC job cards for evaluation and records</p>
        </div>
        <div className="header-stats">
          <div className="stat-card">
            <span className="stat-value">{completedJobs.length}</span>
            <span className="stat-label">Total Completed</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          ✕ {error}
          <button className="close-btn" onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="records-controls">
        <input
          type="text"
          className="search-input"
          placeholder="Search by job name, job card #, part #, or client..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select
          className="sort-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="date">Sort by Completion Date (Newest)</option>
          <option value="job_name">Sort by Job Name</option>
          <option value="part_number">Sort by Part Number</option>
        </select>
      </div>

      {filteredJobs.length === 0 ? (
        <div className="empty-state">
          <p>📭 No completed records found</p>
          <p style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>
            Mark job cards as completed from the CNC Kanban to see them here
          </p>
        </div>
      ) : (
        <div className="records-table-container">
          <table className="records-table">
            <thead>
              <tr>
                <th>Job Card #</th>
                <th>Job Name</th>
                <th>Part #</th>
                <th>Client</th>
                <th>Machine</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Completed Date</th>
                <th>Lead Time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map(job => {
                const leadDays = job.job_date && job.updated_at
                  ? Math.floor((new Date(job.updated_at) - new Date(job.job_date)) / (1000 * 60 * 60 * 24))
                  : null;
                
                return (
                  <tr key={job.id} className="record-row">
                    <td className="card-number">{job.job_card_number}</td>
                    <td className="job-name">{job.job_name}</td>
                    <td className="part-number">{job.part_number}</td>
                    <td className="client">{job.client_name || '-'}</td>
                    <td className="machine">{job.machine_name || '-'}</td>
                    <td className="type">
                      <span className="type-badge" data-type={job.manufacturing_type}>
                        {job.manufacturing_type === 'internal' ? '🏭 Internal' : '🤝 External'}
                      </span>
                    </td>
                    <td className="quantity" style={{ textAlign: 'center' }}>{job.quantity}</td>
                    <td className="completion-date">
                      {job.updated_at ? formatDate(job.updated_at) : '-'}
                    </td>
                    <td className="lead-time" style={{ textAlign: 'center' }}>
                      {leadDays !== null ? (
                        <>
                          <span className="lead-days">{leadDays}</span>
                          <span className="lead-label">days</span>
                        </>
                      ) : '-'}
                    </td>
                    <td className="actions">
                      <button
                        className="btn-view"
                        onClick={() => handleOpenRecord(job)}
                        title="View complete record"
                      >
                        👁️ View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && selectedJob && (
        <CNCJobCardModal
          jobCard={selectedJob}
          workflow={null}
          onClose={handleCloseModal}
          onSave={handleRecordUpdated}
          isCompletedRecord={true}
        />
      )}
    </div>
  );
}
