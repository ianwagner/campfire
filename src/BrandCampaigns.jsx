import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase/config';
import useUserRole from './useUserRole';
import FormField from './components/FormField.jsx';
import TagInput from './components/TagInput.jsx';
import SaveButton from './components/SaveButton.jsx';
import useUnsavedChanges from './useUnsavedChanges.js';

const emptyCampaign = { name: '', details: [] };

const inputClassName =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]';

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
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Campaign Playbook</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Capture evergreen campaign angles, launches, and nurture sequences that perform well for the brand.
            </p>
          </div>
          <SaveButton
            form="campaigns-form"
            type="submit"
            canSave={dirty && !loading}
            loading={loading}
          />
        </div>

        <form id="campaigns-form" onSubmit={handleSave} className="mt-6 space-y-5">
          {campaigns.map((c, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-gray-200 bg-white/80 p-5 shadow-sm transition hover:shadow-md dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]"
            >
              <div className="flex items-start justify-between gap-3">
                <FormField label="Campaign Name" className="flex-1">
                  <input
                    type="text"
                    value={c.name}
                    onChange={(e) => updateCampaign(idx, { name: e.target.value })}
                    className={inputClassName}
                    placeholder="Summer VIP launch"
                  />
                </FormField>
                <button
                  type="button"
                  onClick={() => removeCampaign(idx)}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
              <FormField label="Campaign Details" className="mt-4">
                <TagInput
                  value={c.details}
                  onChange={(arr) => updateCampaign(idx, { details: arr })}
                  placeholder="Add talking points, offer structure, channels…"
                />
              </FormField>
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={addCampaign}
              className="rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-[var(--accent-color)] hover:text-[var(--accent-color)]"
            >
              Add Campaign
            </button>
            {message && <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>}
          </div>
        </form>
      </section>
    </div>
  );
};

export default BrandCampaigns;
