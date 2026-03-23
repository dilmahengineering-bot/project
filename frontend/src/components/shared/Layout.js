import React, { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Sidebar from './Sidebar';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';

export default function Layout({ children, title }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingExtensions, setPendingExtensions] = useState(0);
  const { isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAdmin) {
      api.get('/reports/stats').then(res => setPendingExtensions(res.data.pending_extensions || 0)).catch(() => {});
    }
  }, [isAdmin]);

  const handleLogout = () => {
    logout();
    toast.success('Logged out');
    navigate('/login');
  };

  return (
    <div className="app-layout">
      <Sidebar pendingExtensions={pendingExtensions} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-content">
        <header className="header">
          <div style={{display:'flex',alignItems:'center',gap:'16px'}}>
            <button className="btn btn-ghost btn-icon mobile-menu-btn" onClick={() => setSidebarOpen(true)}>
              ☰
            </button>
            <h2 className="header-title">{title}</h2>
          </div>
          <button className="btn btn-logout" onClick={handleLogout} title="Sign out">
            🚪 Sign Out
          </button>
        </header>
        <main className="page-content animate-fade">
          {children}
        </main>
      </div>
      <Toaster position="top-right" toastOptions={{ duration: 3500, style: { borderRadius: '10px', fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '14px' } }} />
    </div>
  );
}
