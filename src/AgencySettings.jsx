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
  const [messageType, setMessageType] = useState('success');
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
    setMessageType('success');
    try {
      await saveAgency({
        enableDescribeProject: describeEnabled,
        enableGenerateBrief: briefEnabled,
        allowedRecipeTypes: selectedTypes,
      });
      setMessage('Settings saved');
      setMessageType('success');
    } catch (err) {
      console.error('Failed to save agency settings', err);
      setMessage('Failed to save');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Feature Access</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Control which workflows and ad recipe types are available to agency members.
          </p>
        </div>
        <form onSubmit={handleSave} className="space-y-6" noValidate>
          <div className="space-y-4">
            <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm shadow-sm transition-colors hover:border-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-gray-300 text-[var(--accent-color)] focus:ring-[var(--accent-color)]"
                checked={describeEnabled}
                onChange={(e) => setDescribeEnabled(e.target.checked)}
              />
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">Enable "Describe Project" option</p>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  Allow agency users to submit project requests with the guided questionnaire.
                </p>
              </div>
            </label>
            <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm shadow-sm transition-colors hover:border-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-gray-300 text-[var(--accent-color)] focus:ring-[var(--accent-color)]"
                checked={briefEnabled}
                onChange={(e) => setBriefEnabled(e.target.checked)}
              />
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">Enable "Generate Brief" option</p>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  Surface AI-assisted creative briefs for eligible campaigns.
                </p>
              </div>
            </label>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Available Ad Recipes</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Choose which recipe templates appear when the agency starts a new request.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {recipeTypes.map((t) => (
                <label
                  key={t.id}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm transition-colors hover:border-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)]"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-[var(--accent-color)] focus:ring-[var(--accent-color)]"
                    checked={selectedTypes.includes(t.id)}
                    onChange={() => toggleType(t.id)}
                  />
                  {t.iconUrl && (
                    <OptimizedImage
                      pngUrl={t.iconUrl}
                      alt=""
                      className="h-6 w-6 object-contain"
                    />
                  )}
                  <span className="text-gray-700 dark:text-gray-200">{t.name || t.id}</span>
                </label>
              ))}
              {!recipeTypes.length && (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-center text-xs text-gray-500 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-400">
                  No external recipe types found.
                </div>
              )}
            </div>
          </div>
          {message && (
            <p
              className={`text-sm ${
                messageType === 'error'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-green-600 dark:text-green-400'
              }`}
              role="status"
            >
              {message}
            </p>
          )}
          <div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
};

export default AgencySettings;

