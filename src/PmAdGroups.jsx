import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import useUserRole from './useUserRole';
import AdGroupListView from './components/AdGroupListView.jsx';
import GalleryModal from './components/GalleryModal.jsx';
import Modal from './components/Modal.jsx';
import CopyRecipePreview from './CopyRecipePreview.jsx';
import IconButton from './components/IconButton.jsx';
import useAdGroups from './useAdGroups';

const PmAdGroups = () => {
  const [showArchived, setShowArchived] = useState(false);
  const [filter, setFilter] = useState('');
  const [view, setView] = useState('kanban');
  const [codes, setCodes] = useState([]);
  const [showGallery, setShowGallery] = useState(false);
  const [galleryAds, setGalleryAds] = useState([]);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyCards, setCopyCards] = useState([]);

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

  const handleGallery = async (id) => {
    try {
      const snap = await getDocs(collection(db, 'adGroups', id, 'assets'));
      setGalleryAds(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Failed to load assets', err);
      setGalleryAds([]);
    }
    setShowGallery(true);
  };

  const handleCopy = async (id) => {
    try {
      const snap = await getDocs(collection(db, 'adGroups', id, 'copyCards'));
      setCopyCards(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Failed to load copy', err);
      setCopyCards([]);
    }
    setShowCopyModal(true);
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
      {showGallery && (
        <GalleryModal ads={galleryAds} onClose={() => setShowGallery(false)} />
      )}
      {showCopyModal && (
        <Modal sizeClass="max-w-[50rem] w-full max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Platform Copy</h2>
            <IconButton onClick={() => setShowCopyModal(false)}>Close</IconButton>
          </div>
          <div className="overflow-auto flex-1">
            <CopyRecipePreview
              initialResults={copyCards}
              showOnlyResults
              hideBrandSelect
            />
          </div>
        </Modal>
      )}
    </div>
  );
};

export default PmAdGroups;
