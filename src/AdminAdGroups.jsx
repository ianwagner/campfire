import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiEye,
  FiCheckCircle,
  FiTrash,
  FiClock,
  FiLink,
  FiThumbsUp,
  FiThumbsDown,
  FiEdit,
  FiFileText,
} from 'react-icons/fi';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from './firebase/config';
import deleteGroup from './utils/deleteGroup';
import CreateAdGroup from './CreateAdGroup';
import { auth } from './firebase/config';
import useUserRole from './useUserRole';

const AdminAdGroups = () => {
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
        const q = query(collection(db, 'adGroups'));
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
        <h1 className="text-2xl mb-4">Admin Ad Groups</h1>

      <div className="mb-8">
        <h2 className="text-xl mb-2">All Ad Groups</h2>
        {loading ? (
          <p>Loading groups...</p>
        ) : groups.length === 0 ? (
          <p>No ad groups found.</p>
        ) : (
          <div className="overflow-x-auto table-container">
          <table className="ad-table min-w-max">
            <thead>
              <tr>
                <th>Group Name</th>
                <th>Brand</th>
                <th>Status</th>
                <th className="text-center"><FiThumbsUp aria-label="Approved" /></th>
                <th className="text-center"><FiThumbsDown aria-label="Rejected" /></th>
                <th className="text-center"><FiEdit aria-label="Edit Requested" /></th>
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
                      <button
                        onClick={() => setViewNote(g.clientNote)}
                        className="flex items-center text-blue-500 underline"
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
                      <Link
                        to={`/ad-group/${g.id}`}
                        className="flex items-center text-blue-500 underline"
                        aria-label="View Details"
                      >
                        <FiEye />
                        <span className="ml-1 text-[12px]">Details</span>
                      </Link>
                      <Link
                        to={`/review/${g.id}`}
                        className="flex items-center ml-2 text-blue-500 underline"
                        aria-label="Review"
                      >
                        <FiCheckCircle />
                        <span className="ml-1 text-[12px]">Review</span>
                      </Link>
                      <button
                        onClick={() => copyLink(g.id)}
                        className="flex items-center ml-2 text-blue-500 underline"
                        aria-label="Share Link"
                      >
                        <FiLink />
                        <span className="ml-1 text-[12px]">Share</span>
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(g.id, g.brandCode, g.name)}
                        className="flex items-center ml-2 underline btn-delete"
                        aria-label="Delete"
                      >
                        <FiTrash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <h2 className="text-xl mb-2">Administration Tools</h2>
      <p className="mb-8 text-sm text-gray-600">Additional admin features will appear here.</p>

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

export default AdminAdGroups;
