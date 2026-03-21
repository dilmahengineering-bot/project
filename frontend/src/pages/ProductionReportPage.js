import React, { useState, useCallback, useRef } from 'react';
import Layout from '../components/shared/Layout';
import api from '../utils/api';
import toast from 'react-hot-toast';
import './ProductionReportPage.css';

const SHIFT_CONFIG = {
  day: { start: 6, end: 18, label: 'Day Shift (06:00–18:00)', color: '#fef3c7' },
  night: { start: 18, end: 6, label: 'Night Shift (18:00–06:00)', color: '#e0e7ff' },
};

const STATUS_LABELS = {
  planned: 'Planned',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_COLORS = {
  planned: '#6366f1',
  in_progress: '#f59e0b',
  completed: '#10b981',
  cancelled: '#ef4444',
};

export default function ProductionReportPage() {
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [machines, setMachines] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const printRef = useRef(null);

  const loadReport = useCallback(async () => {
    if (!startDate || !endDate) {
      toast.error('Please select both start and end dates');
      return;
    }
    if (startDate > endDate) {
      toast.error('Start date must be before end date');
      return;
    }
    try {
      setLoading(true);
      const [machinesRes, entriesRes] = await Promise.all([
        api.get('/planning/machines'),
        api.get('/planning/entries', { params: { start_date: startDate, end_date: endDate } }),
      ]);
      setMachines(machinesRes.data.filter(m => m.status === 'active'));
      setEntries(entriesRes.data);
      setGenerated(true);
    } catch {
      toast.error('Failed to load report data');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  // Group entries by day
  const getDatesInRange = () => {
    const dates = [];
    const d = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    while (d <= end) {
      dates.push(d.toISOString().split('T')[0]);
      d.setDate(d.getDate() + 1);
    }
    return dates;
  };

  const getEntriesForDate = (dateStr) => {
    return entries.filter(entry => {
      const startDT = entry.planned_start_time ? new Date(entry.planned_start_time) : null;
      const endDT = entry.planned_end_time ? new Date(entry.planned_end_time) : null;
      const planDate = entry.plan_date?.split('T')[0];

      // Match if plan_date equals this date or the entry's time range overlaps this date
      if (planDate === dateStr) return true;
      if (startDT && endDT) {
        const dayStart = new Date(dateStr + 'T00:00:00');
        const dayEnd = new Date(dateStr + 'T23:59:59');
        return startDT <= dayEnd && endDT >= dayStart;
      }
      return false;
    });
  };

  const formatDateTime = (ts) => {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const formatTimeOnly = (ts) => {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const formatDateFull = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatDateShort = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  const getShiftLabel = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const h = d.getHours();
    return h >= SHIFT_CONFIG.day.start && h < SHIFT_CONFIG.day.end ? 'Day' : 'Night';
  };

  const calcDuration = (start, end) => {
    if (!start || !end) return '—';
    const s = new Date(start);
    const e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return '—';
    const mins = Math.round((e - s) / 60000);
    if (mins <= 0) return '—';
    const days = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    if (days > 0) return `${days}d ${h}h ${m}m`;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const handlePrint = () => {
    window.print();
  };

  // Get entries for a specific machine on a specific date
  const getMachineEntriesForDate = (machineId, dateStr) => {
    return getEntriesForDate(dateStr).filter(e => e.machine_id === machineId)
      .sort((a, b) => {
        const aTime = a.planned_start_time ? new Date(a.planned_start_time).getTime() : 0;
        const bTime = b.planned_start_time ? new Date(b.planned_start_time).getTime() : 0;
        return aTime - bTime;
      });
  };

  // Build a timeline bar for visual representation
  const getTimelineBar = (entry, dateStr) => {
    const startDT = entry.planned_start_time ? new Date(entry.planned_start_time) : null;
    const endDT = entry.planned_end_time ? new Date(entry.planned_end_time) : null;
    if (!startDT || !endDT) return null;

    const dayStart = new Date(dateStr + 'T00:00:00');
    const dayEnd = new Date(dateStr + 'T23:59:59');

    const clampedStart = new Date(Math.max(startDT.getTime(), dayStart.getTime()));
    const clampedEnd = new Date(Math.min(endDT.getTime(), dayEnd.getTime()));

    const startPct = ((clampedStart - dayStart) / (24 * 60 * 60 * 1000)) * 100;
    const widthPct = ((clampedEnd - clampedStart) / (24 * 60 * 60 * 1000)) * 100;

    return { left: `${startPct}%`, width: `${Math.max(widthPct, 2)}%` };
  };

  const dates = generated ? getDatesInRange() : [];

  return (
    <Layout>
      <div className="prod-report-page">
        {/* Controls - hidden when printing */}
        <div className="prod-report-controls no-print">
          <div className="prod-report-header">
            <h1>🖨️ Production Report</h1>
            <span className="prod-report-subtitle">Generate daily production sheets from Gantt planning</span>
          </div>

          <div className="report-form">
            <div className="report-form-row">
              <div className="form-group">
                <label>Start Date</label>
                <input type="date" className="form-control" value={startDate} onChange={e => { setStartDate(e.target.value); setGenerated(false); }} />
              </div>
              <div className="form-group">
                <label>End Date</label>
                <input type="date" className="form-control" value={endDate} onChange={e => { setEndDate(e.target.value); setGenerated(false); }} />
              </div>
              <div className="form-group form-actions">
                <button className="btn btn-primary" onClick={loadReport} disabled={loading}>
                  {loading ? '⏳ Generating...' : '📊 Generate Report'}
                </button>
                {generated && entries.length > 0 && (
                  <button className="btn btn-secondary" onClick={handlePrint}>🖨️ Print</button>
                )}
              </div>
            </div>
            {generated && (
              <div className="report-summary">
                <span>{dates.length} day{dates.length !== 1 ? 's' : ''}</span>
                <span>{entries.length} job{entries.length !== 1 ? 's' : ''}</span>
                <span>{machines.length} machine{machines.length !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        </div>

        {/* Report Sheets */}
        {generated && (
          <div className="report-sheets" ref={printRef}>
            {dates.map(dateStr => {
              const dayEntries = getEntriesForDate(dateStr);
              const activeMachines = machines.filter(m =>
                dayEntries.some(e => e.machine_id === m.id)
              );

              return (
                <div key={dateStr} className="daily-sheet">
                  {/* Sheet Header */}
                  <div className="sheet-header">
                    <div className="sheet-logo">
                      <h2>📋 TaskFlow</h2>
                      <span className="sheet-company">CNC Production Planning</span>
                    </div>
                    <div className="sheet-date-info">
                      <div className="sheet-date">{formatDateFull(dateStr)}</div>
                      <div className="sheet-date-short">Date: {formatDateShort(dateStr)}</div>
                    </div>
                    <div className="sheet-doc-info">
                      <div>Document: Daily Production Sheet</div>
                      <div>Generated: {new Date().toLocaleDateString()}</div>
                    </div>
                  </div>

                  {/* 24-hour Timeline */}
                  <div className="sheet-timeline">
                    <div className="timeline-header">
                      <span className="timeline-title">24-Hour Timeline Overview</span>
                      <div className="shift-indicators">
                        <span className="shift-badge day">☀ Day (06–18)</span>
                        <span className="shift-badge night">🌙 Night (18–06)</span>
                      </div>
                    </div>
                    <div className="timeline-bar-container">
                      <div className="timeline-hours">
                        {Array.from({ length: 24 }, (_, i) => (
                          <div key={i} className={`timeline-hour ${i >= 6 && i < 18 ? 'day' : 'night'}`}>
                            <span>{String(i).padStart(2, '0')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Machine-wise Production Table */}
                  {activeMachines.length === 0 ? (
                    <div className="sheet-no-data">No jobs planned for this date</div>
                  ) : (
                    activeMachines.map(machine => {
                      const machineEntries = getMachineEntriesForDate(machine.id, dateStr);
                      return (
                        <div key={machine.id} className="machine-section">
                          <div className="machine-section-header">
                            <span className="machine-title">🖥️ {machine.machine_name}</span>
                            <span className="machine-meta">{machine.machine_code} · {machine.machine_type} · {machineEntries.length} job{machineEntries.length !== 1 ? 's' : ''}</span>
                          </div>

                          {/* Visual timeline for this machine */}
                          <div className="machine-timeline">
                            <div className="machine-timeline-bg">
                              {Array.from({ length: 24 }, (_, i) => (
                                <div key={i} className={`mt-hour ${i >= 6 && i < 18 ? 'day' : 'night'}`} />
                              ))}
                            </div>
                            <div className="machine-timeline-blocks">
                              {machineEntries.map(entry => {
                                const bar = getTimelineBar(entry, dateStr);
                                if (!bar) return null;
                                return (
                                  <div
                                    key={entry.id}
                                    className="mt-block"
                                    style={{
                                      left: bar.left,
                                      width: bar.width,
                                      background: STATUS_COLORS[entry.status] || '#818cf8',
                                    }}
                                    title={`${entry.job_card_number}: ${formatTimeOnly(entry.planned_start_time)}–${formatTimeOnly(entry.planned_end_time)}`}
                                  >
                                    <span className="mt-block-label">{entry.job_card_number}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Detail table */}
                          <table className="production-table">
                            <thead>
                              <tr>
                                <th className="col-seq">#</th>
                                <th className="col-job">Job Card</th>
                                <th className="col-name">Job Name</th>
                                <th className="col-part">Part No.</th>
                                <th className="col-client">Client</th>
                                <th className="col-shift">Shift</th>
                                <th className="col-planned">Planned Start</th>
                                <th className="col-planned">Planned End</th>
                                <th className="col-duration">Duration</th>
                                <th className="col-actual">Actual Start</th>
                                <th className="col-actual">Actual End</th>
                                <th className="col-status">Status</th>
                                <th className="col-assignee">Operator</th>
                                <th className="col-notes">Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {machineEntries.map((entry, idx) => (
                                <tr key={entry.id} className={`status-row ${entry.status}`}>
                                  <td className="col-seq">{idx + 1}</td>
                                  <td className="col-job"><strong>{entry.job_card_number}</strong></td>
                                  <td className="col-name">{entry.job_name || '—'}</td>
                                  <td className="col-part">{entry.part_number || '—'}</td>
                                  <td className="col-client">{entry.client_name || '—'}</td>
                                  <td className="col-shift">{getShiftLabel(entry.planned_start_time)}</td>
                                  <td className="col-planned">{formatDateTime(entry.planned_start_time)}</td>
                                  <td className="col-planned">{formatDateTime(entry.planned_end_time)}</td>
                                  <td className="col-duration">{calcDuration(entry.planned_start_time, entry.planned_end_time)}</td>
                                  <td className="col-actual">{formatDateTime(entry.actual_start_time)}</td>
                                  <td className="col-actual">{formatDateTime(entry.actual_end_time)}</td>
                                  <td className="col-status">
                                    <span className="status-dot" style={{ background: STATUS_COLORS[entry.status] }}></span>
                                    {STATUS_LABELS[entry.status]}
                                  </td>
                                  <td className="col-assignee">{entry.assigned_to_name || '—'}</td>
                                  <td className="col-notes">{entry.notes || ''}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })
                  )}

                  {/* Day Summary */}
                  <div className="sheet-summary">
                    <div className="summary-item">
                      <span className="summary-label">Total Jobs</span>
                      <span className="summary-value">{dayEntries.length}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Machines Used</span>
                      <span className="summary-value">{activeMachines.length}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Planned</span>
                      <span className="summary-value">{dayEntries.filter(e => e.status === 'planned').length}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">In Progress</span>
                      <span className="summary-value">{dayEntries.filter(e => e.status === 'in_progress').length}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Completed</span>
                      <span className="summary-value">{dayEntries.filter(e => e.status === 'completed').length}</span>
                    </div>
                  </div>

                  {/* Signature Block */}
                  <div className="sheet-signatures">
                    <div className="signature-block">
                      <div className="signature-line"></div>
                      <div className="signature-role">Workshop Technician</div>
                      <div className="signature-fields">
                        <span>Name: ____________________</span>
                        <span>Date: ____________________</span>
                      </div>
                    </div>
                    <div className="signature-block">
                      <div className="signature-line"></div>
                      <div className="signature-role">Workshop Engineer</div>
                      <div className="signature-fields">
                        <span>Name: ____________________</span>
                        <span>Date: ____________________</span>
                      </div>
                    </div>
                    <div className="signature-block">
                      <div className="signature-line"></div>
                      <div className="signature-role">Workshop Manager</div>
                      <div className="signature-fields">
                        <span>Name: ____________________</span>
                        <span>Date: ____________________</span>
                      </div>
                    </div>
                  </div>

                  {/* Sheet Footer */}
                  <div className="sheet-footer">
                    <span>TaskFlow CNC Production Planning System</span>
                    <span>Page {dates.indexOf(dateStr) + 1} of {dates.length}</span>
                    <span>Confidential</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {generated && entries.length === 0 && (
          <div className="prod-report-empty no-print">
            <p>📭 No planning entries found for the selected date range.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
