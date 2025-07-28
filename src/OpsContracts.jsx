import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import useUserRole from './useUserRole';
import BrandCard from './components/BrandCard.jsx';

const OpsContracts = () => {
  const user = auth.currentUser;
  const { agencyId, brandCodes } = useUserRole(user?.uid);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBrands = async () => {
      if (!agencyId && (!brandCodes || brandCodes.length === 0)) {
        setBrands([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const base = collection(db, 'brands');
        const q = agencyId
          ? query(base, where('agencyId', '==', agencyId))
          : query(base, where('code', 'in', brandCodes));
        const snap = await getDocs(q);
        setBrands(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Failed to fetch brands', err);
        setBrands([]);
      } finally {
        setLoading(false);
      }
    };
    fetchBrands();
  }, [agencyId, brandCodes]);

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Contracts</h1>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {brands.map((b) => (
            <a key={b.id} href={`/ops/contracts/${b.id}`}>
              <BrandCard brand={b} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

export default OpsContracts;
