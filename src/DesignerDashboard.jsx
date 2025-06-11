import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiEye, FiTrash, FiClock, FiLink, FiThumbsUp, FiThumbsDown, FiEdit, FiFileText } from 'react-icons/fi';
import {
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
} from 'firebase/firestore';
import { auth, db } from './firebase/config';
import deleteGroup from './utils/deleteGroup';
import useUserRole from './useUserRole';
import generatePassword from './utils/generatePassword';
import ShareLinkModal from './components/ShareLinkModal.jsx';

const DesignerDashboard = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewNote, setViewNote] = useState(null);
  const user = auth.currentUser;
  const { role, brandCodes } = useUserRole(user?.uid);

  const [shareInfo, setShareInfo] = useState(null);

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
        let q;
        if (brandCodes && brandCodes.length > 0) {
          q = query(
            collection(db, 'adGroups'),
            where('brandCode', 'in', brandCodes)
          );
        } else {
          q = query(
            collection(db, 'adGroups'),
            where('uploadedBy', '==', auth.currentUser?.uid || ''),
            where('status', 'not-in', ['archived'])
          );
        }
        const snap = await getDocs(q);
        const list = snap.docs
          .map((d) => {
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
          })
          .filter((g) => g.status !== 'archived');
        setGroups(list);
      } catch (err) {
        console.error('Failed to fetch groups', err);
        setGroups([]);
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();
  }, [brandCodes]);

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
                        className="flex items-center text-gray-700 underline"
                        aria-label="View Details"
                      >
                        <FiEye />
                        <span className="ml-1 text-[14px]">Details</span>
                      </Link>
                      <button
                        onClick={() => handleShare(g.id)}
                        className="flex items-center ml-2 text-gray-700 underline"
                        aria-label="Share Link"
                      >
                        <FiLink />
                        <span className="ml-1 text-[14px]">Share</span>
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

export default DesignerDashboard;
