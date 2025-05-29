import React, { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { FiEye, FiCheckCircle, FiTrash, FiClock, FiLink } from 'react-icons/fi';
import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase/config';
import useUserRole from './useUserRole';
import deleteGroup from './utils/deleteGroup';

const AgencyAdGroups = () => {
  const agencyId = new URLSearchParams(useLocation().search).get('agencyId');
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const user = auth.currentUser;
  const { role } = useUserRole(user?.uid);

  const handleDeleteGroup = async (groupId, brandCode, groupName) => {
    if (!window.confirm('Delete this group?')) return;
    try {
      await deleteGroup(groupId, brandCode, groupName);
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
    } catch (err) {
      console.error('Failed to delete group', err);
    }
  };

  const copyLink = (id, agency) => {
    let url = `${window.location.origin}/review/${id}${agency ? `?agency=${agency}` : ''}`;
    const params = new URLSearchParams();
    if (user?.displayName) params.set('name', user.displayName);
    if (user?.email) params.set('email', user.email);
    if (role) params.set('role', role);
    const str = params.toString();
    if (str) url += (agency ? '&' : '?') + str;
    navigator.clipboard
      .writeText(url)
      .then(() => window.alert('Link copied to clipboard'))
      .catch((err) => console.error('Failed to copy link', err));
  };

  useEffect(() => {
    const fetchGroups = async () => {
      if (!agencyId) { setGroups([]); setLoading(false); return; }
      setLoading(true);
      try {
        const bSnap = await getDocs(query(collection(db, 'brands'), where('agencyId', '==', agencyId)));
        const codes = bSnap.docs.map((d) => d.data().code).filter(Boolean);
        if (codes.length === 0) { setGroups([]); setLoading(false); return; }
        const gSnap = await getDocs(query(collection(db, 'adGroups'), where('brandCode', 'in', codes)));
        const list = gSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setGroups(list);
      } catch (err) {
        console.error('Failed to fetch groups', err);
        setGroups([]);
      } finally {
        setLoading(false);
      }
    };
    fetchGroups();
  }, [agencyId]);

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Ad Groups</h1>
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
                      to={`/review/${g.id}${agencyId ? `?agency=${agencyId}` : ''}`}
                      className="flex items-center ml-2 text-blue-500 underline"
                      aria-label="Review"
                    >
                      <FiCheckCircle />
                      <span className="ml-1 text-[12px]">Review</span>
                    </Link>
                    <button
                      onClick={() => copyLink(g.id, agencyId)}
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
  );
};

export default AgencyAdGroups;
