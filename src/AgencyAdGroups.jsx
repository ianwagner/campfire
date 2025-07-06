import React, { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  FiEye,
  FiTrash,
  FiLink,
} from 'react-icons/fi';
import {
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
} from 'firebase/firestore';
import { auth, db } from './firebase/config';
import useUserRole from './useUserRole';
import deleteGroup from './utils/deleteGroup';
import generatePassword from './utils/generatePassword';
import parseAdFilename from './utils/parseAdFilename';
import ShareLinkModal from './components/ShareLinkModal.jsx';
import StatusBadge from './components/StatusBadge.jsx';
import Table from './components/common/Table';
import AdGroupCard from './components/AdGroupCard.jsx';

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

  const [shareInfo, setShareInfo] = useState(null);

  const handleShare = async (id, agency) => {
    let url = `${window.location.origin}/review/${id}${agency ? `?agency=${agency}` : ''}`;
    const params = new URLSearchParams();
    if (user?.email) params.set('email', user.email);
    if (role) params.set('role', role);
    const str = params.toString();
    if (str) url += (agency ? '&' : '?') + str;

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
      if (!agencyId) {
        setGroups([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const bSnap = await getDocs(
          query(collection(db, 'brands'), where('agencyId', '==', agencyId))
        );
        const codes = bSnap.docs.map((d) => d.data().code).filter(Boolean);
        if (codes.length === 0) {
          setGroups([]);
          setLoading(false);
          return;
        }
        const gSnap = await getDocs(
          query(collection(db, 'adGroups'), where('brandCode', 'in', codes))
        );
        const list = await Promise.all(
          gSnap.docs.map(async (d) => {
            const data = d.data();
            let recipeCount = data.recipeCount;
            let assetCount = 0;
            let readyCount = 0;
            const set = new Set();
            try {
              const assetSnap = await getDocs(
                collection(db, 'adGroups', d.id, 'assets')
              );
              assetCount = assetSnap.docs.length;
              assetSnap.docs.forEach((adDoc) => {
                const adData = adDoc.data();
                if (adData.status === 'ready') readyCount += 1;
                if (recipeCount === undefined) {
                  const info = parseAdFilename(adData.filename || '');
                  if (info.recipeCode) set.add(info.recipeCode);
                }
              });
              if (recipeCount === undefined) recipeCount = set.size;
            } catch (err) {
              console.error('Failed to load assets', err);
              if (recipeCount === undefined) recipeCount = 0;
            }
            return {
              id: d.id,
              ...data,
              recipeCount,
              assetCount,
              readyCount,
              counts: {
                approved: data.approvedCount || 0,
                rejected: data.rejectedCount || 0,
                edit: data.editCount || 0,
              },
            };
          })
        );
        setGroups(list.filter((g) => g.status !== 'archived'));
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
        <>
          <div className="sm:hidden space-y-4">
            {groups.map((g) => (
              <AdGroupCard key={g.id} group={g} />
            ))}
          </div>
          <div className="hidden sm:block">
            <Table>
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
                      <StatusBadge status={g.status} />
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
                        <Link
                          to={`/review/${g.id}${agencyId ? `?agency=${agencyId}` : ''}`}
                          className="flex items-center ml-2 text-gray-700 underline"
                          aria-label="Review"
                        >
                          <FiCheckCircle />
                          <span className="ml-1 text-[14px]">Review</span>
                        </Link>
                        <button
                          onClick={() => handleShare(g.id, agencyId)}
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
            </Table>
          </div>
        </>
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

export default AgencyAdGroups;
