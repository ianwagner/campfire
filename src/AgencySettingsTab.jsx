import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import useAgencyTheme from './useAgencyTheme';
import { db } from './firebase/config';

const AgencySettingsTab = ({ agencyId }) => {
  const { agency, saveAgency } = useAgencyTheme(agencyId);
  const [describeProject, setDescribeProject] = useState(false);
  const [generateBrief, setGenerateBrief] = useState(false);
  const [recipes, setRecipes] = useState([]);
  const [enabledRecipes, setEnabledRecipes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setDescribeProject(!!agency.enableDescribeProject);
    setGenerateBrief(!!agency.enableGenerateBrief);
    setEnabledRecipes(
      Array.isArray(agency.enabledRecipeTypes) ? agency.enabledRecipeTypes : []
    );
  }, [agency]);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'recipeTypes'), where('external', '==', true))
        );
        setRecipes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Failed to load recipe types', err);
        setRecipes([]);
      }
    };
    load();
  }, []);

  const toggleRecipe = (id) => {
    setEnabledRecipes((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!agencyId) return;
    setLoading(true);
    setMessage('');
    try {
      await saveAgency({
        enableDescribeProject: describeProject,
        enableGenerateBrief: generateBrief,
        enabledRecipeTypes: enabledRecipes,
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
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div>
        <label className="block text-sm">
          <input
            type="checkbox"
            className="mr-2"
            checked={describeProject}
            onChange={(e) => setDescribeProject(e.target.checked)}
          />
          Enable Describe Project
        </label>
      </div>
      <div>
        <label className="block text-sm">
          <input
            type="checkbox"
            className="mr-2"
            checked={generateBrief}
            onChange={(e) => setGenerateBrief(e.target.checked)}
          />
          Enable Generate Brief
        </label>
      </div>
      <div>
        <p className="mb-1 text-sm font-medium">Available Ad Recipes</p>
        <div className="space-y-1">
          {recipes.map((r) => (
            <label key={r.id} className="block text-sm">
              <input
                type="checkbox"
                className="mr-2"
                checked={enabledRecipes.includes(r.id)}
                onChange={() => toggleRecipe(r.id)}
              />
              {r.name || r.id}
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

export default AgencySettingsTab;
