import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, onValue, get, remove, update } from 'firebase/database';
import { rtdb, db } from '../config/firebase';
import { collection, getDocs, writeBatch, deleteDoc, doc, query, where, updateDoc } from 'firebase/firestore';
import AdminUploadTicket from './AdminUploadTicket';

import Adminticketview from './Adminticketview';
import './AdminDashboard.css';

export default function AdminDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('analytics'); // 'analytics' | 'upload' | 'tickets'
  const [usersMap, setUsersMap] = useState({});
  const [submissionsList, setSubmissionsList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [systemStatus, setSystemStatus] = useState('');
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

  // --- SYSTEM CONTROL ACTIONS ---
  const handleResetAllocations = async () => {
    if (!window.confirm("⚠️ Are you sure you want to RESET ALL TICKET ALLOCATIONS?\n\nThis will unassign tickets from all users (`tickets.assignedTo = null`). Users will automatically receive fresh ticket allocations upon their next login.")) {
      return;
    }

    setResetting(true);
    setSystemStatus('⏳ Querying and unassigning all tickets...');
    let resetTicketsCount = 0;
    let resetUsersCount = 0;
    let usersPermissionDenied = false;

    try {
      // 1. Unassign all tickets
      const ticketsSnap = await getDocs(collection(db, 'tickets'));
      const ticketUpdates = [];
      ticketsSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.assignedTo !== null && data.assignedTo !== undefined) {
          ticketUpdates.push({ ref: docSnap.ref, data: { assignedTo: null } });
          resetTicketsCount++;
        }
      });

      const chunkSize = 450;
      for (let i = 0; i < ticketUpdates.length; i += chunkSize) {
        const chunk = ticketUpdates.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((item) => batch.update(item.ref, item.data));
        setSystemStatus(`Committing tickets batch ${Math.floor(i / chunkSize) + 1}...`);
        await batch.commit();
      }

      // 2. Clear ticketId from all users (if rules permit admin write on /users)
      setSystemStatus('⏳ Clearing ticketId from user profiles...');
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const userUpdates = [];
        usersSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.ticketId) {
            userUpdates.push({ ref: docSnap.ref, data: { ticketId: null } });
            resetUsersCount++;
          }
        });

        for (let i = 0; i < userUpdates.length; i += chunkSize) {
          const chunk = userUpdates.slice(i, i + chunkSize);
          const batch = writeBatch(db);
          chunk.forEach((item) => batch.update(item.ref, item.data));
          await batch.commit();
        }
      } catch (userErr) {
        if (userErr?.message?.includes('permission') || userErr?.code === 'permission-denied') {
          usersPermissionDenied = true;
          console.warn('Admin does not have write permission for /users. Self-healing login will handle reallocation automatically.');
        } else {
          throw userErr;
        }
      }

      if (usersPermissionDenied) {
        setSystemStatus(`✅ Reset ${resetTicketsCount} tickets! (Note: /users rules restricted admin write, but users will auto-heal & get new tickets on next login)`);
      } else {
        setSystemStatus(`✅ Successfully reset allocations (${resetTicketsCount} tickets unassigned, ${resetUsersCount} users cleared)!`);
      }
      setTimeout(() => setSystemStatus(''), 8000);
    } catch (err) {
      console.error('Error resetting ticket allocations:', err);
      if (err?.message?.includes('permission') || err?.code === 'permission-denied') {
        setSystemStatus(`❌ Firestore Permission Denied: Please allow admin writes in your Firebase Console -> Firestore Database -> Rules (e.g. allow read, write: if true; or check admin email).`);
      } else {
        setSystemStatus(`❌ Error resetting allocations: ${err.message}`);
      }
    } finally {
      setResetting(false);
    }
  };

  const handleFullBackup = async () => {
    setBackupLoading(true);
    setSystemStatus('⏳ Starting full database backup (Firestore + Realtime Database)...');
    try {
      const backupData = {
        exportedAt: new Date().toISOString(),
        metadata: {
          system: 'CodeSync Enterprise Real-time Control Center',
          version: '1.0.0',
        },
        firestore: {},
        realtimeDatabase: {}
      };

      // 1. Export Firestore collections: users, tickets, meta
      const firestoreCollections = ['users', 'tickets', 'meta'];
      for (const colName of firestoreCollections) {
        setSystemStatus(`⏳ Exporting Firestore collection: ${colName}...`);
        try {
          const colSnap = await getDocs(collection(db, colName));
          const colData = {};
          colSnap.forEach((docSnap) => {
            colData[docSnap.id] = docSnap.data();
          });
          backupData.firestore[colName] = colData;
        } catch (colErr) {
          console.warn(`Could not backup Firestore collection ${colName}:`, colErr);
          backupData.firestore[colName] = { error: colErr.message };
        }
      }

      // 2. Export entire Realtime Database tree
      setSystemStatus('⏳ Exporting full Realtime Database tree...');
      try {
        const rtdbSnap = await get(ref(rtdb, '/'));
        if (rtdbSnap.exists()) {
          backupData.realtimeDatabase = rtdbSnap.val();
        } else {
          backupData.realtimeDatabase = null;
        }
      } catch (rtdbErr) {
        console.warn('Could not backup Realtime Database:', rtdbErr);
        backupData.realtimeDatabase = { error: rtdbErr.message };
      }

      // 3. Generate JSON file download
      setSystemStatus('⏳ Generating single JSON backup file...');
      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `codesync-full-database-backup-${timestamp}.json`;

      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSystemStatus(`✅ Full database backup downloaded successfully: ${fileName}`);
      setTimeout(() => setSystemStatus(''), 6000);
    } catch (err) {
      console.error('Error during database backup:', err);
      setSystemStatus(`❌ Backup failed: ${err.message}`);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRoleChange = async (uid, newRole, displayName, currentTicketId) => {
    if (!uid) return;
    const isPrimaryAdmin = (usersMap[uid]?.email === 'aibaljosej@gmail.com');
    if (isPrimaryAdmin && newRole !== 'admin') {
      alert("⚠️ aibaljosej@gmail.com is the primary administrator account and cannot be demoted.");
      return;
    }

    setSystemStatus(`⏳ Updating role for ${displayName || uid} to ${newRole}...`);
    try {
      // 1. Update Firestore
      await updateDoc(doc(db, 'users', uid), { role: newRole });
      // 2. Update Realtime Database status
      await update(ref(rtdb, `status/users/${uid}`), { role: newRole });

      // 3. If newRole is admin or intagrater, unassign any ticket they hold right away
      if (newRole === 'admin' || newRole === 'intagrater') {
        try {
          const q = query(collection(db, 'tickets'), where('assignedTo', '==', uid));
          const snap = await getDocs(q);
          const batch = writeBatch(db);
          snap.forEach((docSnap) => {
            batch.update(docSnap.ref, { assignedTo: null });
          });
          if (!snap.empty) {
            batch.update(doc(db, 'users', uid), { ticketId: null });
            await batch.commit();
            console.log(`Unassigned ticket from ${displayName || uid} upon role change to ${newRole}`);
          }
        } catch (ticketErr) {
          console.warn('Could not unassign ticket upon role change:', ticketErr);
        }
      }

      setSystemStatus(`✅ Role for "${displayName || uid}" successfully updated to ${newRole.toUpperCase()}!`);
      setTimeout(() => setSystemStatus(''), 6000);
    } catch (err) {
      console.error('Error changing user role:', err);
      setSystemStatus(`❌ Error updating role: ${err.message}`);
    }
  };

  const handleDeleteUser = async (uid, displayName) => {
    if (!uid) return;
    if (!window.confirm(`⚠️ Are you sure you want to delete user "${displayName || uid}"?\n\nThis will remove their profile from Firestore and Realtime Database status/logs.`)) {
      return;
    }

    setSystemStatus(`⏳ Deleting user ${displayName || uid}...`);
    let errors = [];
    try {
      // 1. Unassign any ticket they had
      try {
        const q = query(collection(db, 'tickets'), where('assignedTo', '==', uid));
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        snap.forEach((docSnap) => {
          batch.update(docSnap.ref, { assignedTo: null });
        });
        if (!snap.empty) await batch.commit();
      } catch (err) {
        console.warn('Could not check/unassign ticket for user during delete:', err);
      }

      // 2. Delete from Firestore users collection
      try {
        await deleteDoc(doc(db, 'users', uid));
      } catch (err) {
        if (err?.message?.includes('permission') || err?.code === 'permission-denied') {
          errors.push('Firestore /users rule denied deletion (update console Rules to allow admin delete)');
        } else {
          errors.push(`Firestore: ${err.message}`);
        }
      }

      // 3. Delete from RTDB status and logs
      try {
        await remove(ref(rtdb, `status/users/${uid}`));
        await remove(ref(rtdb, `logs/users/${uid}`));
      } catch (err) {
        errors.push(`RTDB: ${err.message}`);
      }

      if (errors.length > 0) {
        setSystemStatus(`⚠️ Deleted user from RTDB/available nodes! (Note: ${errors.join(' | ')})`);
      } else {
        setSystemStatus(`✅ Successfully deleted user "${displayName || uid}" and freed their ticket!`);
      }
      setTimeout(() => setSystemStatus(''), 8000);
    } catch (err) {
      console.error('Error deleting user:', err);
      setSystemStatus(`❌ Error deleting user: ${err.message}`);
    }
  };

  const handleDeleteAllUsers = async () => {
    if (!window.confirm("🚨 WARNING: Are you sure you want to DELETE ALL USERS?\n\nThis will remove all user records from Firestore /users and Realtime Database status/users, and unassign all tickets. This action cannot be undone!")) {
      return;
    }

    setResetting(true);
    setSystemStatus('⏳ Deleting all user profiles and clearing RTDB status...');
    let deletedCount = 0;
    let errors = [];

    try {
      // 1. Unassign all tickets first
      try {
        const ticketsSnap = await getDocs(collection(db, 'tickets'));
        const batch = writeBatch(db);
        ticketsSnap.forEach((docSnap) => {
          if (docSnap.data().assignedTo !== null && docSnap.data().assignedTo !== undefined) {
            batch.update(docSnap.ref, { assignedTo: null });
          }
        });
        await batch.commit();
      } catch (tErr) {
        console.warn('Could not unassign all tickets during bulk delete:', tErr);
      }

      // 2. Delete all docs in Firestore users collection
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const chunkSize = 450;
        const userDocs = usersSnap.docs;
        for (let i = 0; i < userDocs.length; i += chunkSize) {
          const chunk = userDocs.slice(i, i + chunkSize);
          const batch = writeBatch(db);
          chunk.forEach((docSnap) => {
            batch.delete(docSnap.ref);
            deletedCount++;
          });
          await batch.commit();
        }
      } catch (err) {
        if (err?.message?.includes('permission') || err?.code === 'permission-denied') {
          errors.push('Firestore /users rules restricted bulk deletion (update console Rules to allow admin delete)');
        } else {
          errors.push(`Firestore: ${err.message}`);
        }
      }

      // 3. Remove RTDB status/users tree completely
      try {
        await remove(ref(rtdb, 'status/users'));
        setUsersMap({});
      } catch (err) {
        errors.push(`RTDB status/users: ${err.message}`);
      }

      if (errors.length > 0) {
        setSystemStatus(`⚠️ Cleared RTDB user statuses & freed tickets! (Note: ${errors.join(' | ')})`);
      } else {
        setSystemStatus(`✅ Successfully deleted all user records (${deletedCount} profiles cleared)!`);
      }
      setTimeout(() => setSystemStatus(''), 9000);
    } catch (err) {
      console.error('Error deleting all users:', err);
      setSystemStatus(`❌ Error deleting all users: ${err.message}`);
    } finally {
      setResetting(false);
    }
  };

  const handleClearFullRTDB = async () => {
    if (!window.confirm("🚨 EXTREME WARNING: Are you sure you want to DELETE ALL REALTIME DATABASE (`rtdb`) DATA?\n\nThis will permanently wipe out all live status (`status/users`), all submission logs (`logs/...`), and all realtime records from Firebase Realtime Database. This cannot be undone!")) {
      return;
    }

    setResetting(true);
    setSystemStatus('⏳ Wiping out entire Realtime Database (`/`)..');
    try {
      await remove(ref(rtdb, '/'));
      setUsersMap({});
      setSubmissionsList([]);
      setSystemStatus('✅ Successfully wiped out 100% of all Realtime Database (`rtdb`) data!');
      setTimeout(() => setSystemStatus(''), 8000);
    } catch (err) {
      console.error('Error clearing full RTDB:', err);
      if (err?.message?.includes('permission') || err?.code === 'PERMISSION_DENIED') {
        setSystemStatus(`❌ RTDB Permission Denied: Please allow admin/write access to root "/" in Firebase Console -> Realtime Database -> Rules.`);
      } else {
        setSystemStatus(`❌ Error wiping RTDB: ${err.message}`);
      }
    } finally {
      setResetting(false);
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
          className={`tab-btn ${activeTab === 'tickets' ? 'active' : ''}`}
          onClick={() => setActiveTab('tickets')}
        >
          📦 Inspect Tickets & Workspace Preview
        </button>
        <button
          className={`tab-btn ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          🎟️ Upload Challenge Tickets (R2)
        </button>
      </nav>

      {/* System Actions & Database Control Toolbar */}
      <div className="admin-system-toolbar">
        <div className="toolbar-left">
          <span className="toolbar-icon">⚡</span>
          <div className="toolbar-text">
            <span className="toolbar-title">System Actions & Database Control</span>
            <span className="toolbar-desc">Reset ticket assignments across all users or export full database collections inside a single JSON file</span>
          </div>
        </div>

        <div className="toolbar-buttons">
          <button
            onClick={handleResetAllocations}
            disabled={resetting || backupLoading}
            className="btn-reset-allocations"
            title="Unassign tickets from all users so they receive fresh assignments next login"
          >
            {resetting ? '⏳ Resetting...' : '🔄 Reset All Ticket Allocations'}
          </button>

          <button
            onClick={handleDeleteAllUsers}
            disabled={resetting || backupLoading}
            className="btn-reset-allocations"
            style={{ background: 'linear-gradient(135deg, #b91c1c, #7f1d1d)', borderColor: 'rgba(239, 68, 68, 0.6)' }}
            title="Delete all user accounts across Firestore and Realtime Database"
          >
            🗑️ Delete All Users
          </button>

          <button
            onClick={handleClearFullRTDB}
            disabled={resetting || backupLoading}
            className="btn-reset-allocations"
            style={{ background: 'linear-gradient(135deg, #c2410c, #9a3412)', borderColor: 'rgba(234, 88, 12, 0.6)' }}
            title="Wipe out all Realtime Database nodes (root /) including logs and presence"
          >
            🔥 Wipe Full RTDB Data
          </button>

          <button
            onClick={handleFullBackup}
            disabled={resetting || backupLoading}
            className="btn-full-backup"
            title="Download full JSON backup of all Firestore collections and Realtime Database"
          >
            {backupLoading ? '⏳ Generating JSON...' : '💾 Full JSON Database Backup'}
          </button>
        </div>
      </div>

      {systemStatus && (
        <div className={`system-status-banner ${systemStatus.includes('❌') ? 'status-error' : systemStatus.includes('✅') ? 'status-success' : 'status-info'}`}>
          <span>{systemStatus}</span>
        </div>
      )}

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
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleClearFullRTDB}
                  disabled={resetting || backupLoading}
                  className="btn-reset-allocations text-xs py-1.5 px-3"
                  style={{ background: 'linear-gradient(135deg, #c2410c, #9a3412)', borderColor: 'rgba(234, 88, 12, 0.6)' }}
                  title="Wipe all RTDB data including submission logs"
                >
                  🔥 Wipe Full RTDB Data
                </button>
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
                <p>Monitor connected sessions, activity indicators, and manage accounts</p>
              </div>
              <button
                onClick={handleDeleteAllUsers}
                disabled={resetting || backupLoading}
                className="btn-reset-allocations text-xs py-1.5 px-3"
                style={{ background: 'linear-gradient(135deg, #b91c1c, #7f1d1d)' }}
              >
                🗑️ Delete All Users
              </button>
            </div>
            <div className="table-responsive">
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>User</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Submitted?</th>
                    <th>Latest R2 Submission Link</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {usersArray.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="text-center py-4 text-gray-400">
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
                          <select
                            value={u.email === 'aibaljosej@gmail.com' ? 'admin' : (u.role || 'dev')}
                            disabled={u.email === 'aibaljosej@gmail.com'}
                            onChange={(e) => handleRoleChange(u.uid, e.target.value, u.displayName, u.ticketId)}
                            className="bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1 text-xs font-semibold text-white focus:outline-none focus:border-indigo-500 cursor-pointer disabled:opacity-60"
                          >
                            <option value="dev">💻 Dev (Assigned Tickets)</option>
                            <option value="intagrater">🔧 Intagrater (No Tickets)</option>
                            <option value="admin">🛡️ Admin (No Tickets)</option>
                          </select>
                        </td>
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
                        <td>
                          <button
                            onClick={() => handleDeleteUser(u.uid, u.displayName)}
                            className="px-2.5 py-1 bg-red-600/80 hover:bg-red-600 border border-red-500/50 text-white rounded-lg text-xs font-semibold shadow transition-all hover:scale-105 cursor-pointer"
                            title="Delete this user from Realtime Database and Firestore"
                          >
                            🗑️ Delete
                          </button>
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

      {/* Tab 3: Inspect Tickets & Workspace Preview */}
      {activeTab === 'tickets' && (
        <main className="admin-main-content">
          <Adminticketview />
        </main>
      )}
    </div>
  );
}
