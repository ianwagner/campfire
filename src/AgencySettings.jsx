import React, { useEffect, useState } from 'react';
import useAgencyTheme from './useAgencyTheme';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase/config';
import OptimizedImage from './components/OptimizedImage.jsx';

const AgencySettings = ({ agencyId }) => {
  const { agency, saveAgency } = useAgencyTheme(agencyId);
  const [describeEnabled, setDescribeEnabled] = useState(true);
  const [briefEnabled, setBriefEnabled] = useState(true);
  const [recipeTypes, setRecipeTypes] = useState([]);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setDescribeEnabled(agency.enableDescribeProject !== false);
    setBriefEnabled(agency.enableGenerateBrief !== false);
    setSelectedTypes(Array.isArray(agency.allowedRecipeTypes) ? agency.allowedRecipeTypes : []);
  }, [agency]);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'recipeTypes'), where('external', '==', true))
        );
        setRecipeTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Failed to load recipe types', err);
        setRecipeTypes([]);
      }
    };
    load();
  }, []);

  const toggleType = (id) => {
    setSelectedTypes((arr) =>
      arr.includes(id) ? arr.filter((t) => t !== id) : [...arr, id]
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      await saveAgency({
        enableDescribeProject: describeEnabled,
        enableGenerateBrief: briefEnabled,
        allowedRecipeTypes: selectedTypes,
      });
      setMessage('Settings saved');
    } catch (err) {
      console.error('Failed to save agency settings', err);
      setMessage('Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-4 max-w-xl">
      <div>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={describeEnabled}
            onChange={(e) => setDescribeEnabled(e.target.checked)}
          />
          <span>Enable "Describe Project" option</span>
        </label>
      </div>
      <div>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={briefEnabled}
            onChange={(e) => setBriefEnabled(e.target.checked)}
          />
          <span>Enable "Generate Brief" option</span>
        </label>
      </div>
      <div>
        <p className="font-medium mb-2">Available Ad Recipes</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {recipeTypes.map((t) => (
            <label key={t.id} className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedTypes.includes(t.id)}
                onChange={() => toggleType(t.id)}
              />
              {t.iconUrl && (
                <OptimizedImage
                  pngUrl={t.iconUrl}
                  alt=""
                  className="w-6 h-6 object-contain"
                />
              )}
              <span>{t.name || t.id}</span>
            </label>
          ))}
        </div>
      </div>
      {message && <p className="text-sm">{message}</p>}
      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? 'Saving...' : 'Save Settings'}
      </button>
    </form>
  );
};

export default AgencySettings;

