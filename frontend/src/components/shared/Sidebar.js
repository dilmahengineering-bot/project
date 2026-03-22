import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getInitials } from '../../utils/helpers';
import toast from 'react-hot-toast';

const NavItem = ({ to, icon, label, badge }) => (
  <NavLink to={to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
    <span className="icon">{icon}</span>
    <span>{label}</span>
    {badge > 0 && <span className="nav-badge">{badge}</span>}
  </NavLink>
);

export default function Sidebar({ pendingExtensions = 0, isOpen, onClose }) {
  const { user, logout, isAdmin, isGuest } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    toast.success('Logged out');
    navigate('/login');
  };

  return (
    <>
      <div className={`sidebar-overlay${isOpen ? ' show' : ''}`} onClick={onClose} />
      <aside className={`sidebar${isOpen ? ' open' : ''}`}>
        <div className="sidebar-logo">
          <h1><span className="logo-icon">📋</span> TaskFlow</h1>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-section-title">Main</div>
            {!isGuest && <NavItem to="/dashboard" icon="🏠" label="Dashboard" />}
            {!isGuest && <NavItem to="/tasks" icon="✅" label="My Tasks" />}
            {!isGuest && <NavItem to="/kanban" icon="📊" label="Kanban Board" />}
            <NavItem to="/cnc-kanban" icon="⚙️" label="CNC Kanban" />
            {isGuest && <NavItem to="/display-rotation" icon="🖥️" label="Display Rotation" />}
            {!isGuest && <NavItem to="/planning" icon="🗓️" label="Job Planning" />}
            {!isGuest && <NavItem to="/gantt" icon="📊" label="Gantt Chart" />}
            {!isGuest && <NavItem to="/production-report" icon="🖨️" label="Production Report" />}
          </div>

          {isAdmin && (
            <div className="nav-section">
              <div className="nav-section-title">Admin</div>
              <NavItem to="/admin/tasks" icon="📋" label="All Tasks" />
              <NavItem to="/admin/workflows" icon="🔧" label="Workflows" />
              <NavItem to="/admin/csv-import" icon="📊" label="CSV Import" />
              <NavItem to="/admin/extensions" icon="🕐" label="Extensions" badge={pendingExtensions} />
              <NavItem to="/admin/machines" icon="🖥️" label="Machine Master" />
              <NavItem to="/admin/users" icon="👥" label="Users" />
              <NavItem to="/admin/reports" icon="📄" label="Reports" />
            </div>
          )}

          <div className="nav-section">
            <div className="nav-section-title">Account</div>
            <NavItem to="/profile" icon="⚙️" label="Settings" />
            <div className="nav-item" onClick={handleLogout}>
              <span className="icon">🚪</span>
              <span>Sign Out</span>
            </div>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="avatar" style={{background: user?.avatar_color || '#4f46e5'}}>
              {getInitials(user?.name)}
            </div>
            <div className="user-details">
              <div className="name">{user?.name}</div>
              <div className="role">{user?.role}</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
