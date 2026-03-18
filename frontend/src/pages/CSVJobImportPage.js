import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import Layout from '../components/shared/Layout';
import toast from 'react-hot-toast';
import './CSVJobImportPage.css';

export default function CSVJobImportPage() {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorkflow, setSelectedWorkflow] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [showTemplate, setShowTemplate] = useState(false);

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      const res = await api.get('/workflows');
      const cncWorkflows = res.data.filter(w => w.workflow_type === 'cnc_manufacturing');
      setWorkflows(cncWorkflows);
      if (cncWorkflows.length > 0) setSelectedWorkflow(cncWorkflows[0].id);
      setLoading(false);
    } catch (error) {
      toast.error('Failed to load workflows');
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const template = `job_name,job_card_number,subjob_card_number,job_date,machine_name,client_name,part_number,manufacturing_type,quantity,estimate_end_date,assigned_to,priority,notes
Sample Job 1,JC-001,,2026-03-18,CNC-MT01,Client A,PART-001,internal,10,2026-03-25,,medium,First batch
Sample Job 2,JC-002,,2026-03-18,CNC-MT02,Client B,PART-002,external,5,2026-03-30,user@taskflow.com,high,Rush order`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'job_cards_template.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'text/csv') {
      setCsvFile(file);
    } else {
      toast.error('Please select a valid CSV file');
      setCsvFile(null);
    }
  };

  const handleUpload = async () => {
    if (!csvFile) {
      toast.error('Please select a CSV file');
      return;
    }
    if (!selectedWorkflow) {
      toast.error('Please select a workflow');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('csv_file', csvFile);
      formData.append('workflow_id', selectedWorkflow);

      console.log('Uploading CSV file:', csvFile.name, 'Workflow:', selectedWorkflow);

      const res = await api.post('/cnc-jobs/bulk-import', formData);

      console.log('Upload response:', res.data);
      setImportResult(res.data);
      toast.success(`Imported ${res.data.summary.imported} job cards!`);
      setCsvFile(null);
      document.getElementById('csvFileInput').value = '';
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error.response?.data?.error || error.message || 'Import failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('drag-over');
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
        setCsvFile(file);
      } else {
        toast.error('Please drop a valid CSV file');
      }
    }
  };

  const triggerFileInput = () => {
    document.getElementById('csvFileInput').click();
  };

  if (loading) {
    return (
      <Layout>
        <div className="csv-import-container">
          <div className="loading">Loading...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="csv-import-container">
        <div className="csv-import-header">
          <h1>📊 Bulk Import Job Cards</h1>
          <p>Import multiple CNC job cards from a CSV file</p>
        </div>

        <div className="csv-import-content">
          {/* Step 1: Download Template */}
          <section className="import-section">
            <h2>📋 Step 1: Download Template</h2>
            <p>Start by downloading the CSV template to understand the required format:</p>
            <button className="btn btn-info" onClick={downloadTemplate}>
              📥 Download CSV Template
            </button>
            {showTemplate && (
              <div className="template-info">
                <h4>CSV Format Required:</h4>
                <ul>
                  <li><strong>job_name</strong> (Required): Name of the job</li>
                  <li><strong>job_card_number</strong> (Required): Unique job card number</li>
                  <li><strong>subjob_card_number</strong> (Optional): Sub-job card number</li>
                  <li><strong>job_date</strong> (Optional): Date in YYYY-MM-DD format</li>
                  <li><strong>machine_name</strong> (Optional): Machine name</li>
                  <li><strong>client_name</strong> (Optional): Client name</li>
                  <li><strong>part_number</strong> (Required): Part identification number</li>
                  <li><strong>manufacturing_type</strong> (Required): "internal" or "external"</li>
                  <li><strong>quantity</strong> (Optional): Number of units (default: 1)</li>
                  <li><strong>estimate_end_date</strong> (Optional): Date in YYYY-MM-DD format</li>
                  <li><strong>assigned_to</strong> (Optional): User email for assignment</li>
                  <li><strong>priority</strong> (Optional): "low", "medium", or "high"</li>
                  <li><strong>notes</strong> (Optional): Any additional notes</li>
                </ul>
              </div>
            )}
            <button
              className="btn btn-outline-secondary"
              onClick={() => setShowTemplate(!showTemplate)}
            >
              {showTemplate ? '▲ Hide' : '▼ Show'} Format Details
            </button>
          </section>

          {/* Step 2: Select Workflow */}
          <section className="import-section">
            <h2>⚙️ Step 2: Select Workflow</h2>
            <div className="form-group">
              <label>CNC Manufacturing Workflow:</label>
              <select
                value={selectedWorkflow}
                onChange={(e) => setSelectedWorkflow(e.target.value)}
                className="form-control"
              >
                <option value="">-- Select Workflow --</option>
                {workflows.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              {workflows.length === 0 && (
                <div className="alert alert-warning">
                  No CNC Manufacturing workflows found. Please create one first.
                </div>
              )}
            </div>
          </section>

          {/* Step 3: Upload CSV */}
          <section className="import-section">
            <h2>📤 Step 3: Upload CSV File</h2>
            <div 
              className="file-upload-area"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                id="csvFileInput"
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="file-input"
              />
              <div className="file-input-label">
                {csvFile ? (
                  <div className="file-selected-display">
                    <span className="check-icon">✓</span>
                    <span className="file-name">{csvFile.name}</span>
                    <button
                      className="btn-clear"
                      onClick={() => {
                        setCsvFile(null);
                        document.getElementById('csvFileInput').value = '';
                      }}
                      title="Clear selection"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="upload-icon">📁</span>
                    <p>Drag CSV file here or click to browse</p>
                    <button 
                      className="btn btn-info browse-btn"
                      onClick={triggerFileInput}
                      type="button"
                    >
                      📂 Browse Files
                    </button>
                  </>
                )}
              </div>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleUpload}
              disabled={!csvFile || !selectedWorkflow || uploading}
            >
              {uploading ? '⏳ Uploading...' : '✓ Import Job Cards'}
            </button>
          </section>

          {/* Import Results */}
          {importResult && (
            <section className="import-section results-section">
              <h2>📊 Import Results</h2>
              <div className="results-summary">
                <div className="summary-stat success">
                  <span className="stat-value">{importResult.summary.imported}</span>
                  <span className="stat-label">Imported Successfully</span>
                </div>
                <div className="summary-stat total">
                  <span className="stat-value">{importResult.summary.total}</span>
                  <span className="stat-label">Total Records</span>
                </div>
                {importResult.summary.errors > 0 && (
                  <div className="summary-stat error">
                    <span className="stat-value">{importResult.summary.errors}</span>
                    <span className="stat-label">Errors</span>
                  </div>
                )}
              </div>

              {/* Success List */}
              {importResult.imported.length > 0 && (
                <div className="results-list">
                  <h3>✓ Successfully Imported:</h3>
                  <div className="success-items">
                    {importResult.imported.map((item, idx) => (
                      <div key={idx} className="success-item">
                        <span className="check-icon">✓</span>
                        <div className="item-details">
                          <strong>{item.job_card_number}</strong>
                          <small>{item.job_name}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error List */}
              {importResult.errors.length > 0 && (
                <div className="results-list">
                  <h3>✗ Import Errors:</h3>
                  <div className="error-items">
                    {importResult.errors.map((item, idx) => (
                      <div key={idx} className="error-item">
                        <span className="error-icon">✗</span>
                        <div className="item-details">
                          <strong>{item.row}</strong>
                          <small>{item.error}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                className="btn btn-primary"
                onClick={() => setImportResult(null)}
              >
                Import Another File
              </button>
            </section>
          )}
        </div>
      </div>
    </Layout>
  );
}
