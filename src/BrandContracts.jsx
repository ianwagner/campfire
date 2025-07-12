import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase/config';
import useUserRole from './useUserRole';
import PageWrapper from './components/PageWrapper.jsx';
import FormField from './components/FormField.jsx';

const emptyContract = { startDate: '', endDate: '', stills: '', videos: '' };

const BrandContracts = ({ brandId: propId = null, brandCode: propCode = '' }) => {
  const user = auth.currentUser;
  const { brandCodes } = useUserRole(user?.uid);
  const [brandId, setBrandId] = useState(propId);
  const [brandCode, setBrandCode] = useState(propCode || brandCodes[0] || '');
  const [contracts, setContracts] = useState([{ ...emptyContract }]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!propId && !propCode) setBrandCode(brandCodes[0] || '');
  }, [brandCodes, propId, propCode]);

  useEffect(() => {
    const load = async () => {
      try {
        if (propId) {
          const snap = await getDoc(doc(db, 'brands', propId));
          if (snap.exists()) {
            setBrandId(propId);
            const data = snap.data();
            setBrandCode(data.code || propCode);
            setContracts(
              Array.isArray(data.contracts) && data.contracts.length
                ? data.contracts.map((c) => ({
                    startDate: c.startDate || '',
                    endDate: c.endDate || '',
                    stills: c.stills || '',
                    videos: c.videos || '',
                  }))
                : [{ ...emptyContract }]
            );
          }
        } else if (brandCode) {
          const q = query(collection(db, 'brands'), where('code', '==', brandCode));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const docData = snap.docs[0];
            setBrandId(docData.id);
            const data = docData.data();
            setBrandCode(data.code || brandCode);
            setContracts(
              Array.isArray(data.contracts) && data.contracts.length
                ? data.contracts.map((c) => ({
                    startDate: c.startDate || '',
                    endDate: c.endDate || '',
                    stills: c.stills || '',
                    videos: c.videos || '',
                  }))
                : [{ ...emptyContract }]
            );
          }
        }
      } catch (err) {
        console.error('Failed to load brand', err);
      }
    };
    load();
  }, [brandCode, propId, propCode]);

  const updateContract = (idx, changes) => {
    setContracts((prev) => prev.map((c, i) => (i === idx ? { ...c, ...changes } : c)));
  };

  const addContract = () => setContracts((p) => [...p, { ...emptyContract }]);
  const removeContract = (idx) => setContracts((p) => p.filter((_, i) => i !== idx));

  const handleSave = async (e) => {
    e.preventDefault();
    if (!brandId) return;
    setLoading(true);
    setMessage('');
    try {
      await setDoc(doc(db, 'brands', brandId), { contracts }, { merge: true });
      setMessage('Contracts saved');
    } catch (err) {
      console.error('Failed to save contracts', err);
      setMessage('Failed to save contracts');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageWrapper title="Contracts">
      <form onSubmit={handleSave} className="space-y-4 max-w-md">
        {contracts.map((c, idx) => (
          <div key={idx} className="border p-2 rounded space-y-2">
            <FormField label="Start Date">
              <input
                type="date"
                value={c.startDate}
                onChange={(e) => updateContract(idx, { startDate: e.target.value })}
                className="w-full p-2 border rounded"
              />
            </FormField>
            <FormField label="End Date (optional)">
              <input
                type="date"
                value={c.endDate}
                onChange={(e) => updateContract(idx, { endDate: e.target.value })}
                className="w-full p-2 border rounded"
              />
            </FormField>
            <FormField label="Number of Stills">
              <input
                type="number"
                min="0"
                value={c.stills}
                onChange={(e) => updateContract(idx, { stills: e.target.value })}
                className="w-full p-2 border rounded"
              />
            </FormField>
            <FormField label="Number of Videos">
              <input
                type="number"
                min="0"
                value={c.videos}
                onChange={(e) => updateContract(idx, { videos: e.target.value })}
                className="w-full p-2 border rounded"
              />
            </FormField>
            <button type="button" onClick={() => removeContract(idx)} className="btn-action">
              Delete
            </button>
          </div>
        ))}
        <button type="button" onClick={addContract} className="btn-action">
          Add Contract
        </button>
        {message && <p className="text-sm">{message}</p>}
        <div className="text-right">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Saving...' : 'Save Contracts'}
          </button>
        </div>
      </form>
    </PageWrapper>
  );
};

export default BrandContracts;
