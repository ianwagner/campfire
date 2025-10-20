import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase/config';
import debugLog from './utils/debugLog';
import { getCampfireStandardFields } from './integrationFieldDefinitions.js';

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

const CAMPFIRE_FIELD_HINTS = (() => {
  const hints = new Set();
  getCampfireStandardFields().forEach((field) => {
    if (field?.key) {
      hints.add(field.key);
    }
  });
  return hints;
})();

const isCampfireFieldCandidate = (value) => {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (CAMPFIRE_FIELD_HINTS.has(trimmed)) {
    return true;
  }
  if (trimmed.includes('.')) {
    return true;
  }
  if (/^image[_]?1x1(?:_[0-9]+)?$/i.test(trimmed)) {
    return true;
  }
  if (/^image[_]?9x16(?:_[0-9]+)?$/i.test(trimmed)) {
    return true;
  }
  if (/(Id|URL|Url|Code|Name|Number|Date)$/.test(trimmed)) {
    return true;
  }
  return false;
};

const normalizeFieldMapping = (mapping) => {
  if (!mapping || typeof mapping !== 'object') {
    return {};
  }

  const normalized = {};
  const entries = Object.entries(mapping)
    .map(([rawKey, rawValue]) => [
      typeof rawKey === 'string' ? rawKey.trim() : '',
      rawValue,
    ])
    .filter(([key]) => key);

  if (entries.length === 0) {
    return normalized;
  }

  const stringEntries = entries
    .filter(([, value]) => typeof value === 'string')
    .map(([key, value]) => ({
      key,
      value: value.trim(),
    }))
    .filter((entry) => entry.value);

  let keysAreCampfire = false;

  if (stringEntries.length > 0) {
    const keyCampfireMatches = stringEntries.filter(({ key }) => isCampfireFieldCandidate(key)).length;
    const valueCampfireMatches = stringEntries.filter(({ value }) => isCampfireFieldCandidate(value)).length;
    const hasKeyDot = stringEntries.some(({ key }) => key.includes('.'));
    const hasValueDot = stringEntries.some(({ value }) => value.includes('.'));

    if (hasKeyDot && !hasValueDot) {
      keysAreCampfire = true;
    } else if (hasValueDot && !hasKeyDot) {
      keysAreCampfire = false;
    } else if (valueCampfireMatches > keyCampfireMatches) {
      keysAreCampfire = false;
    } else if (keyCampfireMatches > 0) {
      keysAreCampfire = true;
    }
  }

  const assignEntry = (partnerField, sourceField, format) => {
    const partner = typeof partnerField === 'string' ? partnerField.trim() : '';
    const source = typeof sourceField === 'string' ? sourceField.trim() : '';
    const normalizedFormat = typeof format === 'string' ? format.trim() : '';
    if (!partner || !source) {
      return;
    }
    const entry = { source };
    if (normalizedFormat) {
      entry.format = normalizedFormat;
    }
    normalized[partner] = entry;
  };

  entries.forEach(([key, rawValue]) => {
    if (typeof rawValue === 'string') {
      const value = rawValue.trim();
      if (!value) {
        return;
      }
      if (keysAreCampfire) {
        assignEntry(value, key);
      } else {
        assignEntry(key, value);
      }
      return;
    }

    if (!rawValue || typeof rawValue !== 'object') {
      return;
    }

    const explicitSource =
      typeof rawValue.source === 'string' ? rawValue.source.trim() : '';
    const explicitPartner =
      typeof rawValue.target === 'string' ? rawValue.target.trim() : '';
    const partnerFallback =
      typeof rawValue.partner === 'string' ? rawValue.partner.trim() : '';
    const format =
      typeof rawValue.format === 'string' ? rawValue.format.trim() : '';

    if (explicitSource) {
      assignEntry(explicitPartner || partnerFallback || key, explicitSource, format);
      return;
    }

    const altSource =
      typeof rawValue.field === 'string'
        ? rawValue.field.trim()
        : typeof rawValue.campfire === 'string'
        ? rawValue.campfire.trim()
        : '';

    if (altSource) {
      assignEntry(explicitPartner || partnerFallback || key, altSource, format);
      return;
    }

    const altPartner =
      explicitPartner ||
      partnerFallback ||
      (typeof rawValue.partnerField === 'string'
        ? rawValue.partnerField.trim()
        : '');

    if (altPartner) {
      const inferredSource = keysAreCampfire ? key : '';
      assignEntry(altPartner, inferredSource || key, format);
      return;
    }

    if (keysAreCampfire) {
      const fallbackPartner =
        typeof rawValue.field === 'string'
          ? rawValue.field.trim()
          : typeof rawValue.targetField === 'string'
          ? rawValue.targetField.trim()
          : '';
      assignEntry(fallbackPartner || key, key, format);
    } else {
      const fallbackSource =
        typeof rawValue.field === 'string'
          ? rawValue.field.trim()
          : typeof rawValue.campfire === 'string'
          ? rawValue.campfire.trim()
          : '';
      assignEntry(key, fallbackSource || key, format);
    }
  });

  return normalized;
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
    recipeTypeId:
      typeof integration.recipeTypeId === 'string' ? integration.recipeTypeId.trim() : '',
    fieldMapping: normalizeFieldMapping(integration.fieldMapping),
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
