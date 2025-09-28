import React, { useEffect, useState, useRef } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  orderBy,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { FiChevronDown, FiChevronRight, FiRefreshCw, FiArchive, FiTrash } from 'react-icons/fi';
import { db, auth } from './firebase/config';
import useUserRole from './useUserRole';
import useAgencies from './useAgencies';
import computeGroupStatus from './utils/computeGroupStatus';
import notifySlackStatusChange from './utils/notifySlackStatusChange';
import MonthTag from './components/MonthTag.jsx';
import IconButton from './components/IconButton.jsx';

const OpsClientProjects = () => {
  const { agencyId } = useUserRole(auth.currentUser?.uid);
  const { agencies } = useAgencies();
  const [agencyOverride, setAgencyOverride] = useState('');
  const activeAgencyId = agencyId || agencyOverride;
  const [clients, setClients] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [projects, setProjects] = useState({});
  const [projDocs, setProjDocs] = useState({});
  const [groups, setGroups] = useState({});
  const [requests, setRequests] = useState({});
  const [loading, setLoading] = useState(true);
  const projUnsubs = useRef({});
  const groupUnsubs = useRef({});
  const requestUnsubs = useRef({});

  useEffect(() => {
    if (!activeAgencyId) {
      setClients([]);
      return;
    }
    const fetchClients = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, 'users'),
          where('role', '==', 'client'),
          where('agencyId', '==', activeAgencyId)
        );
        const snap = await getDocs(q);
        setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Failed to fetch clients', err);
        setClients([]);
      } finally {
        setLoading(false);
      }
    };
    fetchClients();
  }, [activeAgencyId]);

  useEffect(() => {
    const merged = {};
    Object.keys(projDocs).forEach((cid) => {
      const projList = projDocs[cid] || [];
      const groupList = groups[cid] || [];
      const requestList = requests[cid] || [];
      const groupMap = {};
      groupList.forEach((g) => {
        groupMap[`${g.brandCode}|${g.name}`] = g;
      });
      const requestMap = {};
      requestList.forEach((r) => {
        requestMap[r.projectId] = r;
      });
      merged[cid] = projList.map((p) => ({
        ...p,
        group: groupMap[`${p.brandCode}|${p.title}`],
        request: requestMap[p.id],
      }));
    });
    setProjects(merged);
  }, [projDocs, groups, requests]);

  const toggle = (id) => {
    const willExpand = !expanded[id];
    setExpanded((prev) => ({ ...prev, [id]: willExpand }));

    if (willExpand) {
      if (!projUnsubs.current[id]) {
        const projQ = query(
          collection(db, 'projects'),
          where('userId', '==', id),
          where('agencyId', '==', activeAgencyId),
          orderBy('createdAt', 'desc')
        );
        projUnsubs.current[id] = onSnapshot(
          projQ,
          (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setProjDocs((prev) => ({ ...prev, [id]: list }));
          },
          (err) => console.error('Project listener failed', err)
        );
      }
      if (!groupUnsubs.current[id]) {
        const groupQ = query(
          collection(db, 'adGroups'),
          where('uploadedBy', '==', id)
        );
        groupUnsubs.current[id] = onSnapshot(
          groupQ,
          (snap) => {
            Promise.all(
              snap.docs.map(async (d) => {
                const data = d.data();
                let recipeCount = data.recipeCount;
                if (recipeCount == null) {
                  try {
                    const rSnap = await getDocs(
                      collection(db, 'adGroups', d.id, 'recipes')
                    );
                    recipeCount = rSnap.size;
                  } catch {
                    recipeCount = 0;
                  }
                }
                return { id: d.id, ...data, recipeCount };
              })
            ).then((list) => {
              setGroups((prev) => ({ ...prev, [id]: list }));
            });
          },
          (err) => console.error('Ad group listener failed', err)
        );
      }
      if (!requestUnsubs.current[id]) {
        const reqQ = query(
          collection(db, 'requests'),
          where('createdBy', '==', id)
        );
        requestUnsubs.current[id] = onSnapshot(
          reqQ,
          (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setRequests((prev) => ({ ...prev, [id]: list }));
          },
          (err) => console.error('Request listener failed', err)
        );
      }
    } else {
      if (projUnsubs.current[id]) {
        projUnsubs.current[id]();
        delete projUnsubs.current[id];
      }
      if (groupUnsubs.current[id]) {
        groupUnsubs.current[id]();
        delete groupUnsubs.current[id];
      }
      if (requestUnsubs.current[id]) {
        requestUnsubs.current[id]();
        delete requestUnsubs.current[id];
      }
      setProjDocs((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      setGroups((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      setRequests((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      setProjects((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    }
  };

  useEffect(() => {
    return () => {
      Object.values(projUnsubs.current).forEach((unsub) => unsub());
      Object.values(groupUnsubs.current).forEach((unsub) => unsub());
      Object.values(requestUnsubs.current).forEach((unsub) => unsub());
    };
  }, []);

  const handleRefresh = async (clientId, project) => {
    const groupId = project?.group?.id;
    if (!groupId) return;
    try {
      const [assetSnap, recipeSnap] = await Promise.all([
        getDocs(collection(db, 'adGroups', groupId, 'assets')),
        getDocs(collection(db, 'adGroups', groupId, 'recipes')),
      ]);
      const assets = assetSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const newStatus = computeGroupStatus(
        assets,
        !recipeSnap.empty,
        project?.group?.status === 'designed',
        project?.group?.status,
      );
      await Promise.all([
        updateDoc(doc(db, 'adGroups', groupId), { status: newStatus }),
        updateDoc(doc(db, 'projects', project.id), { status: newStatus }),
      ]);
      const detailUrl = (() => {
        if (typeof window === 'undefined') return undefined;
        const origin = window.location?.origin || '';
        const search = window.location?.search || '';
        if (!origin) return window.location?.href;
        return `${origin.replace(/\/$/, '')}/review/${groupId}${search}`;
      })();
      await notifySlackStatusChange({
        brandCode: project?.group?.brandCode || project?.brandCode || '',
        adGroupId: groupId,
        adGroupName: project?.group?.name || project?.title || '',
        status: newStatus,
        url: detailUrl,
      });
      setProjects((prev) => ({
        ...prev,
        [clientId]: prev[clientId].map((p) =>
          p.id === project.id
            ? {
                ...p,
                status: newStatus,
                group: p.group ? { ...p.group, status: newStatus } : p.group,
              }
            : p,
        ),
      }));
    } catch (err) {
      console.error('Failed to refresh project status', err);
    }
  };

  const handleArchive = async (clientId, projectId) => {
    try {
      await updateDoc(doc(db, 'projects', projectId), {
        status: 'archived',
        archivedAt: serverTimestamp(),
      });
      setProjects((prev) => ({
        ...prev,
        [clientId]: prev[clientId].map((p) =>
          p.id === projectId ? { ...p, status: 'archived', archivedAt: new Date() } : p
        ),
      }));
    } catch (err) {
      console.error('Failed to archive project', err);
    }
  };

  const handleDelete = async (clientId, projectId) => {
    if (!window.confirm('Delete this project?')) return;
    try {
      await deleteDoc(doc(db, 'projects', projectId));
      setProjects((prev) => ({
        ...prev,
        [clientId]: prev[clientId].filter((p) => p.id !== projectId),
      }));
    } catch (err) {
      console.error('Failed to delete project', err);
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl mb-4">Client Projects</h1>
      {!agencyId && (
        <div className="mb-4">
          <label htmlFor="agency-select" className="block mb-2">
            Agency
          </label>
          <select
            id="agency-select"
            className="border p-2 rounded"
            value={agencyOverride}
            onChange={(e) => setAgencyOverride(e.target.value)}
          >
            <option value="">Select agency</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name || a.id}
              </option>
            ))}
          </select>
        </div>
      )}
      {!activeAgencyId ? (
        <p>Select an agency to view projects.</p>
      ) : loading ? (
        <p>Loading...</p>
      ) : (
        <div className="space-y-2">
          {clients.map((c) => (
            <div key={c.id} className="border rounded">
              <button
                onClick={() => toggle(c.id)}
                className="w-full flex justify-between items-center p-2 text-left"
              >
                <span>{c.fullName || c.email || c.id}</span>
                {expanded[c.id] ? <FiChevronDown /> : <FiChevronRight />}
              </button>
              {expanded[c.id] && (
                <ul className="pb-2 divide-y divide-gray-200 dark:divide-gray-700">
                  {(projects[c.id] || []).length ? (
                    projects[c.id].map((p) => {
                      const status = p.group ? p.group.status : p.status;
                      const adCount = p.group ? p.group.recipeCount : p.request?.numAds;
                      const rawMonth = p.group?.month || p.month || p.request?.month;
                      const infoNote = p.request?.infoNote ?? p.infoNote;
                      return (
                        <li
                          key={p.id}
                          className="flex justify-between items-center px-4 py-2 hover:bg-accent-10"
                        >
                          <div className="flex items-center gap-2">
                            {p.brandCode && (
                              <span className="tag tag-pill bg-gray-200 text-gray-800">
                                {p.brandCode}
                              </span>
                            )}
                            <span>{p.title}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className="tag tag-pill bg-gray-200 text-gray-800 capitalize"
                              title={status === 'need info' && infoNote ? infoNote : undefined}
                            >
                              {status}
                            </span>
                            {adCount != null && (
                              <span className="tag tag-pill bg-gray-200 text-gray-800">
                                {adCount}
                              </span>
                            )}
                            {rawMonth && <MonthTag month={rawMonth} />}
                            <span className="flex items-center gap-2">
                              <IconButton
                                className="text-blue-600"
                                onClick={() => handleRefresh(c.id, p)}
                                aria-label="Refresh"
                              >
                                <FiRefreshCw />
                              </IconButton>
                              {status !== 'archived' && (
                                <IconButton
                                  className="text-blue-600"
                                  onClick={() => handleArchive(c.id, p.id)}
                                  aria-label="Archive"
                                >
                                  <FiArchive />
                                </IconButton>
                              )}
                              <IconButton
                                className="btn-delete"
                                onClick={() => handleDelete(c.id, p.id)}
                                aria-label="Delete"
                              >
                                <FiTrash />
                              </IconButton>
                            </span>
                          </div>
                        </li>
                      );
                    })
                  ) : (
                    <li className="text-sm text-gray-500 px-4 py-2">No projects.</li>
                  )}
                </ul>
              )}
            </div>
          ))}
          {!clients.length && <p>No clients found.</p>}
        </div>
      )}
    </div>
  );
};

export default OpsClientProjects;
