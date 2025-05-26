import React, { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase/config';
import useUserRole from './useUserRole';

const AgencyAdGroups = () => {
  const agencyId = new URLSearchParams(useLocation().search).get('agencyId');
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const user = auth.currentUser;
  const { role } = useUserRole(user?.uid);

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
        <table className="min-w-full border text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-2 py-1">Group Name</th>
              <th className="border px-2 py-1">Brand</th>
              <th className="border px-2 py-1">Status</th>
              <th className="border px-2 py-1">Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id}>
                <td className="border px-2 py-1">{g.name}</td>
                <td className="border px-2 py-1">{g.brandCode}</td>
                <td className="border px-2 py-1">{g.status}</td>
                <td className="border px-2 py-1 text-center">
                  <Link to={`/ad-group/${g.id}`} className="text-blue-500 underline">
                    View Details
                  </Link>
                  <Link
                    to={`/review/${g.id}${agencyId ? `?agency=${agencyId}` : ''}`}
                    className="ml-2 text-blue-500 underline"
                  >
                    Review
                  </Link>
                  <button
                    onClick={() => copyLink(g.id, agencyId)}
                    className="ml-2 text-blue-500 underline"
                  >
                    Share Link
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AgencyAdGroups;
