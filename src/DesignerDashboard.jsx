import React, { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { Link } from 'react-router-dom';
import {
  collection,
  getDocs,
  query,
  where,
  onSnapshot,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { auth, db } from './firebase/config';
import CreateAdGroup from './CreateAdGroup';

const DesignerDashboard = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  const handleDelete = async (groupId) => {
    try {
      await deleteDoc(doc(db, 'adGroups', groupId));
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
    } catch (err) {
      console.error('Failed to delete group', err);
    }
  };

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, 'adGroups'),
      where('uploadedBy', '==', auth.currentUser?.uid || '')
    );
    const unsub = onSnapshot(
      q,
      async (snap) => {
        const list = await Promise.all(
          snap.docs.map(async (d) => {
            let approved = 0;
            let rejected = 0;
            let edit = 0;
            const assetsSnap = await getDocs(
              collection(db, 'adGroups', d.id, 'assets')
            );
            assetsSnap.forEach((a) => {
              const status = a.data().status;
              if (status === 'approved') approved += 1;
              if (status === 'rejected') rejected += 1;
              if (status === 'edit') edit += 1;
            });
            return {
              id: d.id,
              ...d.data(),
              counts: { approved, rejected, edit },
            };
          })
        );
        setGroups(list);
        setLoading(false);
      },
      (err) => {
        console.error('Failed to fetch groups', err);
        setGroups([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  return (
    <div className="p-4">
      <div className="flex justify-between items-start">
        <h1 className="text-2xl mb-4">Designer Dashboard</h1>
        <button
          onClick={() => signOut(auth)}
          className="text-sm text-gray-500 hover:text-black underline mt-4"
        >
          Log Out
        </button>
      </div>

      <div className="mb-8">
        <h2 className="text-xl mb-2">My Ad Groups</h2>
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
                <th className="border px-2 py-1">Approved</th>
                <th className="border px-2 py-1">Rejected</th>
                <th className="border px-2 py-1">Edit</th>
                <th className="border px-2 py-1">Actions</th>
                <th className="border px-2 py-1">Delete</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td className="border px-2 py-1">{g.name}</td>
                  <td className="border px-2 py-1">{g.brandCode}</td>
                  <td className="border px-2 py-1">{g.status}</td>
                  <td className="border px-2 py-1 text-center">{g.counts.approved}</td>
                  <td className="border px-2 py-1 text-center">{g.counts.rejected}</td>
                  <td className="border px-2 py-1 text-center">{g.counts.edit}</td>
                  <td className="border px-2 py-1 text-center">
                    <Link
                      to={`/ad-group/${g.id}`}
                      className="text-blue-500 underline"
                    >
                      View Details
                    </Link>
                  </td>
                  <td className="border px-2 py-1 text-center">
                    <button
                      onClick={() => handleDelete(g.id)}
                      className="text-red-600 underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateAdGroup />
    </div>
  );
};

export default DesignerDashboard;
