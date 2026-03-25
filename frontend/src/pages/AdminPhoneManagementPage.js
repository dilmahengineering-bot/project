import React, { useState, useEffect } from 'react';
import '../styles/AdminPhoneManagement.css';
import api from '../utils/api';

export default function AdminPhoneManagementPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [sendingUserId, setSendingUserId] = useState(null);
  const [editingUserId, setEditingUserId] = useState(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/users/phone-numbers/all');
      setUsers(response.data.users);
    } catch (err) {
      setMessage('❌ Failed to load users');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  const handleEditStart = (user) => {
    setEditingUserId(user.id);
    setPhoneInput(user.phone_number || '');
  };

  const handleEditCancel = () => {
    setEditingUserId(null);
    setPhoneInput('');
  };

  const handleSavePhone = async (userId) => {
    try {
      if (!phoneInput.trim()) {
        setMessage('❌ Phone number required');
        setMessageType('error');
        return;
      }

      if (!phoneInput.startsWith('+')) {
        setMessage('❌ Phone must start with + (e.g., +1234567890)');
        setMessageType('error');
        return;
      }

      setUpdating(true);
      const response = await api.post(`/users/${userId}/phone-number`, {
        phone_number: phoneInput
      });

      // Update local state
      setUsers(users.map(u => 
        u.id === userId ? { ...u, phone_number: phoneInput, phone_verified: false } : u
      ));

      setEditingUserId(null);
      setPhoneInput('');
      setMessage(`✅ Phone updated: ${response.data.user.name}`);
      setMessageType('success');
    } catch (err) {
      setMessage(`❌ ${err.response?.data?.error || 'Failed to update'}`);
      setMessageType('error');
    } finally {
      setUpdating(false);
    }
  };

  const handleBulkUpdate = async () => {
    try {
      const updates = users
        .filter(u => u.phone_number?.trim())
        .map(u => ({ userId: u.id, phone_number: u.phone_number }));

      if (updates.length === 0) {
        setMessage('❌ No phone numbers to update');
        setMessageType('error');
        return;
      }

      setUpdating(true);
      const response = await api.post('/users/phone-numbers/bulk-update', { updates });

      setMessage(`✅ Updated ${response.data.updated.length} users`);
      setMessageType('success');
      fetchUsers();
    } catch (err) {
      setMessage(`❌ ${err.response?.data?.error || 'Bulk update failed'}`);
      setMessageType('error');
    } finally {
      setUpdating(false);
    }
  };

  const handleSendSummary = async (userId, userName) => {
    try {
      setSendingUserId(userId);
      setMessage('');
      
      const response = await api.post(`/users/${userId}/send-summary`);
      
      setMessage(`✅ Summary sent to ${userName}! Check their phone.`);
      setMessageType('success');
      
      // Clear message after 5 seconds
      setTimeout(() => setMessage(''), 5000);
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to send summary';
      setMessage(`❌ ${errorMsg}`);
      setMessageType('error');
    } finally {
      setSendingUserId(null);
    }
  };

  if (loading) {
    return <div className="admin-phone-page">Loading...</div>;
  }

  const usersWithoutPhone = users.filter(u => !u.phone_number);
  const usersWithPhone = users.filter(u => u.phone_number);

  return (
    <div className="admin-phone-page">
      <div className="phone-header">
        <h1>📱 Manage User Phone Numbers</h1>
        <p>Configure WhatsApp phone numbers for all users</p>
      </div>

      {message && (
        <div className={`message ${messageType}`}>
          {message}
        </div>
      )}

      <div className="stats">
        <div className="stat-box">
          <span className="stat-label">Total Users</span>
          <span className="stat-value">{users.length}</span>
        </div>
        <div className="stat-box highlight-red">
          <span className="stat-label">Missing Phone</span>
          <span className="stat-value">{usersWithoutPhone.length}</span>
        </div>
        <div className="stat-box highlight-green">
          <span className="stat-label">With Phone</span>
          <span className="stat-value">{usersWithPhone.length}</span>
        </div>
      </div>

      {usersWithoutPhone.length > 0 && (
        <div className="users-section">
          <h2>⚠️ Users Without Phone Numbers</h2>
          <div className="users-list missing-phones">
            {usersWithoutPhone.map(user => (
              <div key={user.id} className="user-card missing">
                <div className="user-info">
                  <div className="user-name">{user.name}</div>
                  <div className="user-email">{user.email}</div>
                  <div className="user-role">{user.role}</div>
                </div>

                {editingUserId === user.id ? (
                  <div className="edit-form">
                    <input
                      type="tel"
                      placeholder="+1234567890"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      className="phone-input"
                    />
                    <button
                      onClick={() => handleSavePhone(user.id)}
                      className="btn btn-save"
                      disabled={updating}
                    >
                      {updating ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={handleEditCancel}
                      className="btn btn-cancel"
                      disabled={updating}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleEditStart(user)}
                    className="btn btn-edit"
                  >
                    Add Phone
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {usersWithPhone.length > 0 && (
        <div className="users-section">
          <h2>✅ Users With Phone Numbers</h2>
          <div className="users-list with-phones">
            {usersWithPhone.map(user => (
              <div key={user.id} className="user-card with-phone">
                <div className="user-info">
                  <div className="user-name">{user.name}</div>
                  <div className="user-email">{user.email}</div>
                  <div className="user-phone">
                    📱 {user.phone_number}
                    {user.phone_verified && <span className="verified-badge">✓ Verified</span>}
                  </div>
                </div>

                {editingUserId === user.id ? (
                  <div className="edit-form">
                    <input
                      type="tel"
                      placeholder="+1234567890"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      className="phone-input"
                    />
                    <button
                      onClick={() => handleSavePhone(user.id)}
                      className="btn btn-save"
                      disabled={updating}
                    >
                      {updating ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={handleEditCancel}
                      className="btn btn-cancel"
                      disabled={updating}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleEditStart(user)}
                      className="btn btn-edit"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleSendSummary(user.id, user.name)}
                      className="btn btn-send"
                      disabled={sendingUserId === user.id}
                    >
                      {sendingUserId === user.id ? '📤 Sending...' : '📤 Send Summary'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bulk-actions">
        <button
          onClick={handleBulkUpdate}
          className="btn btn-bulk"
          disabled={updating || users.length === 0}
        >
          💾 Save All Changes
        </button>
      </div>

      <div className="info-box">
        <h3>💡 Tips</h3>
        <ul>
          <li>Use international format: +country_code + phone number</li>
          <li>Example: +1234567890 for US, +94760868732 for Sri Lanka</li>
          <li>Users will receive WhatsApp notifications at 7 AM & 7 PM UTC</li>
          <li>Click "Edit" to modify existing phone numbers</li>
        </ul>
      </div>
    </div>
  );
}
