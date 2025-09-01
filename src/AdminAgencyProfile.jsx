import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase/config';
import TabButton from './components/TabButton.jsx';
import AgencyThemeSettings from './AgencyThemeSettings.jsx';
import AgencySettingsTab from './AgencySettingsTab.jsx';

const AdminAgencyProfile = () => {
  const { id } = useParams();
  const [tab, setTab] = useState('theme');
  const [agencyName, setAgencyName] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      try {
        const snap = await getDoc(doc(db, 'agencies', id));
        if (snap.exists()) {
          setAgencyName(snap.data().name || '');
        }
      } catch (err) {
        console.error('Failed to load agency', err);
      }
    };
    load();
  }, [id]);

  return (
    <div className="min-h-screen p-4">
      <div className="flex items-center mb-2">
        <Link to="/admin/agencies" className="btn-arrow mr-2" aria-label="Back">
          &lt;
        </Link>
        <h1 className="text-2xl mb-0">{agencyName || 'Agency Profile'}</h1>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <TabButton active={tab === 'theme'} onClick={() => setTab('theme')}>
          Theme
        </TabButton>
        <TabButton active={tab === 'settings'} onClick={() => setTab('settings')}>
          Settings
        </TabButton>
      </div>
      {tab === 'theme' && <AgencyThemeSettings agencyId={id} />}
      {tab === 'settings' && <AgencySettingsTab agencyId={id} />}
    </div>
  );
};

export default AdminAgencyProfile;
