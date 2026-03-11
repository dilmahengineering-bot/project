import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import api from '../utils/api';
import { formatDate } from '../utils/helpers';
import Layout from '../components/shared/Layout';
import toast from 'react-hot-toast';

export default function ReportsPage() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({ status: '', assigned_to: '', from_date: '', to_date: '' });
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/reports/stats'), api.get('/users')]).then(([s, u]) => {
      setStats(s.data.stats);
      setUsers(u.data.users.filter(u=>u.role==='user'));
    });
  }, []);

  const downloadPDF = async () => {
    setDownloading(true);
    try {
      const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([,v])=>v)));
      const token = localStorage.getItem('tf_token');
      const res = await fetch('/api/reports/pdf?' + params, { headers: { Authorization: 'Bearer ' + token } });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'taskflow-report.pdf'; a.click();
      URL.revokeObjectURL(url);
      toast.success('Report downloaded!');
    } catch { toast.error('Failed to download report'); }
    finally { setDownloading(false); }
  };

  const chartData = stats ? [
    { name: 'Pending', count: parseInt(stats.pending), fill: '#f59e0b' },
    { name: 'In Progress', count: parseInt(stats.in_progress), fill: '#3b82f6' },
    { name: 'Completed', count: parseInt(stats.completed), fill: '#10b981' },
    { name: 'Archived', count: parseInt(stats.archived), fill: '#6b7280' },
    { name: 'Overdue', count: parseInt(stats.overdue), fill: '#ef4444' },
  ] : [];

  return (
    <Layout title="📄 Reports & Analytics">
      {/* Download bar */}
      <div className="card" style={{marginBottom:'24px'}}>
        <div className="card-header">
          <h3 style={{fontSize:'16px'}}>📊 Generate PDF Report</h3>
        </div>
        <div style={{padding:'20px',display:'flex',gap:'16px',flexWrap:'wrap',alignItems:'flex-end'}}>
          <div>
            <label className="form-label">Status Filter</label>
            <select className="form-control" style={{minWidth:'140px'}} value={filters.status} onChange={e=>setFilters(p=>({...p,status:e.target.value}))}>
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <label className="form-label">Assigned To</label>
            <select className="form-control" style={{minWidth:'160px'}} value={filters.assigned_to} onChange={e=>setFilters(p=>({...p,assigned_to:e.target.value}))}>
              <option value="">All Users</option>
              {users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">From Date</label>
            <input type="date" className="form-control" value={filters.from_date} onChange={e=>setFilters(p=>({...p,from_date:e.target.value}))} />
          </div>
          <div>
            <label className="form-label">To Date</label>
            <input type="date" className="form-control" value={filters.to_date} onChange={e=>setFilters(p=>({...p,to_date:e.target.value}))} />
          </div>
          <button className="btn btn-primary" onClick={downloadPDF} disabled={downloading}>
            {downloading ? '⏳ Generating...' : '⬇ Download PDF'}
          </button>
        </div>
      </div>

      {/* Stats overview */}
      {stats && (
        <>
          <div className="stats-grid" style={{marginBottom:'24px'}}>
            {[
              { label:'Total', val:stats.total, color:'#4f46e5', bg:'#ede9fe' },
              { label:'Pending', val:stats.pending, color:'#d97706', bg:'#fef3c7' },
              { label:'In Progress', val:stats.in_progress, color:'#2563eb', bg:'#dbeafe' },
              { label:'Completed', val:stats.completed, color:'#059669', bg:'#d1fae5' },
              { label:'Overdue', val:stats.overdue, color:'#dc2626', bg:'#fee2e2' },
              { label:'Due Soon', val:stats.due_soon, color:'#7c3aed', bg:'#ede9fe' },
            ].map((s,i)=>(
              <div key={i} className="stat-card">
                <div style={{fontSize:'28px',fontWeight:'800',color:s.color}}>{s.val || 0}</div>
                <div style={{fontSize:'13px',color:'var(--text-muted)'}}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'24px'}}>
            <div className="card">
              <div className="card-header"><h3 style={{fontSize:'15px'}}>Task Status Distribution</h3></div>
              <div style={{padding:'16px'}}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{top:5,right:10,bottom:5,left:0}}>
                    <XAxis dataKey="name" tick={{fontSize:11}} />
                    <YAxis tick={{fontSize:11}} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[4,4,0,0]}>
                      {chartData.map((d,i) => <React.Fragment key={i}><rect fill={d.fill} /></React.Fragment>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><h3 style={{fontSize:'15px'}}>Task Health Overview</h3></div>
              <div style={{padding:'24px'}}>
                {[
                  { label:'Completion Rate', value: stats.total > 0 ? Math.round((parseInt(stats.completed)+parseInt(stats.archived)) / parseInt(stats.total) * 100) : 0, color:'var(--success)' },
                  { label:'Overdue Rate', value: stats.total > 0 ? Math.round(parseInt(stats.overdue) / parseInt(stats.total) * 100) : 0, color:'var(--danger)' },
                  { label:'Active Progress', value: stats.total > 0 ? Math.round(parseInt(stats.in_progress) / parseInt(stats.total) * 100) : 0, color:'var(--secondary)' },
                ].map((m,i) => (
                  <div key={i} style={{marginBottom:'20px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:'6px'}}>
                      <span style={{fontSize:'13px',fontWeight:'600'}}>{m.label}</span>
                      <span style={{fontSize:'13px',fontWeight:'700',color:m.color}}>{m.value}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{width:m.value+'%',background:m.color}}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
