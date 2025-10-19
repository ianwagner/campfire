import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase/config';
import debugLog from './utils/debugLog';

const integrationsDocRef = doc(db, 'settings', 'exporterIntegrations');

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `integration-${Math.random().toString(36).slice(2, 11)}`;
};

const toIsoString = (value) => {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value.toDate === 'function') {
    try {
      const date = value.toDate();
      return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
    } catch (err) {
      return null;
    }
  }
  return null;
};

const normalizeFormats = (formats) => {
  if (!formats) {
    return [];
  }
  if (Array.isArray(formats)) {
    return formats
      .map((format) => (typeof format === 'string' ? format.trim() : ''))
      .filter(Boolean);
  }
  if (typeof formats === 'string') {
    return formats
      .split(',')
      .map((format) => format.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeIntegration = (integration) => {
  if (!integration || typeof integration !== 'object') {
    return null;
  }
  return {
    id: integration.id || generateId(),
    name: integration.name || '',
    partnerKey: integration.partnerKey || '',
    baseUrl: integration.baseUrl || '',
    apiKey: integration.apiKey || '',
    enabled: integration.enabled !== false,
    notes: integration.notes || '',
    supportedFormats: normalizeFormats(integration.supportedFormats),
    updatedAt: toIsoString(integration.updatedAt),
  };
};

const defaultState = {
  integrations: [],
  updatedAt: null,
};

const useExporterIntegrations = () => {
  const [integrations, setIntegrations] = useState(defaultState.integrations);
  const [updatedAt, setUpdatedAt] = useState(defaultState.updatedAt);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchIntegrations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      debugLog('Fetching exporter integrations');
      const snap = await getDoc(integrationsDocRef);
      if (snap.exists()) {
        const data = snap.data();
        const entries = Array.isArray(data?.integrations)
          ? data.integrations
              .map((integration) => normalizeIntegration(integration))
              .filter(Boolean)
          : [];
        setIntegrations(entries);
        setUpdatedAt(toIsoString(data?.updatedAt));
      } else {
        await setDoc(integrationsDocRef, defaultState, { merge: true });
        setIntegrations(defaultState.integrations);
        setUpdatedAt(defaultState.updatedAt);
      }
    } catch (err) {
      console.error('Failed to fetch exporter integrations', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const persistIntegrations = useCallback(
    async (nextIntegrations) => {
      try {
        await setDoc(
          integrationsDocRef,
          {
            integrations: nextIntegrations,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      } catch (err) {
        console.error('Failed to save exporter integrations', err);
        throw err;
      }
    },
    [],
  );

  const saveIntegration = useCallback(
    async (integration) => {
      const normalized = normalizeIntegration(integration);
      if (!normalized) {
        throw new Error('Integration payload is invalid');
      }
      const nowIso = new Date().toISOString();
      const existingIndex = integrations.findIndex((item) => item.id === normalized.id);
      const nextIntegrations = existingIndex === -1
        ? [
            ...integrations,
            { ...normalized, updatedAt: nowIso },
          ]
        : integrations.map((item, index) =>
            index === existingIndex ? { ...item, ...normalized, updatedAt: nowIso } : item,
          );

      await persistIntegrations(nextIntegrations);
      setIntegrations(nextIntegrations);
      setUpdatedAt(nowIso);
      return nextIntegrations.find((item) => item.id === normalized.id);
    },
    [integrations, persistIntegrations],
  );

  const deleteIntegration = useCallback(
    async (id) => {
      if (!id) {
        throw new Error('Integration ID is required');
      }
      const nextIntegrations = integrations.filter((integration) => integration.id !== id);
      await persistIntegrations(nextIntegrations);
      setIntegrations(nextIntegrations);
      setUpdatedAt(new Date().toISOString());
    },
    [integrations, persistIntegrations],
  );

  const state = useMemo(
    () => ({
      integrations,
      updatedAt,
      loading,
      error,
    }),
    [integrations, updatedAt, loading, error],
  );

  return {
    ...state,
    refresh: fetchIntegrations,
    saveIntegration,
    deleteIntegration,
  };
};

export default useExporterIntegrations;
