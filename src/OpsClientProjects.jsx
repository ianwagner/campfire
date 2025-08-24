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
import { FiChevronDown, FiChevronRight } from 'react-icons/fi';
import { db, auth } from './firebase/config';
import useUserRole from './useUserRole';
import computeGroupStatus from './utils/computeGroupStatus';

const OpsClientProjects = () => {
  const { agencyId } = useUserRole(auth.currentUser?.uid);
  const [clients, setClients] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [projects, setProjects] = useState({});
  const [projDocs, setProjDocs] = useState({});
  const [groups, setGroups] = useState({});
  const [loading, setLoading] = useState(true);
  const projUnsubs = useRef({});
  const groupUnsubs = useRef({});

  useEffect(() => {
    if (!agencyId) return;
    const fetchClients = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, 'users'),
          where('role', '==', 'client'),
          where('agencyId', '==', agencyId)
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
  }, [agencyId]);

  useEffect(() => {
    const merged = {};
    Object.keys(projDocs).forEach((cid) => {
      const projList = projDocs[cid] || [];
      const groupList = groups[cid] || [];
      const groupMap = {};
      groupList.forEach((g) => {
        groupMap[`${g.brandCode}|${g.name}`] = g;
      });
      merged[cid] = projList.map((p) => ({
        ...p,
        group: groupMap[`${p.brandCode}|${p.title}`],
      }));
    });
    setProjects(merged);
  }, [projDocs, groups]);

  const toggle = (id) => {
    const willExpand = !expanded[id];
    setExpanded((prev) => ({ ...prev, [id]: willExpand }));

    if (willExpand) {
      if (!projUnsubs.current[id]) {
        const projQ = query(
          collection(db, 'projects'),
          where('userId', '==', id),
          where('agencyId', '==', agencyId),
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
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setGroups((prev) => ({ ...prev, [id]: list }));
          },
          (err) => console.error('Ad group listener failed', err)
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
      const newStatus = computeGroupStatus(assets, !recipeSnap.empty, false);
      await Promise.all([
        updateDoc(doc(db, 'adGroups', groupId), { status: newStatus }),
        updateDoc(doc(db, 'projects', project.id), { status: newStatus }),
      ]);
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

  if (!agencyId) {
    return <p className="p-4">No agency assigned.</p>;
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl mb-4">Client Projects</h1>
      {loading ? (
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
                            <span className="tag tag-pill bg-gray-200 text-gray-800 capitalize">
                              {status}
                            </span>
                            <span className="space-x-2">
                              <button
                                className="text-sm text-blue-600"
                                onClick={() => handleRefresh(c.id, p)}
                              >
                                Refresh
                              </button>
                              {status !== 'archived' && (
                                <button
                                  className="text-sm text-blue-600"
                                  onClick={() => handleArchive(c.id, p.id)}
                                >
                                  Archive
                                </button>
                              )}
                              <button
                                className="text-sm text-red-600"
                                onClick={() => handleDelete(c.id, p.id)}
                              >
                                Delete
                              </button>
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
