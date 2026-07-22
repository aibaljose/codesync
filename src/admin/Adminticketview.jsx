import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, getDocs, writeBatch } from 'firebase/firestore';
import { ref, get } from 'firebase/database';
import { db, auth, rtdb } from '../config/firebase';
import ChallengeWorkspace from '../components/challenge/ChallengeWorkspace';

export default function Adminticketview() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [folderFilter, setFolderFilter] = useState('all');
  const [resetting, setResetting] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [actionStatus, setActionStatus] = useState('');

  // --- SYSTEM ACTIONS FOR ADMIN ---
  const handleResetAllocations = async () => {
    if (!window.confirm("⚠️ Are you sure you want to RESET ALL TICKET ALLOCATIONS?\n\nThis will unassign tickets from all users (`tickets.assignedTo = null`). Users will automatically receive fresh ticket allocations upon their next login.")) {
      return;
    }

    setResetting(true);
    setActionStatus('⏳ Querying and unassigning all tickets...');
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
        setActionStatus(`Committing tickets batch ${Math.floor(i / chunkSize) + 1}...`);
        await batch.commit();
      }

      // 2. Clear ticketId from all users (if rules permit admin write on /users)
      setActionStatus('⏳ Clearing ticketId from user profiles...');
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
        setActionStatus(`✅ Reset ${resetTicketsCount} tickets! (Note: /users rules restricted admin write, but users will auto-heal & get new tickets on next login)`);
      } else {
        setActionStatus(`✅ Successfully reset allocations (${resetTicketsCount} tickets unassigned, ${resetUsersCount} users cleared)!`);
      }
      setTimeout(() => setActionStatus(''), 8000);
    } catch (err) {
      console.error('Error resetting ticket allocations:', err);
      if (err?.message?.includes('permission') || err?.code === 'permission-denied') {
        setActionStatus(`❌ Firestore Permission Denied: Please allow admin writes in your Firebase Console -> Firestore Database -> Rules.`);
      } else {
        setActionStatus(`❌ Error: ${err.message}`);
      }
    } finally {
      setResetting(false);
    }
  };

  const handleFullBackup = async () => {
    setBackupLoading(true);
    setActionStatus('⏳ Starting full database backup (Firestore + Realtime Database)...');
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

      const firestoreCollections = ['users', 'tickets', 'meta'];
      for (const colName of firestoreCollections) {
        setActionStatus(`⏳ Exporting Firestore collection: ${colName}...`);
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

      setActionStatus('⏳ Exporting full Realtime Database tree...');
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

      setActionStatus('⏳ Generating single JSON backup file...');
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

      setActionStatus(`✅ Full database backup downloaded successfully: ${fileName}`);
      setTimeout(() => setActionStatus(''), 6000);
    } catch (err) {
      console.error('Error during database backup:', err);
      setActionStatus(`❌ Backup failed: ${err.message}`);
    } finally {
      setBackupLoading(false);
    }
  };

  useEffect(() => {
    const ticketsRef = collection(db, 'tickets');
    const unsubscribe = onSnapshot(
      ticketsRef,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        // Sort by ID numeric asc if possible, or fallback to createdAt
        list.sort((a, b) => {
          const numA = parseInt(a.id, 10);
          const numB = parseInt(b.id, 10);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
        });
        setTickets(list);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching tickets:', err);
        setError('Failed to fetch tickets: ' + err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Compute unique folders for filtering
  const uniqueFolders = ['all', ...Array.from(new Set(tickets.map((t) => t.folder).filter(Boolean)))];

  // Filter tickets
  const filteredTickets = tickets.filter((t) => {
    const queryMatch =
      searchQuery === '' ||
      (t.id && String(t.id).toLowerCase().includes(searchQuery.toLowerCase())) ||
      (t.fileName && t.fileName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (t.storedAs && t.storedAs.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (t.folder && t.folder.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (t.assignedTo && t.assignedTo.toLowerCase().includes(searchQuery.toLowerCase()));

    const folderMatch = folderFilter === 'all' || (folderFilter === 'root' ? !t.folder : t.folder === folderFilter);

    return queryMatch && folderMatch;
  });

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Just now';
    try {
      if (timestamp.toDate) return timestamp.toDate().toLocaleString();
      if (timestamp.seconds) return new Date(timestamp.seconds * 1000).toLocaleString();
      return String(timestamp);
    } catch {
      return 'Recent';
    }
  };

  // If a ticket is selected for inspection, render the ChallengeWorkspace in readOnly mode
  if (selectedTicket) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col overflow-hidden">
        <ChallengeWorkspace
          user={{
            displayName: 'Admin Inspector',
            email: auth.currentUser?.email || 'admin@codesync.dev',
            uid: auth.currentUser?.uid || 'admin',
          }}
          onExit={() => setSelectedTicket(null)}
          ticketUrl={selectedTicket.url}
          ticketName={selectedTicket.storedAs || selectedTicket.fileName || `ticket_${selectedTicket.id}.zip`}
          ticketId={selectedTicket.id}
          readOnly={true}
        />
      </div>
    );
  }

  const totalSize = tickets.reduce((acc, t) => acc + (t.fileSize || 0), 0);
  const assignedCount = tickets.filter((t) => t.assignedTo).length;
  const availableCount = tickets.length - assignedCount;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 text-white font-sans">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gray-800/60 p-6 rounded-2xl border border-gray-700/60 shadow-xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 bg-amber-500/20 rounded-xl border border-amber-500/30 text-amber-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-gray-200 to-amber-300 bg-clip-text text-transparent">
              Challenge Tickets & Workspace Inspector
            </h2>
          </div>
          <p className="text-sm text-gray-400 max-w-2xl">
            Select any uploaded ticket to preview its instruction file, assets tree, and live HTML output inside the interactive Challenge Workspace (just view, no submission).
          </p>
        </div>

        {/* Stats Summary Badges & Quick Action Buttons */}
        <div className="flex flex-col items-end gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
            <div className="px-3.5 py-2 bg-gray-900/80 border border-gray-700/80 rounded-xl flex items-center gap-2">
              <span className="text-gray-400">Total:</span>
              <span className="text-white text-sm">{tickets.length}</span>
            </div>
            <div className="px-3.5 py-2 bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 rounded-xl flex items-center gap-2">
              <span>Available:</span>
              <span className="text-sm">{availableCount}</span>
            </div>
            <div className="px-3.5 py-2 bg-purple-950/40 border border-purple-500/30 text-purple-400 rounded-xl flex items-center gap-2">
              <span>Assigned:</span>
              <span className="text-sm">{assignedCount}</span>
            </div>
            <div className="px-3.5 py-2 bg-blue-950/40 border border-blue-500/30 text-blue-400 rounded-xl flex items-center gap-2">
              <span>Size:</span>
              <span className="text-sm">{formatBytes(totalSize)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleResetAllocations}
              disabled={resetting || backupLoading}
              className="px-3.5 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              title="Reset ticket allocations across all users"
            >
              <span>🔄</span>
              <span>{resetting ? 'Resetting...' : 'Reset Allocations'}</span>
            </button>

            <button
              onClick={handleFullBackup}
              disabled={resetting || backupLoading}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              title="Export all database collections to single JSON file"
            >
              <span>💾</span>
              <span>{backupLoading ? 'Exporting...' : 'Full JSON Backup'}</span>
            </button>
          </div>
        </div>
      </div>

      {actionStatus && (
        <div className={`p-3.5 rounded-xl border text-sm font-semibold flex items-center gap-2 ${actionStatus.includes('❌') ? 'bg-red-950/60 border-red-500/40 text-red-300' : actionStatus.includes('✅') ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' : 'bg-sky-950/60 border-sky-500/40 text-sky-300'}`}>
          <span>{actionStatus}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-gray-800/40 p-4 rounded-xl border border-gray-700/50">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search tickets by ID, name, folder, or user..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-900/90 border border-gray-700/80 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs bg-gray-800 px-2 py-0.5 rounded"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-400 whitespace-nowrap">Folder:</label>
          <select
            value={folderFilter}
            onChange={(e) => setFolderFilter(e.target.value)}
            className="bg-gray-900/90 border border-gray-700/80 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/60 transition-all cursor-pointer"
          >
            <option value="all">All Folders ({tickets.length})</option>
            <option value="root">Root only (no folder)</option>
            {uniqueFolders
              .filter((f) => f !== 'all')
              .map((folder) => (
                <option key={folder} value={folder}>
                  {folder}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* Tickets Table / List */}
      {error && (
        <div className="p-4 bg-red-950/50 border border-red-500/40 rounded-xl text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 bg-gray-800/30 border border-gray-700/40 rounded-2xl">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-gray-400">Loading tickets from Firestore...</p>
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="text-center py-16 bg-gray-800/30 border border-gray-700/40 rounded-2xl">
          <div className="text-4xl mb-2">📦</div>
          <h3 className="text-lg font-semibold text-gray-300">No Tickets Found</h3>
          <p className="text-sm text-gray-500 mt-1">
            {tickets.length === 0
              ? 'No challenge tickets uploaded yet. Head to Upload tab to upload a zip package!'
              : 'No tickets matched your filter options.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-gray-800/50 border border-gray-700/60 rounded-2xl shadow-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-900/80 text-gray-400 text-xs uppercase font-semibold border-b border-gray-700/80">
                <th className="py-3.5 px-4 w-20">Ticket #</th>
                <th className="py-3.5 px-4">Stored Name & File</th>
                <th className="py-3.5 px-4">Folder</th>
                <th className="py-3.5 px-4">Size</th>
                <th className="py-3.5 px-4">Assignment Status</th>
                <th className="py-3.5 px-4">Uploaded At</th>
                <th className="py-3.5 px-4 text-right">Inspector Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/40 text-sm">
              {filteredTickets.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-gray-700/30 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-amber-400">
                    #{ticket.id}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-white">
                      {ticket.storedAs || ticket.fileName}
                    </div>
                    {ticket.storedAs && ticket.storedAs !== ticket.fileName && (
                      <div className="text-xs text-gray-400 mt-0.5">Original: {ticket.fileName}</div>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    {ticket.folder ? (
                      <span className="px-2.5 py-0.5 bg-blue-500/15 border border-blue-500/30 text-blue-300 rounded-md text-xs font-mono">
                        {ticket.folder}
                      </span>
                    ) : (
                      <span className="text-gray-500 text-xs font-mono">tickets/ (root)</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-gray-300 font-mono text-xs">
                    {formatBytes(ticket.fileSize)}
                  </td>
                  <td className="py-3.5 px-4">
                    {ticket.assignedTo ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-500/15 border border-purple-500/30 text-purple-300 rounded-full text-xs font-medium" title={ticket.assignedTo}>
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                        <span>Assigned ({ticket.assignedTo.slice(0, 8)}...)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-full text-xs font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        <span>Available</span>
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-gray-400 text-xs">
                    {formatDate(ticket.createdAt)}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setSelectedTicket(ticket)}
                        disabled={!ticket.url}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-gray-950 font-semibold rounded-lg text-xs shadow-md transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        title="View & inspect live in Challenge Workspace"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        <span>View Workspace</span>
                      </button>

                      {ticket.url && (
                        <a
                          href={ticket.url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 bg-gray-700/80 hover:bg-gray-600 text-gray-200 hover:text-white rounded-lg transition-colors text-xs"
                          title="Download Zip Archive"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
