import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiEye,
  FiLink,
  FiList,
  FiColumns,
  FiFileText,
  FiCheckCircle,
} from 'react-icons/fi';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from './firebase/config';
import useUserRole from './useUserRole';
import parseAdFilename from './utils/parseAdFilename';
import getUserName from './utils/getUserName';
import generatePassword from './utils/generatePassword';
import computeKanbanStatus from './utils/computeKanbanStatus';
import ShareLinkModal from './components/ShareLinkModal.jsx';
import StatusBadge from './components/StatusBadge.jsx';
import Table from './components/common/Table';
import AdGroupCard from './components/AdGroupCard.jsx';
import TabButton from './components/TabButton.jsx';
import IconButton from './components/IconButton.jsx';

const EditorAdGroups = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewNote, setViewNote] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const user = auth.currentUser;
  const { brandCodes } = useUserRole(user?.uid);

  const [shareInfo, setShareInfo] = useState(null);
  const [filter, setFilter] = useState('');
  const [sortField, setSortField] = useState('status');
  const [designers, setDesigners] = useState([]);
  const [designerFilter, setDesignerFilter] = useState('');
  const [view, setView] = useState('kanban');

  const handleShare = async (id) => {
    let url = `${window.location.origin}/review/${id}`;
    const params = new URLSearchParams();
    if (user?.email) params.set('email', user.email);
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
      if (!brandCodes || brandCodes.length === 0) {
        setGroups([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const base = collection(db, 'adGroups');
        const chunks = [];
        for (let i = 0; i < brandCodes.length; i += 10) {
          chunks.push(brandCodes.slice(i, i + 10));
        }
        const docs = [];
        for (const chunk of chunks) {
          const q = query(base, where('brandCode', 'in', chunk));
          const snap = await getDocs(q);
          const docList = showArchived
            ? snap.docs
            : snap.docs.filter((d) => d.data()?.status !== 'archived');
          docs.push(...docList);
        }
        const seen = new Set();
        const list = await Promise.all(
          docs.filter((d) => {
              if (seen.has(d.id)) return false;
              seen.add(d.id);
              return true;
            })
            .map(async (d) => {
            const data = d.data();
            let recipeCount = 0;
            let assetCount = 0;
            let readyCount = 0;
            const set = new Set();
            try {
              const assetSnap = await getDocs(collection(db, 'adGroups', d.id, 'assets'));
              assetCount = assetSnap.docs.length;
              assetSnap.docs.forEach((adDoc) => {
                const adData = adDoc.data();
                if (adData.status === 'ready') readyCount += 1;
                const code = adData.recipeCode || parseAdFilename(adData.filename || '').recipeCode;
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
  }, [showArchived, brandCodes]);

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

  const statusOrder = {
    pending: 1,
    briefed: 2,
    ready: 3,
    'review pending': 4,
    'in review': 4,
    reviewed: 5,
    archived: 6,
  };
  const term = filter.toLowerCase();
  const displayGroups = groups
    .filter(
      (g) =>
        (!term ||
          g.name?.toLowerCase().includes(term) ||
          g.brandCode?.toLowerCase().includes(term))
    )
    .filter((g) => !designerFilter || g.designerId === designerFilter)
    .sort((a, b) => {
      if (sortField === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortField === 'brand') return (a.brandCode || '').localeCompare(b.brandCode || '');
      return (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
    });

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Ad Groups</h1>
      <div className="mb-8">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex flex-wrap gap-2 flex-1 order-last md:order-none justify-center">
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
                  <TabButton
                    type="button"
                    active={showArchived}
                    onClick={() => setShowArchived((p) => !p)}
                    aria-label={showArchived ? 'Hide archived' : 'Show archived'}
                  >
                    Archive
                  </TabButton>
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
                onReview={() => (window.location.href = `/review/${g.id}`)}
                onShare={() => handleShare(g.id)}
              />
            ))}
          </div>
          {view === 'table' ? (
            <div className="hidden sm:block overflow-x-auto mt-[0.8rem]">
              <Table>
                <thead>
                  <tr>
                    <th>Group Name</th>
                    <th>Brand</th>
                    <th className="text-center"><FiGrid aria-label="Recipes" /></th>
                    <th>Status</th>
                    <th className="text-center"><FiThumbsUp aria-label="Approved" /></th>
                    <th className="text-center"><FiThumbsDown aria-label="Rejected"/></th>
                    <th className="text-center"><FiEdit aria-label="Edit Requested"/></th>
                    <th>Note</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayGroups.map((g) => (
                    <tr key={g.id}>
                      <td>{g.name}</td>
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
                          <IconButton
                            as={Link}
                            to={`/ad-group/${g.id}`}
                            aria-label="View Details"
                          >
                            <FiEye />
                          </IconButton>
                          <IconButton
                            as={Link}
                            to={`/review/${g.id}`}
                            className="ml-2"
                            aria-label="Review"
                          >
                            <FiCheckCircle />
                          </IconButton>
                          <IconButton
                            onClick={() => handleShare(g.id)}
                            className="ml-2"
                            aria-label="Share Link"
                          >
                            <FiLink />
                          </IconButton>
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
                {[
                  { label: 'New', status: 'new' },
                  { label: 'Designed', status: 'designed' },
                  { label: 'Edit Request', status: 'edit request' },
                  { label: 'Done', status: 'done' },
                ].map((col) => (
                  <div key={col.status} className="flex-shrink-0 w-[240px] sm:w-[320px]">
                    <h3 className="mb-2">{col.label}</h3>
                    <div
                      className="bg-[#F7F7F7] dark:bg-[var(--dark-bg)] border border-gray-300 dark:border-gray-600 rounded-t-[1rem] rounded-b-[1rem] flex flex-col items-center gap-4 p-[0.6rem] overflow-y-auto"
                      style={{ maxHeight: 'calc(100vh - 13rem)' }}
                    >
                      {displayGroups
                        .filter((g) => computeKanbanStatus(g) === col.status)
                        .map((g) => (
                          <AdGroupCard key={g.id} group={g} />
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

export default EditorAdGroups;
