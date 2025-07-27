import React, { useEffect, useState } from 'react';
import { doc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import useUserRole from './useUserRole';
import generatePassword from './utils/generatePassword';
import ShareLinkModal from './components/ShareLinkModal.jsx';
import AdGroupListView from './components/AdGroupListView.jsx';
import useAdGroups from './useAdGroups';

const PmAdGroups = () => {
  const [showArchived, setShowArchived] = useState(false);
  const [filter, setFilter] = useState('');
  const [view, setView] = useState('kanban');
  const [shareInfo, setShareInfo] = useState(null);
  const [codes, setCodes] = useState([]);

  const user = auth.currentUser;
  const { agencyId, brandCodes: roleCodes } = useUserRole(user?.uid);

  useEffect(() => {
    const fetchCodes = async () => {
      if (agencyId) {
        const bSnap = await getDocs(
          query(collection(db, 'brands'), where('agencyId', '==', agencyId))
        );
        setCodes(bSnap.docs.map((d) => d.data().code).filter(Boolean));
      } else if (roleCodes && roleCodes.length > 0) {
        setCodes(roleCodes);
      } else {
        setCodes([]);
      }
    };
    fetchCodes();
  }, [agencyId, roleCodes]);

  const { groups, loading } = useAdGroups(codes, showArchived);

  const handleShare = async (id) => {
    let url = `${window.location.origin}/review/${id}`;
    const params = new URLSearchParams();
    if (user?.email) params.set('email', user.email);
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

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Ad Groups</h1>
      <AdGroupListView
        groups={groups}
        loading={loading}
        filter={filter}
        onFilterChange={setFilter}
        view={view}
        onViewChange={setView}
        showArchived={showArchived}
        onToggleArchived={() => setShowArchived((p) => !p)}
        onShare={handleShare}
      />
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

export default PmAdGroups;
