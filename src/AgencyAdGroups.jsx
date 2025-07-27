import React, { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  FiEye,
  FiTrash,
  FiLink,
  FiCheckCircle,
} from 'react-icons/fi';
import {
  collection,
  getDocs,
  getDoc,
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
import getUserName from './utils/getUserName';
import ShareLinkModal from './components/ShareLinkModal.jsx';
import StatusBadge from './components/StatusBadge.jsx';
import Table from './components/common/Table';
import AdGroupCard from './components/AdGroupCard.jsx';
import IconButton from './components/IconButton.jsx';

const AgencyAdGroups = ({ agencyId: propAgencyId }) => {
  const paramsId = new URLSearchParams(useLocation().search).get('agencyId');
  const agencyId = propAgencyId || paramsId;
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
            let recipeCount = 0;
            let assetCount = 0;
            let readyCount = 0;
            let approvedCount = 0;
            let archivedCount = 0;
            let rejectedCount = 0;
            let editCount = 0;
            const set = new Set();
            try {
              const assetSnap = await getDocs(
                collection(db, 'adGroups', d.id, 'assets')
              );
              assetCount = assetSnap.docs.length;
              assetSnap.docs.forEach((adDoc) => {
                const adData = adDoc.data();
                if (adData.status === 'ready') readyCount += 1;
                if (adData.status === 'approved') approvedCount += 1;
                if (adData.status === 'archived') archivedCount += 1;
                if (adData.status === 'rejected') rejectedCount += 1;
                if (adData.status === 'edit_requested') editCount += 1;
                const code =
                  adData.recipeCode || parseAdFilename(adData.filename || '').recipeCode;
                if (code) set.add(code);
              });
              recipeCount = set.size;
            } catch (err) {
              console.error('Failed to load assets', err);
              recipeCount = 0;
            }

            const designerName = data.designerId ? await getUserName(data.designerId) : '';

            return {
              id: d.id,
              ...data,
              recipeCount,
              assetCount,
              readyCount,
              counts: {
                approved: approvedCount,
                archived: archivedCount,
                rejected: rejectedCount,
                edit: editCount,
              },
              designerName,
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
              <AdGroupCard
                key={g.id}
                group={g}
                onReview={() => (window.location.href = `/review/${g.id}${agencyId ? `?agency=${agencyId}` : ''}`)}
                onShare={() => handleShare(g.id, agencyId)}
                onDelete={() => handleDeleteGroup(g.id, g.brandCode, g.name)}
              />
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
                        <IconButton
                          as={Link}
                          to={`/ad-group/${g.id}`}
                          aria-label="View Details"
                        >
                          <FiEye />
                        </IconButton>
                        <IconButton
                          as={Link}
                          to={`/review/${g.id}${agencyId ? `?agency=${agencyId}` : ''}`}
                          className="ml-2"
                          aria-label="Review"
                        >
                          <FiCheckCircle />
                        </IconButton>
                        <IconButton
                          onClick={() => handleShare(g.id, agencyId)}
                          className="ml-2"
                          aria-label="Share Link"
                        >
                          <FiLink />
                        </IconButton>
                        <IconButton
                          onClick={() => handleDeleteGroup(g.id, g.brandCode, g.name)}
                          className="ml-2 btn-delete"
                          aria-label="Delete"
                        >
                          <FiTrash />
                        </IconButton>
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
