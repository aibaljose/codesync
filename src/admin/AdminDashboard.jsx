import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, onValue } from 'firebase/database';
import { rtdb } from '../config/firebase';
import AdminUploadTicket from './AdminUploadTicket';
import './AdminDashboard.css';

export default function AdminDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('analytics'); // 'analytics' | 'upload'
  const [usersMap, setUsersMap] = useState({});
  const [submissionsList, setSubmissionsList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Listen to all users presence & status
    const usersRef = ref(rtdb, 'status/users');
    const unsubscribeUsers = onValue(usersRef, (snapshot) => {
      const data = snapshot.val() || {};
      setUsersMap(data);
    });

    // Listen to global submissions log
    const submissionsRef = ref(rtdb, 'logs/all_submissions');
    const unsubscribeSubmissions = onValue(submissionsRef, (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.entries(data).map(([key, val]) => ({
        id: key,
        ...val
      })).sort((a, b) => {
        const timeA = a.submittedAtISO ? new Date(a.submittedAtISO).getTime() : 0;
        const timeB = b.submittedAtISO ? new Date(b.submittedAtISO).getTime() : 0;
        return timeB - timeA; // newest first
      });
      setSubmissionsList(list);
      setLoading(false);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeSubmissions();
    };
  }, []);

  // Compute live metrics
  const usersArray = Object.values(usersMap);
  const onlineCount = usersArray.filter((u) => u.isOnline).length;
  const submittedUsersCount = usersArray.filter((u) => u.hasSubmitted).length;
  const totalLoggedInCount = usersArray.length;
  const totalSubmissionsCount = submissionsList.length;

  // Filtered submissions
  const filteredSubmissions = submissionsList.filter((item) => {
    const q = searchQuery.toLowerCase();
    const nameMatch = (item.displayName || '').toLowerCase().includes(q);
    const emailMatch = (item.email || '').toLowerCase().includes(q);
    const fileMatch = (item.fileName || item.originalName || '').toLowerCase().includes(q);
    const taskMatch = (item.taskId || '').toLowerCase().includes(q);
    return nameMatch || emailMatch || fileMatch || taskMatch;
  });

  const formatDuration = (seconds) => {
    if (!seconds || seconds < 0) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const formatDate = (isoString) => {
    if (!isoString) return 'Just now';
    try {
      const date = new Date(isoString);
      return date.toLocaleString();
    } catch {
      return isoString;
    }
  };

  return (
    <div className="admin-dashboard-container">
      {/* Header */}
      <header className="admin-header">
        <div className="admin-header-left">
          <div className="admin-logo-box">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <h1 className="admin-title">CodeSync Real-time Control Center</h1>
            <p className="admin-subtitle">Live user monitoring, submission logs, and ticket management</p>
          </div>
        </div>
        <div className="admin-header-right">
          <button className="nav-home-btn" onClick={() => navigate('/home')}>
            🏠 Back to Home
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="admin-tabs">
        <button
          className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          📈 Live Analytics & Submission Logs
        </button>
        <button
          className={`tab-btn ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          🎟️ Upload Challenge Tickets (R2)
        </button>
      </nav>

      {/* Tab 1: Live Analytics & Submissions */}
      {activeTab === 'analytics' && (
        <main className="admin-main-content">
          {/* Top Stat Cards */}
          <section className="stat-cards-grid">
            <div className="stat-card online-card">
              <div className="stat-card-header">
                <span className="stat-icon">🟢</span>
                <span className="stat-label">Online Now</span>
              </div>
              <div className="stat-value text-emerald-400">{onlineCount}</div>
              <div className="stat-footer">Live real-time active sessions</div>
            </div>

            <div className="stat-card submitted-card">
              <div className="stat-card-header">
                <span className="stat-icon">🚀</span>
                <span className="stat-label">Submitted Users</span>
              </div>
              <div className="stat-value text-blue-400">{submittedUsersCount}</div>
              <div className="stat-footer">Users with completed tickets</div>
            </div>

            <div className="stat-card total-subs-card">
              <div className="stat-card-header">
                <span className="stat-icon">📦</span>
                <span className="stat-label">Total Submissions</span>
              </div>
              <div className="stat-value text-purple-400">{totalSubmissionsCount}</div>
              <div className="stat-footer">Zip files saved in Cloudflare R2</div>
            </div>

            <div className="stat-card logged-card">
              <div className="stat-card-header">
                <span className="stat-icon">👥</span>
                <span className="stat-label">Total Logged In</span>
              </div>
              <div className="stat-value text-amber-400">{totalLoggedInCount}</div>
              <div className="stat-footer">Total authenticated user profiles</div>
            </div>
          </section>

          {/* Submissions & Logs Section */}
          <section className="logs-section">
            <div className="logs-header">
              <div className="logs-title-box">
                <h2>Real-time Submission Logs & R2 Archives</h2>
                <p>Instant feed from Firebase Realtime Database and Cloudflare R2 storage</p>
              </div>
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search by username, email, file name, or task..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
              </div>
            </div>

            {loading ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Syncing live database logs...</p>
              </div>
            ) : filteredSubmissions.length === 0 ? (
              <div className="empty-logs">
                <p>No submissions found matching your criteria yet.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="logs-table">
                  <thead>
                    <tr>
                      <th>Status & User</th>
                      <th>Submitted File (Same before unzip)</th>
                      <th>Task ID</th>
                      <th>Duration</th>
                      <th>Submitted At</th>
                      <th>Cloudflare R2 Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubmissions.map((sub) => {
                      const userStatus = usersMap[sub.uid] || {};
                      return (
                        <tr key={sub.id} className="log-row">
                          <td>
                            <div className="user-cell">
                              <span
                                className={`status-dot ${
                                  userStatus.isOnline ? 'dot-online' : 'dot-offline'
                                }`}
                                title={userStatus.isOnline ? 'Online' : 'Offline'}
                              ></span>
                              <div>
                                <div className="user-name-text">{sub.displayName || 'Anonymous'}</div>
                                <div className="user-email-text">{sub.email || sub.uid}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="file-badge">
                              {sub.originalName || sub.fileName}
                            </span>
                            <div className="storage-name-text">Saved as: {sub.fileName}</div>
                          </td>
                          <td>
                            <span className="task-badge">{sub.taskId || 'Task001'}</span>
                          </td>
                          <td className="duration-cell">
                            {formatDuration(sub.durationSeconds)}
                          </td>
                          <td className="time-cell">
                            {formatDate(sub.submittedAtISO)}
                          </td>
                          <td>
                            {sub.r2Url ? (
                              <a
                                href={sub.r2Url}
                                target="_blank"
                                rel="noreferrer"
                                className="r2-download-btn"
                              >
                                ⬇ Download R2 Zip ↗
                              </a>
                            ) : (
                              <span className="text-gray-500 text-xs">No R2 URL</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Active Users Table Section */}
          <section className="users-section">
            <div className="logs-header">
              <div className="logs-title-box">
                <h2>All Registered / Logged-in Users Status</h2>
                <p>Monitor connected sessions and activity indicators</p>
              </div>
            </div>
            <div className="table-responsive">
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>User</th>
                    <th>Email</th>
                    <th>Submitted?</th>
                    <th>Latest R2 Submission Link</th>
                  </tr>
                </thead>
                <tbody>
                  {usersArray.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="text-center py-4 text-gray-400">
                        No active/registered users detected yet.
                      </td>
                    </tr>
                  ) : (
                    usersArray.map((u) => (
                      <tr key={u.uid} className="log-row">
                        <td>
                          <span className={`status-pill ${u.isOnline ? 'pill-online' : 'pill-offline'}`}>
                            <span className={`status-dot ${u.isOnline ? 'dot-online' : 'dot-offline'}`}></span>
                            {u.isOnline ? 'Online' : 'Offline'}
                          </span>
                        </td>
                        <td className="font-medium text-white">{u.displayName || 'Anonymous'}</td>
                        <td className="text-gray-400">{u.email || u.uid}</td>
                        <td>
                          {u.hasSubmitted ? (
                            <span className="badge-success">✅ Yes</span>
                          ) : (
                            <span className="badge-pending">⏳ Pending</span>
                          )}
                        </td>
                        <td>
                          {u.lastSubmissionUrl ? (
                            <a
                              href={u.lastSubmissionUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-400 underline text-sm hover:text-blue-300"
                            >
                              {u.lastSubmissionFile || 'Download Zip ↗'}
                            </a>
                          ) : (
                            <span className="text-gray-500 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      )}

      {/* Tab 2: Upload Tickets */}
      {activeTab === 'upload' && (
        <main className="admin-main-content">
          <div className="upload-tab-wrapper">
            <AdminUploadTicket />
          </div>
        </main>
      )}
    </div>
  );
}
