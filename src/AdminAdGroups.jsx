import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiEye,
  FiTrash,
  FiLink,
  FiEdit2,
  FiFileText,
  FiGrid,
  FiArchive,
  FiRotateCcw,
  FiPlus,
  FiList,
  FiColumns,
  FiCheckCircle,
  FiThumbsUp,
  FiThumbsDown,
  FiEdit,
} from 'react-icons/fi';
import { collection, getDocs, getDoc, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase/config';
import createArchiveTicket from './utils/createArchiveTicket';
import deleteGroup from './utils/deleteGroup';
import Table from './components/common/Table';
import CreateAdGroup from './CreateAdGroup';
import AdGroupCard from './components/AdGroupCard.jsx';
import TabButton from './components/TabButton.jsx';
import { auth } from './firebase/config';
import useUserRole from './useUserRole';
import parseAdFilename from './utils/parseAdFilename';
import getUserName from './utils/getUserName';
import generatePassword from './utils/generatePassword';
import ShareLinkModal from './components/ShareLinkModal.jsx';
import StatusBadge from './components/StatusBadge.jsx';
import IconButton from './components/IconButton.jsx';

const AdminAdGroups = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewNote, setViewNote] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const user = auth.currentUser;
  const { role, brandCodes } = useUserRole(user?.uid);
  const isAdmin = role === 'admin';
  const isManager = role === 'manager';

  const [shareInfo, setShareInfo] = useState(null);
  const [renameId, setRenameId] = useState(null);
  const [renameName, setRenameName] = useState('');
  const [menuOpen, setMenuOpen] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('');
  const [sortField, setSortField] = useState('status');
  const [designers, setDesigners] = useState([]);
  const [designerFilter, setDesignerFilter] = useState('');
  const [view, setView] = useState('kanban');

  const handleShare = async (id) => {
    let url = `${window.location.origin}/review/${id}`;
    const params = new URLSearchParams();
    if (user?.email) params.set('email', user.email);
    if (role) params.set('role', role);
    const str = params.toString();
    if (str) url += `?${str}`;

    const password = generatePassword();
    try {
      await updateDoc(doc(db, 'adGroups', id), { password });
    } catch (err) {
      console.error('Failed to set password', err);
    }
    setShareInfo({ url, password });
  };

  useEffect(() => {
    const fetchGroups = async () => {
      setLoading(true);
      try {
        const base = collection(db, 'adGroups');
        let q = base;
        const conditions = [];
        if (!showArchived) conditions.push(where('status', 'not-in', ['archived']));
        // Managers should see all ad groups, so no brand filtering
        if (conditions.length > 0) q = query(base, ...conditions);
        const snap = await getDocs(q);
        const list = await Promise.all(
          snap.docs.map(async (d) => {
            const data = d.data();
            let recipeCount = 0;
            let assetCount = 0;
            let readyCount = 0;
            const set = new Set();
            try {
              const assetSnap = await getDocs(
                collection(db, 'adGroups', d.id, 'assets')
              );
              assetCount = assetSnap.docs.length;
              assetSnap.docs.forEach((adDoc) => {
                const adData = adDoc.data();
                if (adData.status === 'ready') readyCount += 1;
                const code =
                  adData.recipeCode || parseAdFilename(adData.filename || '').recipeCode;
                if (code) set.add(code);
              });
              recipeCount = set.size;
            } catch (err) {
              console.error('Failed to load assets', err);
              recipeCount = 0;
            }

            const designerName = data.designerId ? await getUserName(data.designerId) : '';

            return {
              id: d.id,
              ...data,
              recipeCount,
              assetCount,
              readyCount,
              counts: {
                approved: data.approvedCount || 0,
                rejected: data.rejectedCount || 0,
                edit: data.editCount || 0,
              },
              designerName,
            };
          })
        );
        setGroups(list);
      } catch (err) {
        console.error('Failed to fetch groups', err);
        setGroups([]);
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();
  }, [showArchived]);

  useEffect(() => {
    const fetchDesigners = async () => {
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'designer'));
        const snap = await getDocs(q);
        setDesigners(
          snap.docs.map((d) => ({
            id: d.id,
            name: d.data().fullName || d.data().email || d.id,
          }))
        );
      } catch (err) {
        console.error('Failed to fetch designers', err);
        setDesigners([]);
      }
    };
    fetchDesigners();
  }, []);

  const handleDeleteGroup = async (groupId, brandCode, groupName) => {
    if (!window.confirm('Delete this group?')) return;
    try {
      await deleteGroup(groupId, brandCode, groupName);
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
    } catch (err) {
      console.error('Failed to delete group', err);
    }
  };

  const handleArchiveGroup = async (groupId) => {
    if (!window.confirm('Archive this group?')) return;
    try {
      await updateDoc(doc(db, 'adGroups', groupId), {
        status: 'archived',
        archivedAt: serverTimestamp(),
        archivedBy: auth.currentUser?.uid || null,
      });
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, status: 'archived' } : g))
      );
      await createArchiveTicket({ target: 'adGroup', groupId });
    } catch (err) {
      console.error('Failed to archive group', err);
    }
  };

  const handleRestoreGroup = async (groupId) => {
    try {
      await updateDoc(doc(db, 'adGroups', groupId), {
        status: 'pending',
        archivedAt: null,
        archivedBy: null,
      });
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, status: 'pending' } : g))
      );
    } catch (err) {
      console.error('Failed to restore group', err);
    }
  };

  const startRename = (group) => {
    setRenameId(group.id);
    setRenameName(group.name || '');
  };

  const cancelRename = () => setRenameId(null);

  const handleRenameSave = async (groupId) => {
    const trimmed = renameName.trim();
    if (!trimmed) return;
    try {
      await updateDoc(doc(db, 'adGroups', groupId), { name: trimmed });
      setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name: trimmed } : g)));
      setRenameId(null);
    } catch (err) {
      console.error('Failed to rename group', err);
    }
  };

  const statusOrder = {
    pending: 1,
    briefed: 2,
    ready: 3,
    'review pending': 4,
    'in review': 4,
    reviewed: 5,
    archived: 6,
  };

  const kanbanColumns = [
    { label: 'Pending', statuses: ['pending'] },
    { label: 'Briefed', statuses: ['briefed'] },
    { label: 'Ready', statuses: ['ready'] },
    { label: 'In Review/Review Pending', statuses: ['in review', 'review pending'] },
    { label: 'Reviewed', statuses: ['reviewed'] },
  ];
  const term = filter.toLowerCase();
  const displayGroups = groups
    .filter(
      (g) =>
        !term ||
        g.name?.toLowerCase().includes(term) ||
        g.brandCode?.toLowerCase().includes(term),
    )
    .filter((g) => !designerFilter || g.designerId === designerFilter)
    .sort((a, b) => {
      if (sortField === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortField === 'brand') return (a.brandCode || '').localeCompare(b.brandCode || '');
      return (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
    });

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Admin Ad Groups</h1>

      <div className="mb-8">
        <h2 className="text-xl mb-2">All Ad Groups</h2>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <button
              onClick={() => setShowCreate(true)}
              className="btn-primary flex items-center gap-1"
            >
              <FiPlus />
              Create Ad Group
            </button>
            <div className="hidden sm:flex flex-1 justify-center gap-2 order-last md:order-none">
              <TabButton active={view === 'table'} onClick={() => setView('table')} aria-label="Table view">
                <FiList />
              </TabButton>
              <TabButton active={view === 'kanban'} onClick={() => setView('kanban')} aria-label="Kanban view">
                <FiColumns />
              </TabButton>
            </div>
            <div className="flex items-center gap-2">
              {view === 'kanban' ? (
                <select
                  value={designerFilter}
                  onChange={(e) => setDesignerFilter(e.target.value)}
                  className="p-1 border rounded"
                >
                  <option value="">All designers</option>
                  {designers.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              ) : (
                <>
                  <select
                    value={sortField}
                    onChange={(e) => setSortField(e.target.value)}
                    className="p-1 border rounded"
                  >
                    <option value="status">Status</option>
                    <option value="brand">Brand</option>
                    <option value="name">Group Name</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowArchived((p) => !p)}
                    aria-pressed={showArchived}
                    className="btn-secondary flex items-center gap-1 text-sm"
                  >
                    <FiArchive />
                    {showArchived ? 'Hide archived' : 'Show archived'}
                  </button>
                </>
              )}
              <input
                type="text"
                placeholder="Filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="p-1 border rounded"
              />
            </div>
          </div>
        {loading ? (
          <p>Loading groups...</p>
        ) : displayGroups.length === 0 ? (
          <p>No ad groups found.</p>
        ) : (
          <>
          <div className="sm:hidden space-y-4">
            {displayGroups.map((g) => (
              <AdGroupCard
                key={g.id}
                group={g}
                onShare={() => handleShare(g.id)}
                onArchive={() => handleArchiveGroup(g.id)}
                onRestore={() => handleRestoreGroup(g.id)}
                onDelete={isAdmin ? () => handleDeleteGroup(g.id, g.brandCode, g.name) : undefined}
              />
            ))}
          </div>
          {view === 'table' ? (
            <div className="hidden sm:block">
              <Table>
              <thead>
              <tr>
                <th>Group Name</th>
                <th>Brand</th>
                <th className="text-center"><FiGrid aria-label="Recipes" /></th>
                <th>Status</th>
                <th className="text-center"><FiThumbsUp aria-label="Approved" /></th>
                <th className="text-center"><FiThumbsDown aria-label="Rejected" /></th>
                <th className="text-center"><FiEdit aria-label="Edit Requested" /></th>
                <th>Designer</th>
                <th>Due Date</th>
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayGroups.map((g) => (
                <tr key={g.id}>
                  <td>
                    {renameId === g.id ? (
                      <input
                        type="text"
                        value={renameName}
                        onChange={(e) => setRenameName(e.target.value)}
                        className="w-full p-1 border rounded"
                      />
                    ) : (
                      g.name
                    )}
                  </td>
                  <td>{g.brandCode}</td>
                  <td className="text-center">{g.recipeCount}</td>
                  <td className="text-center">
                    <StatusBadge status={g.status} />
                  </td>
                  <td className="text-center text-approve">{g.counts.approved}</td>
                  <td className="text-center text-reject">{g.counts.rejected}</td>
                  <td className="text-center text-edit">{g.counts.edit}</td>
                  <td>{g.designerName || '-'}</td>
                  <td>
                    {g.dueDate
                      ? g.dueDate.toDate
                        ? g.dueDate.toDate().toLocaleDateString()
                        : new Date(g.dueDate).toLocaleDateString()
                      : '-'}
                  </td>
                  <td className="text-center">
                    {g.clientNote ? (
                      <button
                        onClick={() => setViewNote(g.clientNote)}
                        className="flex items-center text-gray-700 underline"
                        aria-label="View Client Note"
                      >
                        <FiFileText className="mr-1" />
                        View Note
                      </button>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="text-center">
                    <div className="relative flex items-center justify-center">
                      {renameId === g.id ? (
                        <>
                          <button
                            onClick={() => handleRenameSave(g.id)}
                            className="btn-action mr-2"
                          >
                            Save
                          </button>
                          <button onClick={cancelRename} className="btn-action">
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <IconButton
                            onClick={() =>
                              setMenuOpen(menuOpen === g.id ? null : g.id)
                            }
                            aria-label="Menu"
                          >
                            <FiMoreHorizontal />
                          </IconButton>
                          {menuOpen === g.id && (
                            <div className="absolute right-0 top-6 z-10 bg-white dark:bg-[var(--dark-sidebar-bg)] border border-gray-300 dark:border-gray-600 rounded shadow text-sm">
                              <Link
                                to={`/ad-group/${g.id}`}
                                onClick={() => setMenuOpen(null)}
                                className="block px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
                              >
                                <FiEye /> Details
                              </Link>
                              <Link
                                to={`/review/${g.id}`}
                                onClick={() => setMenuOpen(null)}
                                className="block px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
                              >
                                <FiCheckCircle /> Review
                              </Link>
                              <button
                                onClick={() => {
                                  setMenuOpen(null);
                                  handleShare(g.id);
                                }}
                                className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
                              >
                                <FiLink /> Share
                              </button>
                              <button
                                onClick={() => {
                                  setMenuOpen(null);
                                  startRename(g);
                                }}
                                className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
                              >
                                <FiEdit2 /> Rename
                              </button>
                              {g.status === 'archived' ? (
                                <button
                                  onClick={() => {
                                    setMenuOpen(null);
                                    handleRestoreGroup(g.id);
                                  }}
                                  disabled={!isAdmin && !isManager}
                                  className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
                                >
                                  <FiRotateCcw /> Restore
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    setMenuOpen(null);
                                    handleArchiveGroup(g.id);
                                  }}
                                  disabled={!isAdmin && !isManager}
                                  className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
                                >
                                  <FiArchive /> Archive
                                </button>
                              )}
                              {isAdmin && (
                                <button
                                  onClick={() => {
                                    setMenuOpen(null);
                                    handleDeleteGroup(g.id, g.brandCode, g.name);
                                  }}
                                  className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1 text-red-600"
                                >
                                  <FiTrash /> Delete
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
              </Table>
            </div>
          ) : (
            <div className="hidden sm:block overflow-x-auto mt-[0.8rem]">
              <div className="min-w-max flex gap-4">
                {kanbanColumns.map((col) => (
                  <div key={col.label} className="flex-shrink-0 w-[240px] sm:w-[320px]">
                    <h3 className="mb-2">{col.label}</h3>
                    <div
                      className="bg-[#F7F7F7] dark:bg-[var(--dark-bg)] border border-gray-300 dark:border-gray-600 rounded-t-[1rem] rounded-b-[1rem] flex flex-col items-center gap-4 p-[0.6rem] overflow-y-auto"
                      style={{ maxHeight: 'calc(100vh - 13rem)' }}
                    >
                      {displayGroups
                        .filter((g) => col.statuses.includes(g.status))
                        .map((g) => (
                          <AdGroupCard
                            key={g.id}
                            group={g}
                            onShare={() => handleShare(g.id)}
                            onArchive={() => handleArchiveGroup(g.id)}
                            onRestore={() => handleRestoreGroup(g.id)}
                            onDelete={isAdmin ? () => handleDeleteGroup(g.id, g.brandCode, g.name) : undefined}
                          />
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          </>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-4 rounded shadow max-w-md w-full dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)] overflow-y-auto max-h-[90vh]">
            <CreateAdGroup showSidebar={false} asModal={true} />
            <div className="text-right mt-2">
              <button onClick={() => setShowCreate(false)} className="btn-secondary px-3 py-1">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {viewNote && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-4 rounded shadow max-w-sm dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
            <p className="mb-4 whitespace-pre-wrap">{viewNote}</p>
            <button
              onClick={() => setViewNote(null)}
              className="btn-primary px-3 py-1"
            >
              Close
            </button>
          </div>
        </div>
      )}
      {shareInfo && (
        <ShareLinkModal
          url={shareInfo.url}
          password={shareInfo.password}
          onClose={() => setShareInfo(null)}
        />
      )}
    </div>
  );
};

export default AdminAdGroups;
