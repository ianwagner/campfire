import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase/config';
import useUserRole from './useUserRole';
import PageWrapper from './components/PageWrapper.jsx';
import FormField from './components/FormField.jsx';
import IconButton from './components/IconButton.jsx';
import SaveButton from './components/SaveButton.jsx';
import MonthSelector from './components/MonthSelector.jsx';
import { FiRefreshCw } from 'react-icons/fi';

const emptyContract = {
  startDate: '',
  endDate: '',
  stills: '',
  videos: '',
  renews: false,
};

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
                    startDate: c.startDate ? c.startDate.slice(0, 7) : '',
                    endDate: c.endDate ? c.endDate.slice(0, 7) : '',
                    stills: c.stills || '',
                    videos: c.videos || '',
                    renews: c.renews || false,
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
                    startDate: c.startDate ? c.startDate.slice(0, 7) : '',
                    endDate: c.endDate ? c.endDate.slice(0, 7) : '',
                    stills: c.stills || '',
                    videos: c.videos || '',
                    renews: c.renews || false,
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
      const normalized = contracts.map((c) => ({
        ...c,
        startDate: c.startDate ? c.startDate.slice(0, 7) : '',
        endDate: c.endDate ? c.endDate.slice(0, 7) : '',
      }));
      await setDoc(
        doc(db, 'brands', brandId),
        { contracts: normalized },
        { merge: true }
      );
      setContracts(normalized);
      setMessage('Contracts saved');
    } catch (err) {
      console.error('Failed to save contracts', err);
      setMessage('Failed to save contracts');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageWrapper>
      <form onSubmit={handleSave} className="space-y-4 max-w-md">
        {contracts.map((c, idx) => (
          <div key={idx} className="border p-2 rounded space-y-2">
            <FormField label="Start Month">
              <MonthSelector
                value={c.startDate}
                onChange={(value) => updateContract(idx, { startDate: value })}
                showButton={false}
                className="w-full"
                inputClassName="w-full p-2 border rounded"
              />
            </FormField>
            <FormField label="End Month (optional)">
              <MonthSelector
                value={c.endDate}
                onChange={(value) => updateContract(idx, { endDate: value })}
                showButton={false}
                className="w-full"
                inputClassName="w-full p-2 border rounded"
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
            <div className="flex items-center justify-between">
              <IconButton
                type="button"
                onClick={() =>
                  updateContract(idx, { renews: !c.renews })
                }
                aria-label="Toggle renews"
                title="Renews monthly"
              >
                <FiRefreshCw
                  className={c.renews ? 'text-green-600' : 'text-gray-600'}
                />
              </IconButton>
              <button
                type="button"
                onClick={() => removeContract(idx)}
                className="btn-action"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        <button type="button" onClick={addContract} className="btn-action">
          Add Contract
        </button>
        {message && <p className="text-sm">{message}</p>}
        <div className="text-right">
          <SaveButton type="submit" canSave={!loading} loading={loading} />
        </div>
      </form>
    </PageWrapper>
  );
};

export default BrandContracts;
