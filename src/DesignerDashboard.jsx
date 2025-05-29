import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiEye, FiShare2, FiTrash, FiClock } from 'react-icons/fi';
import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase/config';
import deleteGroup from './utils/deleteGroup';
import CreateAdGroup from './CreateAdGroup';
import useUserRole from './useUserRole';

const DesignerDashboard = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewNote, setViewNote] = useState(null);
  const user = auth.currentUser;
  const { role } = useUserRole(user?.uid);

  const copyLink = (id) => {
    let url = `${window.location.origin}/review/${id}`;
    const params = new URLSearchParams();
    if (user?.displayName) params.set('name', user.displayName);
    if (user?.email) params.set('email', user.email);
    if (role) params.set('role', role);
    const str = params.toString();
    if (str) url += `?${str}`;
    navigator.clipboard
      .writeText(url)
      .then(() => window.alert('Link copied to clipboard'))
      .catch((err) => console.error('Failed to copy link', err));
  };

  useEffect(() => {
    const fetchGroups = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, 'adGroups'),
          where('uploadedBy', '==', auth.currentUser?.uid || '')
        );
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            counts: {
              approved: data.approvedCount || 0,
              rejected: data.rejectedCount || 0,
              edit: data.editCount || 0,
            },
          };
        });
        setGroups(list);
      } catch (err) {
        console.error('Failed to fetch groups', err);
        setGroups([]);
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();
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

  return (
    <div className="min-h-screen p-4">
        <h1 className="text-2xl mb-4">Designer Dashboard</h1>

      <div className="mb-8">
        <h2 className="text-xl mb-2">My Ad Groups</h2>
        {loading ? (
          <p>Loading groups...</p>
        ) : groups.length === 0 ? (
          <p>No ad groups found.</p>
        ) : (
          <table className="ad-table">
            <thead>
              <tr>
                <th>Group Name</th>
                <th>Brand</th>
                <th>Status</th>
                <th>Approved</th>
                <th>Rejected</th>
                <th>Edit</th>
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td>{g.name}</td>
                  <td>{g.brandCode}</td>
                  <td>
                    <span className={`status-badge status-${g.status}`}>{g.status}</span>
                  </td>
                  <td className="text-center">{g.counts.approved}</td>
                  <td className="text-center">{g.counts.rejected}</td>
                  <td className="text-center">{g.counts.edit}</td>
                  <td className="text-center">
                    {g.clientNote ? (
                      <>
                        <span className="text-sm text-red-600 italic">Note left by client</span>
                        <button
                          onClick={() => setViewNote(g.clientNote)}
                          className="ml-2 text-blue-500 underline"
                        >
                          View Note
                        </button>
                      </>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="text-center">
                    <Link
                      to={`/ad-group/${g.id}`}
                      className="text-blue-500 underline"
                      aria-label="View Details"
                    >
                      <FiEye />
                    </Link>
                    <button
                      onClick={() => copyLink(g.id)}
                      className="ml-2 text-blue-500 underline"
                      aria-label="Share Link"
                    >
                      <FiShare2 />
                    </button>
                    <button
                      onClick={() => handleDeleteGroup(g.id, g.brandCode, g.name)}
                      className="ml-2 underline btn-delete"
                      aria-label="Delete"
                    >
                      <FiTrash />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateAdGroup showSidebar={false} />
      {viewNote && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-4 rounded shadow max-w-sm">
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
    </div>
  );
};

export default DesignerDashboard;
