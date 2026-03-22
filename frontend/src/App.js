import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { initializeTimeSync } from './services/timeSyncService';
import LoginPage from './components/auth/LoginPage';
import DashboardPage from './components/dashboard/DashboardPage';
import TasksPage from './pages/TasksPage';
import KanbanPage from './pages/KanbanPage';
import CNCKanbanPage from './pages/CNCKanbanPage';
import CompletedRecordsPage from './pages/CompletedRecordsPage';
import CSVJobImportPage from './pages/CSVJobImportPage';
import UsersPage from './pages/UsersPage';
import ExtensionsPage from './pages/ExtensionsPage';
import ReportsPage from './pages/ReportsPage';
import ProfilePage from './pages/ProfilePage';
import WorkflowManager from './components/admin/WorkflowManager';
import PlanningPage from './pages/PlanningPage';
import MachineMasterPage from './pages/MachineMasterPage';
import GanttPage from './pages/GanttPage';
import ProductionReportPage from './pages/ProductionReportPage';
import DisplayRotationPage from './pages/DisplayRotationPage';
import AdminSettingsPage from './pages/AdminSettingsPage';

const PrivateRoute = ({ children, adminOnly = false, denyGuest = false }) => {
  const { user, loading, isAdmin, isGuest } = useAuth();
  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'var(--bg)'}}>
      <div style={{textAlign:'center'}}>
        <div className="spinner" style={{margin:'0 auto 16px'}}></div>
        <p style={{color:'var(--text-muted)',fontSize:'14px'}}>Loading TaskFlow...</p>
      </div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to={isGuest ? '/cnc-kanban' : '/dashboard'} replace />;
  if (denyGuest && isGuest) return <Navigate to="/cnc-kanban" replace />;
  return children;
};

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'guest' ? '/cnc-kanban' : '/dashboard'} replace /> : <LoginPage />} />
      <Route path="/dashboard" element={<PrivateRoute denyGuest><DashboardPage /></PrivateRoute>} />
      <Route path="/tasks" element={<PrivateRoute denyGuest><TasksPage /></PrivateRoute>} />
      <Route path="/kanban" element={<PrivateRoute denyGuest><KanbanPage /></PrivateRoute>} />
      <Route path="/cnc-kanban" element={<PrivateRoute><CNCKanbanPage /></PrivateRoute>} />
      <Route path="/display-rotation" element={<PrivateRoute denyGuest={false}><DisplayRotationPage /></PrivateRoute>} />
      <Route path="/planning" element={<PrivateRoute denyGuest><PlanningPage /></PrivateRoute>} />
      <Route path="/gantt" element={<PrivateRoute denyGuest><GanttPage /></PrivateRoute>} />
      <Route path="/production-report" element={<PrivateRoute denyGuest><ProductionReportPage /></PrivateRoute>} />
      <Route path="/cnc-completed-records" element={<PrivateRoute denyGuest><CompletedRecordsPage /></PrivateRoute>} />
      <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
      <Route path="/admin/tasks" element={<PrivateRoute adminOnly><TasksPage adminView /></PrivateRoute>} />
      <Route path="/admin/users" element={<PrivateRoute adminOnly><UsersPage /></PrivateRoute>} />
      <Route path="/admin/workflows" element={<PrivateRoute adminOnly><WorkflowManager /></PrivateRoute>} />
      <Route path="/admin/csv-import" element={<PrivateRoute adminOnly><CSVJobImportPage /></PrivateRoute>} />
      <Route path="/admin/extensions" element={<PrivateRoute adminOnly><ExtensionsPage /></PrivateRoute>} />
      <Route path="/admin/machines" element={<PrivateRoute adminOnly><MachineMasterPage /></PrivateRoute>} />
      <Route path="/admin/reports" element={<PrivateRoute adminOnly><ReportsPage /></PrivateRoute>} />
      <Route path="/admin/settings" element={<PrivateRoute adminOnly><AdminSettingsPage /></PrivateRoute>} />
      <Route path="*" element={<Navigate to={user?.role === 'guest' ? '/cnc-kanban' : '/dashboard'} replace />} />
    </Routes>
  );
}

export default function App() {
  // Initialize time sync with server on app startup
  React.useEffect(() => {
    initializeTimeSync().catch(err => {
      console.warn('Failed to initialize time sync:', err);
    });
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
