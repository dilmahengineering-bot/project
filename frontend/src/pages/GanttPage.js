import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Layout from '../components/shared/Layout';
import api from '../utils/api';
import toast from 'react-hot-toast';
import './GanttPage.css';

const VIEW_MODES = {
  hourly: { label: 'Hourly', hours: 24, cellWidth: 80, format: 'HH:00' },
  daily: { label: 'Daily', days: 7, cellWidth: 120, format: 'ddd DD' },
  weekly: { label: 'Weekly', weeks: 4, cellWidth: 180, format: 'Week WW' },
  monthly: { label: 'Monthly', months: 6, cellWidth: 200, format: 'MMM YYYY' },
};

const SHIFT_CONFIG = {
  day: { start: 6, end: 18, label: 'Day Shift', color: '#fef3c7' },
  night: { start: 18, end: 6, label: 'Night Shift', color: '#e0e7ff' },
};

const STATUS_COLORS = {
  planned: { bg: '#818cf8', text: '#fff', border: '#6366f1' },
  in_progress: { bg: '#fbbf24', text: '#78350f', border: '#f59e0b' },
  completed: { bg: '#34d399', text: '#064e3b', border: '#10b981' },
  cancelled: { bg: '#f87171', text: '#fff', border: '#ef4444' },
};

const PRIORITY_INDICATORS = {
  high: '🔴', medium: '🟡', low: '🟢',
};

// Vibrant color palette for job cards — same job_card_id always gets the same color
const JOB_COLORS = [
  { bg: '#6366f1', text: '#fff', border: '#4f46e5' },  // indigo
  { bg: '#f59e0b', text: '#78350f', border: '#d97706' }, // amber
  { bg: '#10b981', text: '#fff', border: '#059669' },  // emerald
  { bg: '#ef4444', text: '#fff', border: '#dc2626' },  // red
  { bg: '#3b82f6', text: '#fff', border: '#2563eb' },  // blue
  { bg: '#8b5cf6', text: '#fff', border: '#7c3aed' },  // violet
  { bg: '#ec4899', text: '#fff', border: '#db2777' },  // pink
  { bg: '#14b8a6', text: '#fff', border: '#0d9488' },  // teal
  { bg: '#f97316', text: '#fff', border: '#ea580c' },  // orange
  { bg: '#06b6d4', text: '#fff', border: '#0891b2' },  // cyan
  { bg: '#84cc16', text: '#1a2e05', border: '#65a30d' }, // lime
  { bg: '#a855f7', text: '#fff', border: '#9333ea' },  // purple
  { bg: '#e11d48', text: '#fff', border: '#be123c' },  // rose
  { bg: '#0ea5e9', text: '#fff', border: '#0284c7' },  // sky
  { bg: '#d946ef', text: '#fff', border: '#c026d3' },  // fuchsia
  { bg: '#22c55e', text: '#fff', border: '#16a34a' },  // green
];

export default function GanttPage({ hideLayout = false }) {
  const [viewMode, setViewMode] = useState('hourly');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [machines, setMachines] = useState([]);
  const [entries, setEntries] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragState, setDragState] = useState(null);
  const [resizeState, setResizeState] = useState(null);
  const [editEntry, setEditEntry] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [hoveredEntry, setHoveredEntry] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const timelineRef = useRef(null);
  const ganttBodyRef = useRef(null);

  // Calculate date range based on view mode
  const dateRange = useMemo(() => {
    const base = new Date(selectedDate + 'T00:00:00');
    let start, end;
    switch (viewMode) {
      case 'hourly':
        start = new Date(base); end = new Date(base); end.setDate(end.getDate() + 1);
        break;
      case 'daily':
        start = new Date(base); start.setDate(start.getDate() - start.getDay());
        end = new Date(start); end.setDate(end.getDate() + 7);
        break;
      case 'weekly':
        start = new Date(base); start.setDate(start.getDate() - start.getDay());
        end = new Date(start); end.setDate(end.getDate() + 28);
        break;
      case 'monthly':
        start = new Date(base.getFullYear(), base.getMonth(), 1);
        end = new Date(base.getFullYear(), base.getMonth() + 6, 0);
        break;
      default:
        start = new Date(base); end = new Date(base); end.setDate(end.getDate() + 1);
    }
    return { start, end };
  }, [selectedDate, viewMode]);

  // Generate timeline columns
  const timeColumns = useMemo(() => {
    const cols = [];
    const { start, end } = dateRange;

    switch (viewMode) {
      case 'hourly':
        for (let h = 0; h < 24; h++) {
          const isDay = h >= SHIFT_CONFIG.day.start && h < SHIFT_CONFIG.day.end;
          cols.push({
            key: h,
            label: `${String(h).padStart(2, '0')}:00`,
            subLabel: isDay ? 'Day' : 'Night',
            isDay,
            width: VIEW_MODES.hourly.cellWidth,
          });
        }
        break;
      case 'daily': {
        const d = new Date(start);
        while (d < end) {
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          cols.push({
            key: d.toISOString().split('T')[0],
            label: `${dayNames[d.getDay()]} ${d.getDate()}`,
            subLabel: d.toLocaleDateString('en-US', { month: 'short' }),
            isDay: !isWeekend,
            width: VIEW_MODES.daily.cellWidth,
          });
          d.setDate(d.getDate() + 1);
        }
        break;
      }
      case 'weekly': {
        const d = new Date(start);
        let weekNum = 1;
        while (d < end) {
          const weekEnd = new Date(d); weekEnd.setDate(weekEnd.getDate() + 6);
          cols.push({
            key: d.toISOString().split('T')[0],
            label: `Week ${weekNum}`,
            subLabel: `${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'short' })} – ${weekEnd.getDate()} ${weekEnd.toLocaleDateString('en-US', { month: 'short' })}`,
            isDay: true,
            width: VIEW_MODES.weekly.cellWidth,
          });
          d.setDate(d.getDate() + 7);
          weekNum++;
        }
        break;
      }
      case 'monthly': {
        const d = new Date(start);
        while (d <= end) {
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          cols.push({
            key: `${d.getFullYear()}-${d.getMonth()}`,
            label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
            subLabel: `${new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()} days`,
            isDay: true,
            width: VIEW_MODES.monthly.cellWidth,
          });
          d.setMonth(d.getMonth() + 1);
        }
        break;
      }
      default: break;
    }
    return cols;
  }, [viewMode, dateRange]);

  const totalWidth = useMemo(() => timeColumns.reduce((s, c) => s + c.width, 0), [timeColumns]);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const startStr = dateRange.start.toISOString().split('T')[0];
      const endStr = dateRange.end.toISOString().split('T')[0];
      const [machinesRes, entriesRes, usersRes] = await Promise.all([
        api.get('/planning/machines'),
        api.get('/planning/entries', { params: { start_date: startStr, end_date: endStr } }),
        api.get('/planning/users'),
      ]);
      setMachines(machinesRes.data.filter(m => m.status === 'active'));
      setEntries(entriesRes.data);
      setUsers(usersRes.data);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { loadData(); }, [loadData]);

  // Build a stable color map: same job_card_id → same color
  const jobColorMap = useMemo(() => {
    const map = {};
    const uniqueJobIds = [...new Set(entries.map(e => e.job_card_id).filter(Boolean))];
    uniqueJobIds.forEach((id, i) => {
      map[id] = JOB_COLORS[i % JOB_COLORS.length];
    });
    return map;
  }, [entries]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Sync scroll between header and body
  const handleBodyScroll = () => {
    if (timelineRef.current && ganttBodyRef.current) {
      timelineRef.current.scrollLeft = ganttBodyRef.current.scrollLeft;
    }
  };

  // Get position and width for an entry block (hourly view)
  const getEntryPosition = useCallback((entry) => {
    const parseTS = (ts) => ts ? new Date(ts) : null;

    if (viewMode === 'hourly') {
      const startDT = parseTS(entry.planned_start_time);
      const endDT = parseTS(entry.planned_end_time);
      if (!startDT || !endDT) return null;
      const dayStart = new Date(selectedDate + 'T00:00:00');
      const startMinutes = Math.max(0, (startDT - dayStart) / 60000);
      const endMinutes = Math.min(1440, (endDT - dayStart) / 60000);
      if (endMinutes <= 0 || startMinutes >= 1440) return null;
      const cellW = VIEW_MODES.hourly.cellWidth;
      const left = (startMinutes / 60) * cellW;
      const width = Math.max(((endMinutes - startMinutes) / 60) * cellW, 40);
      return { left, width };
    }
    if (viewMode === 'daily') {
      const startDT = parseTS(entry.planned_start_time);
      const endDT = parseTS(entry.planned_end_time);
      const cellW = VIEW_MODES.daily.cellWidth;

      if (startDT && endDT) {
        // Find the first and last day columns this entry spans
        const startDateStr = startDT.toISOString().split('T')[0];
        const endDateStr = endDT.toISOString().split('T')[0];
        let startColIdx = timeColumns.findIndex(c => c.key === startDateStr);
        let endColIdx = timeColumns.findIndex(c => c.key === endDateStr);

        // If entry starts before visible range, clamp to first column
        if (startColIdx === -1) {
          const firstColDate = timeColumns[0]?.key;
          if (firstColDate && startDateStr < firstColDate) startColIdx = 0;
          else return null;
        }
        // If entry ends after visible range, clamp to last column
        if (endColIdx === -1) {
          const lastColDate = timeColumns[timeColumns.length - 1]?.key;
          if (lastColDate && endDateStr > lastColDate) endColIdx = timeColumns.length - 1;
          else if (startColIdx >= 0) endColIdx = startColIdx; // single day
          else return null;
        }

        if (startDateStr === endDateStr) {
          // Single-day entry: position within the day cell
          const dayStart = new Date(startDateStr + 'T00:00:00');
          const startMin = Math.max(0, (startDT - dayStart) / 60000);
          const endMin = Math.min(1440, (endDT - dayStart) / 60000);
          const innerLeft = (startMin / 1440) * cellW;
          const innerWidth = Math.max(((endMin - startMin) / 1440) * cellW, 30);
          return { left: startColIdx * cellW + innerLeft, width: innerWidth };
        } else {
          // Multi-day entry: span from start column to end column
          const left = startColIdx * cellW + 2;
          const width = (endColIdx - startColIdx + 1) * cellW - 4;
          return { left, width: Math.max(width, 30) };
        }
      }

      // Fallback: use plan_date
      const entryDate = entry.plan_date?.split('T')[0];
      const colIndex = timeColumns.findIndex(c => c.key === entryDate);
      if (colIndex === -1) return null;
      return { left: colIndex * cellW + 2, width: cellW - 4 };
    }
    if (viewMode === 'weekly') {
      const entryDate = new Date(entry.plan_date + 'T00:00:00');
      const startWeek = new Date(dateRange.start);
      const diffDays = Math.floor((entryDate - startWeek) / (1000 * 60 * 60 * 24));
      const weekIndex = Math.floor(diffDays / 7);
      if (weekIndex < 0 || weekIndex >= timeColumns.length) return null;
      const cellW = VIEW_MODES.weekly.cellWidth;
      const dayInWeek = diffDays % 7;
      const left = weekIndex * cellW + (dayInWeek / 7) * cellW;
      // Multi-day span in weekly view
      const startDT = parseTS(entry.planned_start_time);
      const endDT = parseTS(entry.planned_end_time);
      let spanDays = 1;
      if (startDT && endDT) spanDays = Math.max(1, Math.ceil((endDT - startDT) / (1000 * 60 * 60 * 24)));
      return { left, width: Math.max((spanDays / 7) * cellW, cellW / 7) };
    }
    if (viewMode === 'monthly') {
      const entryDate = new Date(entry.plan_date + 'T00:00:00');
      const monthIndex = (entryDate.getFullYear() - dateRange.start.getFullYear()) * 12 + entryDate.getMonth() - dateRange.start.getMonth();
      if (monthIndex < 0 || monthIndex >= timeColumns.length) return null;
      const cellW = VIEW_MODES.monthly.cellWidth;
      const daysInMonth = new Date(entryDate.getFullYear(), entryDate.getMonth() + 1, 0).getDate();
      const dayOfMonth = entryDate.getDate() - 1;
      const left = monthIndex * cellW + (dayOfMonth / daysInMonth) * cellW;
      // Multi-day span in monthly view
      const startDT = parseTS(entry.planned_start_time);
      const endDT = parseTS(entry.planned_end_time);
      let spanDays = 1;
      if (startDT && endDT) spanDays = Math.max(1, Math.ceil((endDT - startDT) / (1000 * 60 * 60 * 24)));
      return { left, width: Math.max((spanDays / daysInMonth) * cellW, 8) };
    }
    return null;
  }, [viewMode, timeColumns, dateRange, selectedDate]);

  // Drag handlers for moving blocks
  const handleBlockMouseDown = (e, entry) => {
    if (e.target.classList.contains('gantt-resize-handle')) return;
    e.preventDefault();
    const rect = ganttBodyRef.current.getBoundingClientRect();
    setDragState({
      entry,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: ganttBodyRef.current.scrollLeft,
      offsetX: e.clientX - rect.left + ganttBodyRef.current.scrollLeft,
    });
  };

  // Resize handlers
  const handleResizeMouseDown = (e, entry, direction) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = getEntryPosition(entry);
    setResizeState({
      entry,
      direction,
      startX: e.clientX,
      originalLeft: pos?.left || 0,
      originalWidth: pos?.width || 80,
    });
  };

  // Mouse move / up for drag and resize
  useEffect(() => {
    if (!dragState && !resizeState) return;

    const handleMouseMove = (e) => {
      if (dragState) {
        // Visual feedback handled by CSS transform
      }
      if (resizeState) {
        // Visual feedback handled by CSS
      }
    };

    const handleMouseUp = async (e) => {
      if (dragState) {
        const { entry } = dragState;
        const rect = ganttBodyRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left + ganttBodyRef.current.scrollLeft;
        const y = e.clientY - rect.top + ganttBodyRef.current.scrollTop;

        // Determine which machine row was dropped on
        const ROW_HEIGHT = 72;
        const machineIndex = Math.floor(y / ROW_HEIGHT);
        const targetMachine = machines[machineIndex];

        if (viewMode === 'hourly' && targetMachine) {
          const cellW = VIEW_MODES.hourly.cellWidth;
          const hourFloat = x / cellW;
          const snappedHour = Math.floor(hourFloat);
          const snappedMin = Math.round((hourFloat - snappedHour) * 4) * 15; // snap to 15-min

          // Calculate duration from original timestamps
          let durationMins = 60; // default 1 hour
          if (entry.planned_start_time && entry.planned_end_time) {
            const s = new Date(entry.planned_start_time);
            const e2 = new Date(entry.planned_end_time);
            durationMins = Math.round((e2 - s) / 60000);
            if (durationMins <= 0) durationMins = 60;
          }

          const newStartH = Math.min(Math.max(snappedHour, 0), 23);
          const newStartM = snappedMin % 60;
          const pad = (n) => String(n).padStart(2, '0');
          const newStart = `${selectedDate}T${pad(newStartH)}:${pad(newStartM)}:00`;
          const endDate = new Date(newStart);
          endDate.setMinutes(endDate.getMinutes() + durationMins);
          const newEnd = `${endDate.getFullYear()}-${pad(endDate.getMonth()+1)}-${pad(endDate.getDate())}T${pad(endDate.getHours())}:${pad(endDate.getMinutes())}:00`;

          try {
            await api.put(`/planning/entries/${entry.id}`, {
              machine_id: targetMachine.id,
              planned_start_time: newStart,
              planned_end_time: newEnd,
            });
            toast.success('Job rescheduled');
            loadData();
          } catch { toast.error('Failed to reschedule'); }
        } else if (targetMachine && targetMachine.id !== entry.machine_id) {
          try {
            await api.put(`/planning/entries/${entry.id}`, { machine_id: targetMachine.id });
            toast.success(`Moved to ${targetMachine.machine_name}`);
            loadData();
          } catch { toast.error('Failed to move'); }
        }
        setDragState(null);
      }

      if (resizeState) {
        const { entry, direction } = resizeState;
        const deltaX = e.clientX - resizeState.startX;

        if (viewMode === 'hourly') {
          const cellW = VIEW_MODES.hourly.cellWidth;
          const deltaHours = deltaX / cellW;

          const startDT = new Date(entry.planned_start_time || `${selectedDate}T08:00:00`);
          const endDT = new Date(entry.planned_end_time || `${selectedDate}T09:00:00`);
          const pad = (n) => String(n).padStart(2, '0');

          if (direction === 'left') {
            const newStartMs = startDT.getTime() + deltaHours * 3600000;
            const newStart = new Date(Math.max(new Date(selectedDate + 'T00:00:00').getTime(), newStartMs));
            // Snap to 15 min
            newStart.setMinutes(Math.round(newStart.getMinutes() / 15) * 15, 0, 0);
            const newStartStr = `${newStart.getFullYear()}-${pad(newStart.getMonth()+1)}-${pad(newStart.getDate())}T${pad(newStart.getHours())}:${pad(newStart.getMinutes())}:00`;
            const endStr = `${endDT.getFullYear()}-${pad(endDT.getMonth()+1)}-${pad(endDT.getDate())}T${pad(endDT.getHours())}:${pad(endDT.getMinutes())}:00`;
            try {
              await api.put(`/planning/entries/${entry.id}`, { planned_start_time: newStartStr, planned_end_time: endStr });
              toast.success('Time adjusted');
              loadData();
            } catch { toast.error('Failed to adjust'); }
          } else {
            const newEndMs = endDT.getTime() + deltaHours * 3600000;
            const minEnd = startDT.getTime() + 15 * 60000;
            const newEnd = new Date(Math.max(minEnd, newEndMs));
            newEnd.setMinutes(Math.round(newEnd.getMinutes() / 15) * 15, 0, 0);
            const startStr = `${startDT.getFullYear()}-${pad(startDT.getMonth()+1)}-${pad(startDT.getDate())}T${pad(startDT.getHours())}:${pad(startDT.getMinutes())}:00`;
            const newEndStr = `${newEnd.getFullYear()}-${pad(newEnd.getMonth()+1)}-${pad(newEnd.getDate())}T${pad(newEnd.getHours())}:${pad(newEnd.getMinutes())}:00`;
            try {
              await api.put(`/planning/entries/${entry.id}`, { planned_start_time: startStr, planned_end_time: newEndStr });
              toast.success('Time adjusted');
              loadData();
            } catch { toast.error('Failed to adjust'); }
          }
        }
        setResizeState(null);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, resizeState, machines, viewMode, loadData, getEntryPosition]);

  // Edit modal
  const openEdit = (entry) => {
    const toLocal = (ts) => {
      if (!ts) return '';
      const d = new Date(ts);
      if (isNaN(d.getTime())) return '';
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    setEditEntry(entry);
    setEditForm({
      planned_start_time: toLocal(entry.planned_start_time),
      planned_end_time: toLocal(entry.planned_end_time),
      actual_start_time: toLocal(entry.actual_start_time),
      actual_end_time: toLocal(entry.actual_end_time),
      status: entry.status,
      assigned_to: entry.assigned_to || '',
      notes: entry.notes || '',
    });
  };

  const handleSaveEdit = async () => {
    try {
      await api.put(`/planning/entries/${editEntry.id}`, editForm);
      toast.success('Entry updated');
      setEditEntry(null);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update');
    }
  };

  const navigateDate = (offset) => {
    const d = new Date(selectedDate);
    switch (viewMode) {
      case 'hourly': d.setDate(d.getDate() + offset); break;
      case 'daily': d.setDate(d.getDate() + 7 * offset); break;
      case 'weekly': d.setDate(d.getDate() + 28 * offset); break;
      case 'monthly': d.setMonth(d.getMonth() + 6 * offset); break;
      default: d.setDate(d.getDate() + offset);
    }
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const formatDateHeader = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    switch (viewMode) {
      case 'hourly': return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      case 'daily': {
        const end = new Date(d); end.setDate(end.getDate() + 6);
        return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      }
      case 'weekly': {
        const end = new Date(d); end.setDate(end.getDate() + 27);
        return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      }
      case 'monthly': {
        const end = new Date(d.getFullYear(), d.getMonth() + 5, 1);
        return `${d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
      }
      default: return '';
    }
  };

  const formatTime = (t) => {
    if (!t) return '—';
    const d = new Date(t);
    if (isNaN(d.getTime())) return t.substring(0, 5);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const formatTimeShort = (t) => {
    if (!t) return '—';
    const d = new Date(t);
    if (isNaN(d.getTime())) return t.substring(0, 5);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const getEntriesForMachine = (machineId) => entries.filter(e => e.machine_id === machineId);

  // Current time indicator (for hourly view)
  const now = new Date();
  const currentHourPos = viewMode === 'hourly' && selectedDate === now.toISOString().split('T')[0]
    ? (now.getHours() * 60 + now.getMinutes()) / 60 * VIEW_MODES.hourly.cellWidth
    : null;

  if (loading && machines.length === 0) {
    const loadingContent = <div className="gantt-loading"><div className="spinner" /><p>Loading Gantt chart...</p></div>;
    return hideLayout ? loadingContent : <Layout>{loadingContent}</Layout>;
  }

  const content = (
    <div className="gantt-page">
        {/* Header */}
        <div className="gantt-header">
          <div className="gantt-title">
            <h1>📊 Gantt Chart</h1>
            <span className="gantt-subtitle">Machine Scheduling Timeline</span>
          </div>
          <div className="gantt-controls">
            <div className="view-mode-tabs">
              {Object.entries(VIEW_MODES).map(([key, val]) => (
                <button
                  key={key}
                  className={`view-tab${viewMode === key ? ' active' : ''}`}
                  onClick={() => setViewMode(key)}
                >{val.label}</button>
              ))}
            </div>
            <div className="gantt-date-nav">
              <button className="btn btn-icon" onClick={() => navigateDate(-1)}>◀</button>
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="date-picker" />
              <button className="btn btn-icon" onClick={() => navigateDate(1)}>▶</button>
              <button className="btn btn-secondary btn-today" onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}>Today</button>
            </div>
          </div>
        </div>

        <div className="gantt-date-display">{formatDateHeader()}</div>

        {/* Shift Legend (hourly view) */}
        {viewMode === 'hourly' && (
          <div className="shift-legend">
            <span className="shift-item"><span className="shift-dot day"></span> Day Shift (06:00–18:00)</span>
            <span className="shift-item"><span className="shift-dot night"></span> Night Shift (18:00–06:00)</span>
            <span className="shift-item current-time-legend"><span className="current-time-dot"></span> Current Time</span>
          </div>
        )}

        {machines.length === 0 ? (
          <div className="gantt-empty"><p>🔧 No machines configured. Add machines in Machine Master first.</p></div>
        ) : (
          <div className="gantt-container">
            {/* Machine Labels (Y-axis) */}
            <div className="gantt-y-axis">
              <div className="gantt-y-header">Machines</div>
              {machines.map(m => (
                <div key={m.id} className="gantt-y-label">
                  <span className="y-machine-name">🖥️ {m.machine_name}</span>
                  <span className="y-machine-code">{m.machine_code}</span>
                </div>
              ))}
            </div>

            {/* Timeline (X-axis + body) */}
            <div className="gantt-timeline-wrapper">
              {/* X-axis header */}
              <div className="gantt-x-axis" ref={timelineRef}>
                <div className="gantt-x-row" style={{ width: totalWidth }}>
                  {timeColumns.map(col => (
                    <div
                      key={col.key}
                      className={`gantt-x-cell${col.isDay ? '' : ' off-shift'}`}
                      style={{ width: col.width }}
                    >
                      <span className="x-label">{col.label}</span>
                      <span className="x-sublabel">{col.subLabel}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Gantt body */}
              <div className="gantt-body" ref={ganttBodyRef} onScroll={handleBodyScroll}>
                <div className="gantt-body-inner" style={{ width: totalWidth }}>
                  {/* Grid lines */}
                  <div className="gantt-grid">
                    {timeColumns.map(col => (
                      <div
                        key={col.key}
                        className={`gantt-grid-col${col.isDay ? '' : ' off-shift'}`}
                        style={{ width: col.width }}
                      />
                    ))}
                  </div>

                  {/* Current time line */}
                  {currentHourPos !== null && (
                    <div className="gantt-now-line" style={{ left: currentHourPos }} />
                  )}

                  {/* Machine rows */}
                  {machines.map(machine => {
                    const machineEntries = getEntriesForMachine(machine.id);
                    return (
                      <div key={machine.id} className="gantt-row">
                        {machineEntries.map(entry => {
                          const pos = getEntryPosition(entry);
                          if (!pos) return null;
                          const jobColor = jobColorMap[entry.job_card_id] || JOB_COLORS[0];
                          const isDragging = dragState?.entry?.id === entry.id;

                          return (
                            <div
                              key={entry.id}
                              className={`gantt-block ${entry.status}${isDragging ? ' dragging' : ''}`}
                              style={{
                                left: pos.left,
                                width: pos.width,
                                background: jobColor.bg,
                                borderColor: jobColor.border,
                                color: jobColor.text,
                              }}
                              onMouseDown={e => handleBlockMouseDown(e, entry)}
                              onDoubleClick={() => openEdit(entry)}
                              onMouseEnter={(e) => { setHoveredEntry(entry); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                              onMouseLeave={() => setHoveredEntry(null)}
                              title="Drag to reschedule • Double-click to edit"
                            >
                              {/* Resize handles (hourly view only) */}
                              {viewMode === 'hourly' && (
                                <>
                                  <div className="gantt-resize-handle left" onMouseDown={e => handleResizeMouseDown(e, entry, 'left')} />
                                  <div className="gantt-resize-handle right" onMouseDown={e => handleResizeMouseDown(e, entry, 'right')} />
                                </>
                              )}
                              <div className="gantt-block-content">
                                <span className="block-job-number">
                                  {PRIORITY_INDICATORS[entry.priority] || ''} {entry.job_card_number}
                                </span>
                                {pos.width > 100 && (
                                  <span className="block-times">
                                    {formatTimeShort(entry.planned_start_time)}–{formatTimeShort(entry.planned_end_time)}
                                  </span>
                                )}
                                {pos.width > 160 && entry.job_name && (
                                  <span className="block-job-name">{entry.job_name}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tooltip */}
        {hoveredEntry && !dragState && !resizeState && (
          <div className="gantt-tooltip" style={{ left: tooltipPos.x + 12, top: tooltipPos.y + 12 }}>
            <div className="tooltip-header">
              <strong>{hoveredEntry.job_card_number}</strong>
              <span className="tooltip-status" style={{ background: STATUS_COLORS[hoveredEntry.status]?.bg, color: STATUS_COLORS[hoveredEntry.status]?.text }}>
                {hoveredEntry.status?.replace('_', ' ')}
              </span>
            </div>
            <div className="tooltip-title">{hoveredEntry.job_name}</div>
            {hoveredEntry.part_number && <div className="tooltip-detail">🔩 Part: {hoveredEntry.part_number}</div>}
            {hoveredEntry.client_name && <div className="tooltip-detail">🏢 Client: {hoveredEntry.client_name}</div>}
            <div className="tooltip-detail">🕐 Planned: {formatTime(hoveredEntry.planned_start_time)} – {formatTime(hoveredEntry.planned_end_time)}</div>
            {(hoveredEntry.actual_start_time || hoveredEntry.actual_end_time) && (
              <div className="tooltip-detail">✅ Actual: {formatTime(hoveredEntry.actual_start_time)} – {formatTime(hoveredEntry.actual_end_time)}</div>
            )}
            {hoveredEntry.assigned_to_name && <div className="tooltip-detail">👤 {hoveredEntry.assigned_to_name}</div>}
            {hoveredEntry.machine_name && <div className="tooltip-detail">🖥️ {hoveredEntry.machine_name}</div>}
            <div className="tooltip-hint">Double-click to edit • Drag to move</div>
          </div>
        )}

        {/* Edit Modal */}
        {editEntry && (
          <div className="modal-overlay" onClick={() => setEditEntry(null)}>
            <div className="modal gantt-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>✏️ Edit Job Schedule</h2>
                <button className="modal-close" onClick={() => setEditEntry(null)}>✕</button>
              </div>
              <div className="modal-body">
                <div className="edit-job-info">
                  <strong>{editEntry.job_card_number}</strong> — {editEntry.job_name}
                  <div className="edit-machine-info">🖥️ {editEntry.machine_name}</div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Planned Start (Date & Time)</label>
                    <input type="datetime-local" className="form-control" value={editForm.planned_start_time} onChange={e => setEditForm(p => ({...p, planned_start_time: e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label>Planned End (Date & Time)</label>
                    <input type="datetime-local" className="form-control" value={editForm.planned_end_time} onChange={e => setEditForm(p => ({...p, planned_end_time: e.target.value}))} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Actual Start (Date & Time)</label>
                    <input type="datetime-local" className="form-control" value={editForm.actual_start_time} onChange={e => setEditForm(p => ({...p, actual_start_time: e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label>Actual End (Date & Time)</label>
                    <input type="datetime-local" className="form-control" value={editForm.actual_end_time} onChange={e => setEditForm(p => ({...p, actual_end_time: e.target.value}))} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Status</label>
                    <select className="form-control" value={editForm.status} onChange={e => setEditForm(p => ({...p, status: e.target.value}))}>
                      <option value="planned">Planned</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Assign To</label>
                    <select className="form-control" value={editForm.assigned_to} onChange={e => setEditForm(p => ({...p, assigned_to: e.target.value}))}>
                      <option value="">Unassigned</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Notes</label>
                  <textarea className="form-control" rows="2" value={editForm.notes} onChange={e => setEditForm(p => ({...p, notes: e.target.value}))} />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setEditEntry(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSaveEdit}>Save Changes</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return hideLayout ? content : <Layout>{content}</Layout>;
}
