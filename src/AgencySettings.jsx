import React, { useEffect, useMemo, useState } from 'react';
import useAgencyTheme from './useAgencyTheme';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from './firebase/config';
import OptimizedImage from './components/OptimizedImage.jsx';
import useIntegrations from './useIntegrations';

const AgencySettings = ({ agencyId }) => {
  const { agency, saveAgency } = useAgencyTheme(agencyId);
  const [describeEnabled, setDescribeEnabled] = useState(true);
  const [briefEnabled, setBriefEnabled] = useState(true);
  const [recipeTypes, setRecipeTypes] = useState([]);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [loading, setLoading] = useState(false);
  const [dailyCapacity, setDailyCapacity] = useState('');
  const [selectedIntegrationId, setSelectedIntegrationId] = useState('none');
  const { integrations, loading: integrationsLoading } = useIntegrations();

  const activeIntegrations = useMemo(
    () => integrations.filter((integration) => integration?.active),
    [integrations],
  );

  const normalizedSelection =
    selectedIntegrationId && selectedIntegrationId !== 'none'
      ? selectedIntegrationId
      : '';

  const selectedIntegration = useMemo(
    () =>
      normalizedSelection
        ? integrations.find((integration) => integration.id === normalizedSelection) || null
        : null,
    [integrations, normalizedSelection],
  );

  useEffect(() => {
    setDescribeEnabled(agency.enableDescribeProject !== false);
    setBriefEnabled(agency.enableGenerateBrief !== false);
    setSelectedTypes(Array.isArray(agency.allowedRecipeTypes) ? agency.allowedRecipeTypes : []);
    const defaultId =
      typeof agency.defaultIntegrationId === 'string'
        ? agency.defaultIntegrationId.trim()
        : '';
    setSelectedIntegrationId(defaultId || 'none');
    if (typeof agency.dailyAdCapacity === 'number' && Number.isFinite(agency.dailyAdCapacity)) {
      setDailyCapacity(String(Math.max(0, Math.round(agency.dailyAdCapacity))));
    } else {
      setDailyCapacity('');
    }
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
    const trimmedCapacity = dailyCapacity.trim();
    let capacityValue = null;
    if (trimmedCapacity) {
      const parsedCapacity = Number(trimmedCapacity);
      if (!Number.isFinite(parsedCapacity) || parsedCapacity < 0) {
        setMessage('Daily capacity must be a non-negative number.');
        setMessageType('error');
        setLoading(false);
        return;
      }
      capacityValue = Math.round(parsedCapacity);
    }
    const integrationId =
      selectedIntegrationId && selectedIntegrationId !== 'none'
        ? selectedIntegrationId
        : null;
    const integrationName = integrationId
      ? selectedIntegration?.name || agency.defaultIntegrationName || ''
      : '';
    try {
      await saveAgency({
        enableDescribeProject: describeEnabled,
        enableGenerateBrief: briefEnabled,
        allowedRecipeTypes: selectedTypes,
        defaultIntegrationId: integrationId,
        defaultIntegrationName: integrationName,
        dailyAdCapacity: capacityValue,
      });
      if (agencyId) {
        await applyIntegrationSelection(agencyId, integrationId, integrationName);
      }
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

  const applyIntegrationSelection = async (id, integrationId, integrationName) => {
    try {
      const brandSnap = await getDocs(
        query(collection(db, 'brands'), where('agencyId', '==', id)),
      );
      const processedCodes = new Set();
      for (const brandDoc of brandSnap.docs) {
        const brandData = brandDoc.data() || {};
        const brandCodeRaw = brandData.code || brandData.codeId || '';
        const brandCode = typeof brandCodeRaw === 'string' ? brandCodeRaw.trim() : '';
        const brandRef = doc(db, 'brands', brandDoc.id);
        await updateDoc(brandRef, {
          defaultIntegrationId: integrationId || null,
          defaultIntegrationName: integrationName || '',
        });
        if (!brandCode || processedCodes.has(brandCode)) {
          continue;
        }
        processedCodes.add(brandCode);
        const groupSnap = await getDocs(
          query(collection(db, 'adGroups'), where('brandCode', '==', brandCode)),
        );
        const updates = groupSnap.docs
          .map((groupDoc) => {
            const data = groupDoc.data() || {};
            const currentId =
              typeof data.assignedIntegrationId === 'string'
                ? data.assignedIntegrationId
                : data.assignedIntegrationId ?? null;
            const currentName =
              typeof data.assignedIntegrationName === 'string'
                ? data.assignedIntegrationName
                : '';
            const desiredId = integrationId || null;
            const desiredName = integrationName || '';
            if (currentId === desiredId && currentName === desiredName) {
              return null;
            }
            return updateDoc(doc(db, 'adGroups', groupDoc.id), {
              assignedIntegrationId: desiredId,
              assignedIntegrationName: desiredName,
            });
          })
          .filter(Boolean);
        if (updates.length) {
          await Promise.all(updates);
        }
      }
    } catch (err) {
      throw err;
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
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Daily capacity</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Set how many ad recipes the agency can request per day. The capacity planner highlights days that exceed this
                limit.
              </p>
            </div>
            <div className="max-w-xs space-y-1">
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                pattern="[0-9]*"
                className="w-full rounded border border-gray-300 bg-white px-2 py-2 text-sm text-gray-700 focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-200"
                value={dailyCapacity}
                onChange={(event) => setDailyCapacity(event.target.value)}
                placeholder="e.g. 20"
              />
              <p className="text-[0.7rem] text-gray-500 dark:text-gray-400">
                Leave blank if there is no defined daily capacity for this agency.
              </p>
            </div>
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
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Integration</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Select an integration to automatically apply it to all brands managed by this agency.
              </p>
            </div>
            <div className="max-w-xs">
              <select
                className="w-full rounded border border-gray-300 bg-white px-2 py-2 text-sm text-gray-700 focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-200"
                value={selectedIntegrationId}
                onChange={(event) => setSelectedIntegrationId(event.target.value)}
                disabled={loading || integrationsLoading}
                aria-label="Select integration"
              >
                <option value="none">None</option>
                {activeIntegrations.map((integration) => (
                  <option key={integration.id} value={integration.id}>
                    {integration.name || integration.id}
                  </option>
                ))}
                {normalizedSelection &&
                  !activeIntegrations.some((integration) => integration.id === normalizedSelection) && (
                    <option value={normalizedSelection}>
                      {selectedIntegration?.name || agency.defaultIntegrationName || normalizedSelection}
                    </option>
                  )}
              </select>
              {normalizedSelection && !selectedIntegration?.active && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  This integration is currently disabled.
                </p>
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

