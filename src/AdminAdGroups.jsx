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
  FiGrid,
} from 'react-icons/fi';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from './firebase/config';
import deleteGroup from './utils/deleteGroup';
import CreateAdGroup from './CreateAdGroup';
import { auth } from './firebase/config';
import useUserRole from './useUserRole';
import parseAdFilename from './utils/parseAdFilename';

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
        const list = await Promise.all(
          snap.docs.map(async (d) => {
            const data = d.data();
            let recipeCount = data.recipeCount;
            if (recipeCount === undefined) {
              try {
                const assetSnap = await getDocs(
                  collection(db, 'adGroups', d.id, 'assets')
                );
                const set = new Set();
                assetSnap.docs.forEach((adDoc) => {
                  const info = parseAdFilename(adDoc.data().filename || '');
                  if (info.recipeCode) set.add(info.recipeCode);
                });
                recipeCount = set.size;
              } catch (err) {
                console.error('Failed to load recipes', err);
                recipeCount = 0;
              }
            }
            return {
              id: d.id,
              ...data,
              recipeCount,
              counts: {
                approved: data.approvedCount || 0,
                rejected: data.rejectedCount || 0,
                edit: data.editCount || 0,
              },
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
          <table className="ad-table min-w-max text-[12px]">
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
              {groups.map((g) => (
                <tr key={g.id}>
                  <td>{g.name}</td>
                  <td>{g.brandCode}</td>
                  <td className="text-center">{g.recipeCount}</td>
                  <td className="text-center">
                    <span className={`status-badge status-${g.status}`}>{g.status}</span>
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
                      <Link
                        to={`/ad-group/${g.id}`}
                        className="btn-secondary px-2 py-0.5 flex items-center gap-1"
                        aria-label="View Details"
                      >
                        <FiEye />
                        <span className="text-[12px]">Details</span>
                      </Link>
                      <Link
                        to={`/review/${g.id}`}
                        className="btn-secondary px-2 py-0.5 flex items-center gap-1 ml-2"
                        aria-label="Review"
                      >
                        <FiCheckCircle />
                        <span className="text-[12px]">Review</span>
                      </Link>
                      <button
                        onClick={() => copyLink(g.id)}
                        className="btn-secondary px-2 py-0.5 flex items-center gap-1 ml-2"
                        aria-label="Share Link"
                      >
                        <FiLink />
                        <span className="text-[12px]">Share</span>
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(g.id, g.brandCode, g.name)}
                        className="btn-secondary px-2 py-0.5 flex items-center gap-1 ml-2 btn-delete"
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
    </div>
  );
};

export default AdminAdGroups;
