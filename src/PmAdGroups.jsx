import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import useUserRole from './useUserRole';
import AdGroupListView from './components/AdGroupListView.jsx';
import useAdGroups from './useAdGroups';

const PmAdGroups = () => {
  const [showArchived, setShowArchived] = useState(false);
  const [filter, setFilter] = useState('');
  const [view, setView] = useState('kanban');
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

  const handleGallery = (id) => {
    window.location.href = `/review/${id}?view=gallery`;
  };

  const handleCopy = (id) => {
    window.location.href = `/review/${id}?view=copy`;
  };

  const handleDownload = (id) => {
    window.location.href = `/ad-group/${id}?exportApproved=1`;
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
        onGallery={handleGallery}
        onCopy={handleCopy}
        onDownload={handleDownload}
      />
    </div>
  );
};

export default PmAdGroups;
