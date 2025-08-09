import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase/config';
import useUserRole from './useUserRole';
import PageWrapper from './components/PageWrapper.jsx';
import FormField from './components/FormField.jsx';
import TagInput from './components/TagInput.jsx';
import SaveButton from './components/SaveButton.jsx';
import useUnsavedChanges from './useUnsavedChanges.js';

const emptyCampaign = { name: '', details: [] };

const BrandCampaigns = ({ brandId: propId = null, brandCode: propCode = '' }) => {
  const user = auth.currentUser;
  const { brandCodes } = useUserRole(user?.uid);
  const [brandId, setBrandId] = useState(propId);
  const [brandCode, setBrandCode] = useState(propCode || brandCodes[0] || '');
  const [campaigns, setCampaigns] = useState([{ ...emptyCampaign }]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);

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
            setCampaigns(
              Array.isArray(data.campaigns) && data.campaigns.length
                ? data.campaigns.map((c) => ({
                    name: c.name || '',
                    details: Array.isArray(c.details)
                      ? c.details
                      : typeof c.details === 'string'
                      ? c.details
                          .split(/[;\n]+/)
                          .map((d) => d.trim())
                          .filter(Boolean)
                      : [],
                  }))
                : [{ ...emptyCampaign }]
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
            setCampaigns(
              Array.isArray(data.campaigns) && data.campaigns.length
                ? data.campaigns.map((c) => ({
                    name: c.name || '',
                    details: Array.isArray(c.details)
                      ? c.details
                      : typeof c.details === 'string'
                      ? c.details
                          .split(/[;\n]+/)
                          .map((d) => d.trim())
                          .filter(Boolean)
                      : [],
                  }))
                : [{ ...emptyCampaign }]
            );
          }
        }
        setDirty(false);
      } catch (err) {
        console.error('Failed to load brand', err);
      }
    };
    load();
  }, [brandCode, propId, propCode]);

  const updateCampaign = (idx, changes) => {
    setCampaigns((prev) => prev.map((c, i) => (i === idx ? { ...c, ...changes } : c)));
    setDirty(true);
  };

  const addCampaign = () => {
    setCampaigns((p) => [...p, { ...emptyCampaign }]);
    setDirty(true);
  };
  const removeCampaign = (idx) => {
    setCampaigns((p) => p.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!brandId) return;
    setLoading(true);
    setMessage('');
    try {
      const campaignData = campaigns.map((c) => ({
        name: c.name.trim(),
        details: c.details.map((d) => d.trim()).filter(Boolean),
      }));
      await setDoc(doc(db, 'brands', brandId), { campaigns: campaignData }, { merge: true });
      setCampaigns(campaignData);
      setMessage('Campaigns saved');
      setDirty(false);
    } catch (err) {
      console.error('Failed to save campaigns', err);
      setMessage('Failed to save campaigns');
    } finally {
      setLoading(false);
    }
  };

  useUnsavedChanges(dirty, handleSave);

  return (
    <PageWrapper>
      <div className="flex justify-end mb-2">
        <SaveButton
          form="campaigns-form"
          type="submit"
          canSave={dirty && !loading}
          loading={loading}
        />
      </div>
      <form id="campaigns-form" onSubmit={handleSave} className="space-y-4 max-w-md">
        {campaigns.map((c, idx) => (
          <div key={idx} className="border p-2 rounded space-y-2">
            <FormField label="Campaign Name">
              <input
                type="text"
                value={c.name}
                onChange={(e) => updateCampaign(idx, { name: e.target.value })}
                className="w-full p-2 border rounded"
              />
            </FormField>
            <FormField label="Campaign Details">
              <TagInput
                value={c.details}
                onChange={(arr) => updateCampaign(idx, { details: arr })}
              />
            </FormField>
            <button type="button" onClick={() => removeCampaign(idx)} className="btn-action">
              Delete
            </button>
          </div>
        ))}
        <button type="button" onClick={addCampaign} className="btn-action">
          Add Campaign
        </button>
        {message && <p className="text-sm">{message}</p>}
      </form>
    </PageWrapper>
  );
};

export default BrandCampaigns;
