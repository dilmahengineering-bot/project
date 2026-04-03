import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import cncJobService from '../services/cncJobService';
import api from '../utils/api';
import toast from 'react-hot-toast';
import './ProcurementSummaryPage.css';
import { formatDate } from '../utils/helpers';

export default function ProcurementSummaryPage() {
  const { user, isAdmin, isGuest } = useAuth();
  const navigate = useNavigate();
  const [procurementData, setProcurementData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterMaterial, setFilterMaterial] = useState('');
  const [sortBy, setSortBy] = useState('job_name');
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'summary'

  useEffect(() => {
    loadProcurementData();
  }, []);

  const loadProcurementData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/cnc-jobs/procurement/summary');
      // Filter out jobs with no procurement data
      const filtered = response.data.filter(job => 
        job.material || job.item_code || job.dimension || 
        job.pr_number || job.po_number || job.estimated_delivery_date
      );
      setProcurementData(filtered);
    } catch (err) {
      console.error('Error loading procurement data:', err);
      toast.error('Failed to load procurement data');
    } finally {
      setLoading(false);
    }
  };

  const getFilteredAndSorted = () => {
    let data = procurementData;
    
    // Apply filters
    if (filterMaterial) {
      data = data.filter(item => 
        item.material?.toLowerCase().includes(filterMaterial.toLowerCase())
      );
    }

    // Apply sorting
    const sorted = [...data].sort((a, b) => {
      switch(sortBy) {
        case 'job_name':
          return (a.job_name || '').localeCompare(b.job_name || '');
        case 'material':
          return (a.material || '').localeCompare(b.material || '');
        case 'delivery_date':
          return new Date(a.estimated_delivery_date || 0) - new Date(b.estimated_delivery_date || 0);
        case 'po_number':
          return (a.po_number || '').localeCompare(b.po_number || '');
        default:
          return 0;
      }
    });

    return sorted;
  };

  const generateReport = async () => {
    try {
      setLoading(true);
      const response = await api.get('/cnc-jobs/procurement/report', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Procurement-Report-${new Date().toISOString().split('T')[0]}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Report generated successfully');
    } catch (err) {
      console.error('Error generating report:', err);
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    const data = getFilteredAndSorted();
    const headers = ['Job Card #', 'Job Name', 'Material', 'Item Code', 'Dimension', 'PR #', 'PO #', 'Delivery Date', 'Quantity'];
    
    const rows = data.map(item => [
      item.job_card_number,
      item.job_name,
      item.material || '—',
      item.item_code || '—',
      item.dimension || '—',
      item.pr_number || '—',
      item.po_number || '—',
      item.estimated_delivery_date ? new Date(item.estimated_delivery_date).toLocaleDateString() : '—',
      item.quantity || '—'
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Procurement-Data-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    toast.success('CSV exported successfully');
  };

  const filteredData = getFilteredAndSorted();
  const totalItems = filteredData.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const uniqueMaterials = new Set(procurementData.map(item => item.material).filter(Boolean)).size;
  const poCount = new Set(procurementData.map(item => item.po_number).filter(Boolean)).size;

  if (loading) {
    return (
      <div className="procurement-page">
        <div className="loading">⏳ Loading procurement data...</div>
      </div>
    );
  }

  return (
    <div className="procurement-page">
      <div className="procurement-header">
        <h1>📦 Procurement Summary</h1>
        <div className="header-stats">
          <div className="stat">
            <span className="label">Total Items</span>
            <span className="value">{totalItems}</span>
          </div>
          <div className="stat">
            <span className="label">Materials</span>
            <span className="value">{uniqueMaterials}</span>
          </div>
          <div className="stat">
            <span className="label">Purchase Orders</span>
            <span className="value">{poCount}</span>
          </div>
          <div className="stat">
            <span className="label">Job Cards</span>
            <span className="value">{filteredData.length}</span>
          </div>
        </div>
      </div>

      <div className="controls">
        <div className="controls-left">
          <input
            type="text"
            placeholder="🔍 Filter by material..."
            value={filterMaterial}
            onChange={(e) => setFilterMaterial(e.target.value)}
            className="filter-input"
          />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="sort-select">
            <option value="job_name">Sort: Job Name</option>
            <option value="material">Sort: Material</option>
            <option value="delivery_date">Sort: Delivery Date</option>
            <option value="po_number">Sort: PO Number</option>
          </select>
        </div>
        <div className="controls-right">
          <button className="btn btn-primary" onClick={generateReport} disabled={loading} title="Generate PDF report">
            📄 PDF Report
          </button>
          <button className="btn btn-secondary" onClick={exportCSV} disabled={loading} title="Export to CSV">
            📊 Export CSV
          </button>
          <button 
            className={`btn ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
            title="Table view"
          >
            📋 Table
          </button>
          <button 
            className={`btn ${viewMode === 'summary' ? 'active' : ''}`}
            onClick={() => setViewMode('summary')}
            title="Summary view"
          >
            📊 Summary
          </button>
        </div>
      </div>

      {filteredData.length === 0 ? (
        <div className="empty-state">
          <p>📦 No procurement data found</p>
          <p className="hint">Add procurement details to job cards to see them here</p>
        </div>
      ) : viewMode === 'table' ? (
        <div className="table-container">
          <table className="procurement-table">
            <thead>
              <tr>
                <th>Job Card #</th>
                <th>Job Name</th>
                <th>Material</th>
                <th>Item Code</th>
                <th>Dimension</th>
                <th>Quantity</th>
                <th>PR #</th>
                <th>PO #</th>
                <th>Delivery Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((item, idx) => (
                <tr key={idx} className="data-row">
                  <td className="code">{item.job_card_number}</td>
                  <td className="name">{item.job_name}</td>
                  <td>{item.material || '—'}</td>
                  <td className="code">{item.item_code || '—'}</td>
                  <td>{item.dimension || '—'}</td>
                  <td className="qty">{item.quantity || '—'}</td>
                  <td className="code">{item.pr_number || '—'}</td>
                  <td className="code po">{item.po_number || '—'}</td>
                  <td className="date">
                    {item.estimated_delivery_date 
                      ? formatDate(item.estimated_delivery_date)
                      : '—'
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="summary-container">
          <div className="summary-section">
            <h3>Materials Summary</h3>
            {[...new Set(filteredData.map(item => item.material).filter(Boolean))].map(material => (
              <div key={material} className="summary-item">
                <span className="label">{material}</span>
                <span className="count">
                  {filteredData.filter(item => item.material === material).length} items · 
                  {filteredData.filter(item => item.material === material).reduce((sum, item) => sum + (item.quantity || 0), 0)} units
                </span>
              </div>
            ))}
          </div>

          <div className="summary-section">
            <h3>Purchase Orders</h3>
            {[...new Set(filteredData.map(item => item.po_number).filter(Boolean))].map(po => {
              const poItems = filteredData.filter(item => item.po_number === po);
              return (
                <div key={po} className="summary-item">
                  <span className="label">{po}</span>
                  <span className="count">
                    {poItems.length} items · 
                    {poItems.reduce((sum, item) => sum + (item.quantity || 0), 0)} units
                  </span>
                </div>
              );
            })}
          </div>

          <div className="summary-section">
            <h3>Delivery Timeline</h3>
            {[...new Set(filteredData
              .map(item => item.estimated_delivery_date)
              .filter(Boolean)
              .sort((a, b) => new Date(a) - new Date(b))
            )].map(date => {
              const dateItems = filteredData.filter(item => item.estimated_delivery_date === date);
              return (
                <div key={date} className="summary-item">
                  <span className="label">{formatDate(date)}</span>
                  <span className="count">
                    {dateItems.length} items
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
