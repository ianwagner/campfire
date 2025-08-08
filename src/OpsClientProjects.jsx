import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, orderBy, serverTimestamp } from 'firebase/firestore';
import { FiChevronDown, FiChevronRight } from 'react-icons/fi';
import { db, auth } from './firebase/config';
import useUserRole from './useUserRole';

const OpsClientProjects = () => {
  const { agencyId } = useUserRole(auth.currentUser?.uid);
  const [clients, setClients] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [projects, setProjects] = useState({});
  const [loading, setLoading] = useState(true);

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

  const toggle = async (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
    if (!projects[id]) {
      try {
        const q = query(
          collection(db, 'projects'),
          where('userId', '==', id),
          where('agencyId', '==', agencyId),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        setProjects((prev) => ({ ...prev, [id]: snap.docs.map((d) => ({ id: d.id, ...d.data() })) }));
      } catch (err) {
        console.error('Failed to fetch projects', err);
      }
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
                <ul className="px-4 pb-2 space-y-1">
                  {(projects[c.id] || []).length ? (
                    projects[c.id].map((p) => (
                      <li key={p.id} className="flex justify-between items-center">
                        <span>
                          {p.title} - {p.status}
                        </span>
                        <span className="space-x-2">
                          {p.status !== 'archived' && (
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
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-gray-500">No projects.</li>
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
