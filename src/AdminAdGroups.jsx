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
import { collection, getDocs, getDoc, query, where, doc, updateDoc, serverTimestamp, Timestamp, deleteField } from 'firebase/firestore';
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
import computeKanbanStatus from './utils/computeKanbanStatus';
import generatePassword from './utils/generatePassword';
import ShareLinkModal from './components/ShareLinkModal.jsx';
import StatusBadge from './components/StatusBadge.jsx';
import IconButton from './components/IconButton.jsx';
import SortButton from './components/SortButton.jsx';
import PageToolbar from './components/PageToolbar.jsx';
import CreateButton from './components/CreateButton.jsx';
import ScrollModal from './components/ScrollModal.jsx';
import CloseButton from './components/CloseButton.jsx';
import GalleryModal from './components/GalleryModal.jsx';

const AdminAdGroups = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewNote, setViewNote] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const user = auth.currentUser;
  const { role, brandCodes } = useUserRole(user?.uid);
  const isAdmin = role === 'admin';
  const isManager = role === 'manager' || role === 'editor';

  const [shareInfo, setShareInfo] = useState(null);
  const [renameId, setRenameId] = useState(null);
  const [renameName, setRenameName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('');
  const [sortField, setSortField] = useState('status');
  const [designers, setDesigners] = useState([]);
  const [designerFilter, setDesignerFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [view, setView] = useState('kanban');
  const [showGallery, setShowGallery] = useState(false);
  const [galleryAds, setGalleryAds] = useState([]);

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
            let approvedCount = 0;
            let archivedCount = 0;
            let rejectedCount = 0;
            let editCount = 0;
            const set = new Set();
            try {
              const assetSnap = await getDocs(
                collection(db, 'adGroups', d.id, 'assets')
              );
              assetCount = assetSnap.docs.length;
              assetSnap.docs.forEach((adDoc) => {
                const adData = adDoc.data();
                if (adData.status === 'ready') readyCount += 1;
                if (adData.status === 'approved') approvedCount += 1;
                if (adData.status === 'archived') archivedCount += 1;
                if (adData.status === 'rejected') rejectedCount += 1;
                if (adData.status === 'edit_requested') editCount += 1;
                const code =
                  adData.recipeCode || parseAdFilename(adData.filename || '').recipeCode;
                if (code) set.add(code);
              });
            } catch (err) {
              console.error('Failed to load assets', err);
            }
            try {
              const recipeSnap = await getDocs(
                collection(db, 'adGroups', d.id, 'recipes')
              );
              recipeCount =
                recipeSnap.docs.length > 0 ? recipeSnap.docs.length : set.size;
            } catch (err) {
              console.error('Failed to load recipes', err);
              recipeCount = set.size;
            }

            const designerName = data.designerId ? await getUserName(data.designerId) : '';
            const editorName = data.editorId ? await getUserName(data.editorId) : '';

            return {
              id: d.id,
              ...data,
              recipeCount,
              assetCount,
              readyCount,
              counts: {
                approved: approvedCount,
                archived: archivedCount,
                rejected: rejectedCount,
                edit: editCount,
              },
              designerName,
              editorName,
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
    if (!window.confirm('Delete this group? This cannot be undone.')) return;
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
      const group = groups.find((g) => g.id === groupId);
      await createArchiveTicket({ target: 'adGroup', groupId, brandCode: group?.brandCode });
    } catch (err) {
      console.error('Failed to archive group', err);
    }
  };

  const handleRestoreGroup = async (groupId) => {
    try {
      await updateDoc(doc(db, 'adGroups', groupId), {
        status: 'processing',
        archivedAt: null,
        archivedBy: null,
      });
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, status: 'processing' } : g))
      );
    } catch (err) {
      console.error('Failed to restore group', err);
    }
  };

  const handleGallery = async (id) => {
    try {
      const snap = await getDocs(collection(db, 'adGroups', id, 'assets'));
      setGalleryAds(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Failed to load assets', err);
      setGalleryAds([]);
    }
    setShowGallery(true);
  };

  const handleChangeMonth = async (group) => {
    const current = group.month || '';
    const value = window.prompt('Enter new month (YYYY-MM)', current);
    if (value === null) return;
    const trimmed = value.trim();
    try {
      if (trimmed) {
        await updateDoc(doc(db, 'adGroups', group.id), { month: trimmed });
        setGroups((prev) =>
          prev.map((g) => (g.id === group.id ? { ...g, month: trimmed } : g))
        );
        if (group.requestId) {
          try {
            await updateDoc(doc(db, 'requests', group.requestId), { month: trimmed });
          } catch (err) {
            console.error('Failed to sync ticket month', err);
          }
        }
      } else {
        await updateDoc(doc(db, 'adGroups', group.id), { month: deleteField() });
        setGroups((prev) =>
          prev.map((g) => {
            if (g.id !== group.id) return g;
            const u = { ...g };
            delete u.month;
            return u;
          })
        );
        if (group.requestId) {
          try {
            await updateDoc(doc(db, 'requests', group.requestId), { month: deleteField() });
          } catch (err) {
            console.error('Failed to sync ticket month', err);
          }
        }
      }
    } catch (err) {
      console.error('Failed to update month', err);
    }
  };

  const handleChangeDueDate = async (group) => {
    const current = group.dueDate
      ? (group.dueDate.toDate
          ? group.dueDate.toDate().toISOString().slice(0, 10)
          : new Date(group.dueDate).toISOString().slice(0, 10))
      : '';
    const value = window.prompt('Enter new due date (YYYY-MM-DD)', current);
    if (value === null) return;
    const date = value ? Timestamp.fromDate(new Date(value)) : null;
    try {
      await updateDoc(doc(db, 'adGroups', group.id), { dueDate: date });
      setGroups((prev) =>
        prev.map((g) => (g.id === group.id ? { ...g, dueDate: date } : g))
      );
      if (group.requestId) {
        try {
          await updateDoc(doc(db, 'requests', group.requestId), { dueDate: date });
        } catch (err) {
          console.error('Failed to sync ticket due date', err);
        }
      }
    } catch (err) {
      console.error('Failed to update due date', err);
    }
  };

  const handleChangeDesigner = async (group) => {
    const opts = designers.map((d) => `${d.id} (${d.name})`).join(', ');
    const value = window.prompt(`Enter designer ID (${opts})`, group.designerId || '');
    if (value === null) return;
    const trimmed = value.trim();
    const designerId = trimmed || null;
    try {
      await updateDoc(doc(db, 'adGroups', group.id), { designerId });
      setGroups((prev) =>
        prev.map((g) =>
          g.id === group.id
            ? {
                ...g,
                designerId,
                designerName:
                  designers.find((d) => d.id === designerId)?.name || '',
              }
            : g
        )
      );
    } catch (err) {
      console.error('Failed to update designer', err);
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

  const promptRename = async (group) => {
    const newName = window.prompt('New group name', group.name || '');
    if (!newName) return;
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      await updateDoc(doc(db, 'adGroups', group.id), { name: trimmed });
      setGroups((prev) => prev.map((g) => (g.id === group.id ? { ...g, name: trimmed } : g)));
    } catch (err) {
      console.error('Failed to rename group', err);
    }
  };

  const statusOrder = {
    blocked: 0,
    pending: 1,
    briefed: 2,
    ready: 3,
    'edit request': 4,
    done: 5,
    archived: 6,
  };

  const kanbanColumns = [
    { label: 'New', status: 'new' },
    { label: 'Blocked', status: 'blocked' },
    { label: 'Briefed', status: 'briefed' },
    { label: 'Designed', status: 'designed' },
    { label: 'Edit Request', status: 'edit request' },
    { label: 'Done', status: 'done' },
  ];
  const months = Array.from(new Set(groups.map((g) => g.month).filter(Boolean))).sort();
  const term = filter.toLowerCase();
  const displayGroups = groups
    .filter(
      (g) =>
        !term ||
        g.name?.toLowerCase().includes(term) ||
        g.brandCode?.toLowerCase().includes(term),
    )
    .filter((g) => !designerFilter || g.designerId === designerFilter)
    .filter((g) => !monthFilter || g.month === monthFilter)
    .sort((a, b) => {
      if (sortField === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortField === 'brand') return (a.brandCode || '').localeCompare(b.brandCode || '');
      return (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
    });

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Admin Ad Groups</h1>

      <div className="mb-8">
        <PageToolbar
          left={(
            <>
              <input
                type="text"
                placeholder="Filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="p-1 border rounded"
              />
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="p-1 border rounded"
              >
                <option value="">All months</option>
                {months.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
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
                  <SortButton
                    value={sortField}
                    onChange={setSortField}
                    options={[
                      { value: 'status', label: 'Status' },
                      { value: 'brand', label: 'Brand' },
                      { value: 'name', label: 'Group Name' },
                    ]}
                  />
                  <TabButton
                    type="button"
                    active={showArchived}
                    onClick={() => setShowArchived((p) => !p)}
                    aria-label={showArchived ? 'Hide archived' : 'Show archived'}
                  >
                    <FiArchive />
                  </TabButton>
                </>
              )}
              <div className="border-l h-6 mx-2" />
              <TabButton active={view === 'table'} onClick={() => setView('table')} aria-label="Table view">
                <FiList />
              </TabButton>
              <TabButton active={view === 'kanban'} onClick={() => setView('kanban')} aria-label="Kanban view">
                <FiColumns />
              </TabButton>
            </>
          )}
          right={<CreateButton onClick={() => setShowCreate(true)} ariaLabel="Create Ad Group" />}
        />
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
                onReview={() => (window.location.href = `/review/${g.id}`)}
                onShare={() => handleShare(g.id)}
                onRename={() => promptRename(g)}
                onGallery={() => handleGallery(g.id)}
                onChangeMonth={() => handleChangeMonth(g)}
                onChangeDueDate={() => handleChangeDueDate(g)}
                onChangeDesigner={() => handleChangeDesigner(g)}
                onArchive={
                  g.status !== 'archived' && (isAdmin || isManager)
                    ? () => handleArchiveGroup(g.id)
                    : undefined
                }
                onRestore={
                  g.status === 'archived' && (isAdmin || isManager)
                    ? () => handleRestoreGroup(g.id)
                    : undefined
                }
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
                    <div className="flex items-center justify-center">
                      {renameId === g.id ? (
                        <>
                          <button
                            onClick={() => handleRenameSave(g.id)}
                            className="btn-action mr-2"
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelRename}
                            className="btn-action"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <IconButton
                            as={Link}
                            to={`/ad-group/${g.id}`}
                            aria-label="View Details"
                            className="p-0"
                          >
                            <FiEye />
                          </IconButton>
                          <IconButton
                            as={Link}
                            to={`/review/${g.id}`}
                            className="ml-2 p-0"
                            aria-label="Review"
                          >
                            <FiCheckCircle />
                          </IconButton>
                          <IconButton
                            onClick={() => handleShare(g.id)}
                            className="ml-2 p-0"
                            aria-label="Share Link"
                          >
                            <FiLink />
                          </IconButton>
                          <IconButton
                            onClick={() => startRename(g)}
                            className="ml-2 p-0"
                            aria-label="Rename"
                          >
                            <FiEdit2 />
                          </IconButton>
                          {g.status === 'archived' ? (
                            <IconButton
                              onClick={() => handleRestoreGroup(g.id)}
                              className="ml-2 p-0"
                              aria-label="Restore"
                              disabled={!isAdmin && !isManager}
                            >
                              <FiRotateCcw />
                            </IconButton>
                          ) : (
                            <IconButton
                              onClick={() => handleArchiveGroup(g.id)}
                              className="ml-2 p-0"
                              aria-label="Archive"
                              disabled={!isAdmin && !isManager}
                            >
                              <FiArchive />
                            </IconButton>
                          )}
                          {isAdmin && (
                            <IconButton
                              onClick={() => handleDeleteGroup(g.id, g.brandCode, g.name)}
                              className="ml-2 p-0"
                              aria-label="Delete"
                            >
                              <FiTrash />
                            </IconButton>
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
                    <h2 className="text-xl mb-2 capitalize">{col.label}</h2>
                    <div
                      className="bg-[#F7F7F7] dark:bg-[var(--dark-bg)] border border-gray-300 dark:border-gray-600 rounded-t-[1rem] rounded-b-[1rem] flex flex-col items-center gap-4 p-[0.6rem] overflow-y-auto"
                      style={{ maxHeight: 'calc(100vh - 13rem)' }}
                    >
                      {displayGroups
                        .filter((g) => computeKanbanStatus(g) === col.status)
                        .map((g) => (
                          <AdGroupCard
                            key={g.id}
                            group={g}
                            onReview={() => (window.location.href = `/review/${g.id}`)}
                            onShare={() => handleShare(g.id)}
                            onRename={() => promptRename(g)}
                            onGallery={() => handleGallery(g.id)}
                            onChangeMonth={() => handleChangeMonth(g)}
                            onChangeDueDate={() => handleChangeDueDate(g)}
                            onChangeDesigner={() => handleChangeDesigner(g)}
                            onArchive={
                              g.status !== 'archived' && (isAdmin || isManager)
                                ? () => handleArchiveGroup(g.id)
                                : undefined
                            }
                            onRestore={
                              g.status === 'archived' && (isAdmin || isManager)
                                ? () => handleRestoreGroup(g.id)
                                : undefined
                            }
                            onDelete={
                              isAdmin
                                ? () => handleDeleteGroup(g.id, g.brandCode, g.name)
                                : undefined
                            }
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
        <ScrollModal
          sizeClass="max-w-[50rem] w-full"
          header={
            <div className="flex justify-end p-2">
              <CloseButton onClick={() => setShowCreate(false)} />
            </div>
          }
        >
          <CreateAdGroup showSidebar={false} asModal={true} />
        </ScrollModal>
      )}
      {viewNote && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-4 rounded-xl shadow max-w-sm dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
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
      {showGallery && (
        <GalleryModal ads={galleryAds} onClose={() => setShowGallery(false)} />
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
