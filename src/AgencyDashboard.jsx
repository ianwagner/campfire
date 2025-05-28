import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase/config';
import OptimizedImage from './components/OptimizedImage';

function AgencyDashboard() {
  const [agency, setAgency] = useState(null);
  const agencyId = new URLSearchParams(useLocation().search).get('agencyId');

  useEffect(() => {
    async function fetchAgency() {
      if (!agencyId) return;
      const agencyRef = doc(db, 'agencies', agencyId);
      const agencySnap = await getDoc(agencyRef);
      if (agencySnap.exists()) setAgency(agencySnap.data());
    }
    fetchAgency();
  }, [agencyId]);

  return (
    <div className="p-4" style={{ color: agency?.themeColor }}>
      {agency && (
        <OptimizedImage
          webpUrl={agency.logoUrl}
          pngUrl={agency.logoUrl}
          alt={`${agency.name} logo`}
          className="mb-4 max-h-16 w-auto"
        />
      )}
      {/* Dashboard content here */}
    </div>
  );
}

export default AgencyDashboard;
