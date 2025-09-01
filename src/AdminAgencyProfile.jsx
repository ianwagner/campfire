import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import TabButton from './components/TabButton.jsx';
import AgencyThemeSettings from './AgencyThemeSettings.jsx';
import AgencySettings from './AgencySettings.jsx';

const AdminAgencyProfile = () => {
  const { agencyId } = useParams();
  const [tab, setTab] = useState('theme');

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Agency Profile</h1>
      <div className="flex gap-2 mb-4">
        <TabButton active={tab === 'theme'} onClick={() => setTab('theme')}>
          Theme
        </TabButton>
        <TabButton active={tab === 'settings'} onClick={() => setTab('settings')}>
          Settings
        </TabButton>
      </div>
      {tab === 'theme' && <AgencyThemeSettings agencyId={agencyId} />}
      {tab === 'settings' && <AgencySettings agencyId={agencyId} />}
    </div>
  );
};

export default AdminAgencyProfile;
