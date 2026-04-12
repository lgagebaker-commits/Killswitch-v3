import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './AdminPanel.css';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const AdminPanel = ({ onClose }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banModal, setBanModal] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [banDuration, setBanDuration] = useState('60');
  const [banUnit, setBanUnit] = useState('minutes');
  const [banReason, setBanReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchUsers = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/admin/users`, { withCredentials: true });
      setUsers(data);
      setLoading(false);
    } catch (err) {
      setError('Failed to load users');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 10000);
    return () => clearInterval(interval);
  }, [fetchUsers]);

  const handleBan = async () => {
    if (!banModal) return;
    setError('');
    setSuccess('');
    
    let minutes = parseInt(banDuration);
    if (banUnit === 'hours') minutes *= 60;
    if (banUnit === 'days') minutes *= 1440;
    
    try {
      const { data } = await axios.post(`${API_URL}/api/admin/ban`, {
        user_id: banModal._id,
        duration_minutes: minutes,
        reason: banReason || 'Banned by owner'
      }, { withCredentials: true });
      
      setSuccess(data.message);
      setBanModal(null);
      setBanDuration('60');
      setBanUnit('minutes');
      setBanReason('');
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to ban user');
    }
  };

  const handleUnban = async (userId) => {
    setError('');
    setSuccess('');
    try {
      const { data } = await axios.post(`${API_URL}/api/admin/unban/${userId}`, {}, { withCredentials: true });
      setSuccess(data.message);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to unban user');
    }
  };

  const handleDelete = async () => {
    if (!deleteModal) return;
    setError('');
    setSuccess('');
    try {
      const { data } = await axios.delete(`${API_URL}/api/admin/users/${deleteModal._id}`, { withCredentials: true });
      setSuccess(data.message);
      setDeleteModal(null);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete user');
    }
  };

  const formatDate = (isoStr) => {
    if (!isoStr) return 'N/A';
    try {
      return new Date(isoStr).toLocaleString();
    } catch { return 'N/A'; }
  };

  const isBanned = (user) => {
    if (!user.banned_until) return false;
    return new Date(user.banned_until) > new Date();
  };

  const onlineCount = users.filter(u => u.is_online).length;
  const offlineCount = users.filter(u => !u.is_online).length;
  const bannedCount = users.filter(u => isBanned(u)).length;

  return (
    <div className="admin-overlay" data-testid="admin-panel">
      <div className="admin-panel">
        <div className="admin-header">
          <h2>Admin Panel</h2>
          <div className="admin-stats">
            <span className="stat online">{onlineCount} Online</span>
            <span className="stat offline">{offlineCount} Offline</span>
            <span className="stat banned">{bannedCount} Banned</span>
          </div>
          <button className="admin-close" onClick={onClose} data-testid="admin-close-btn">&times;</button>
        </div>

        {error && <div className="admin-error">{error}</div>}
        {success && <div className="admin-success">{success}</div>}

        {loading ? (
          <div className="admin-loading">
            <div className="spinner-small"></div>
            <p>Loading users...</p>
          </div>
        ) : (
          <div className="admin-users-list">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Email</th>
                  <th>Joined</th>
                  <th>Last Seen</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user._id} className={isBanned(user) ? 'banned-row' : ''}>
                    <td>
                      <span className={`status-dot ${user.is_online ? 'online' : 'offline'}`}></span>
                      {user.is_online ? 'Online' : 'Offline'}
                    </td>
                    <td>
                      <span className="user-name">{user.username}</span>
                      {user.role === 'owner' && <span className="role-badge owner-badge">Owner</span>}
                      {isBanned(user) && <span className="role-badge ban-badge">Banned</span>}
                    </td>
                    <td><span className={`role-tag role-${user.role}`}>{user.role}</span></td>
                    <td className="email-cell">{user.email || '-'}</td>
                    <td>{formatDate(user.created_at)}</td>
                    <td>{formatDate(user.last_seen)}</td>
                    <td className="actions-cell">
                      {user.role !== 'owner' && (
                        <>
                          {isBanned(user) ? (
                            <button 
                              className="action-btn unban-btn" 
                              onClick={() => handleUnban(user._id)}
                              data-testid={`unban-${user.username}`}
                            >
                              Unban
                            </button>
                          ) : (
                            <button 
                              className="action-btn ban-btn"
                              onClick={() => setBanModal(user)}
                              data-testid={`ban-${user.username}`}
                            >
                              Ban
                            </button>
                          )}
                          <button 
                            className="action-btn delete-btn"
                            onClick={() => setDeleteModal(user)}
                            data-testid={`delete-${user.username}`}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ban Modal */}
      {banModal && (
        <div className="modal-overlay">
          <div className="modal" data-testid="ban-modal">
            <h3>Ban {banModal.username}</h3>
            <div className="modal-form">
              <div className="input-group">
                <label>Duration</label>
                <div className="duration-row">
                  <input
                    type="number"
                    value={banDuration}
                    onChange={(e) => setBanDuration(e.target.value)}
                    min="1"
                    data-testid="ban-duration-input"
                  />
                  <select value={banUnit} onChange={(e) => setBanUnit(e.target.value)} data-testid="ban-unit-select">
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                </div>
              </div>
              <div className="input-group">
                <label>Reason</label>
                <input
                  type="text"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Enter ban reason..."
                  data-testid="ban-reason-input"
                />
              </div>
              <div className="modal-actions">
                <button className="action-btn ban-btn" onClick={handleBan} data-testid="confirm-ban-btn">
                  Confirm Ban
                </button>
                <button className="action-btn cancel-btn" onClick={() => setBanModal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteModal && (
        <div className="modal-overlay">
          <div className="modal" data-testid="delete-modal">
            <h3>Delete Account</h3>
            <p className="modal-warning">
              Are you sure you want to permanently delete <strong>{deleteModal.username}</strong>'s account? This cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="action-btn delete-btn" onClick={handleDelete} data-testid="confirm-delete-btn">
                Delete Account
              </button>
              <button className="action-btn cancel-btn" onClick={() => setDeleteModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
