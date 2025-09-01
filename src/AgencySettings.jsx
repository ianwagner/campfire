import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase/config';
import useAgencyTheme from './useAgencyTheme';

const AgencySettings = ({ agencyId }) => {
  const { agency, saveAgency } = useAgencyTheme(agencyId);
  const [describeEnabled, setDescribeEnabled] = useState(true);
  const [briefEnabled, setBriefEnabled] = useState(true);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [allTypes, setAllTypes] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setDescribeEnabled(agency.enableDescribeProject !== false);
    setBriefEnabled(agency.enableGenerateBrief !== false);
    setSelectedTypes(Array.isArray(agency.recipeTypes) ? agency.recipeTypes : []);
  }, [agency]);

  useEffect(() => {
    const loadTypes = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'recipeTypes'), where('external', '==', true)));
        setAllTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Failed to load recipe types', err);
        setAllTypes([]);
      }
    };
    loadTypes();
  }, []);

  const toggleType = (id) => {
    setSelectedTypes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
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
        recipeTypes: selectedTypes,
      });
      setMessage('Settings saved');
    } catch (err) {
      console.error('Failed to save settings', err);
      setMessage('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-4 max-w-sm">
      <div>
        <label className="block text-sm">
          <input
            type="checkbox"
            className="mr-2"
            checked={describeEnabled}
            onChange={(e) => setDescribeEnabled(e.target.checked)}
          />
          Enable Describe Project
        </label>
      </div>
      <div>
        <label className="block text-sm">
          <input
            type="checkbox"
            className="mr-2"
            checked={briefEnabled}
            onChange={(e) => setBriefEnabled(e.target.checked)}
          />
          Enable Generate Brief
        </label>
      </div>
      <div>
        <p className="font-medium mb-1 text-sm">Available Ad Recipes</p>
        {allTypes.map((t) => (
          <label key={t.id} className="block text-sm">
            <input
              type="checkbox"
              className="mr-2"
              checked={selectedTypes.includes(t.id)}
              onChange={() => toggleType(t.id)}
            />
            {t.name || t.id}
          </label>
        ))}
      </div>
      {message && <p className="text-sm">{message}</p>}
      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? 'Saving...' : 'Save Settings'}
      </button>
    </form>
  );
};

export default AgencySettings;
