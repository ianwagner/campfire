import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import useExporterIntegrations from './useExporterIntegrations';
import Button from './components/Button.jsx';
import { db } from './firebase/config';

const STANDARD_FIELDS = [
  { key: 'shop', label: 'Shop / Brand ID', required: true },
  { key: 'group_desc', label: 'Group description', required: true },
  { key: 'recipe_no', label: 'Recipe number', required: true },
  { key: 'product', label: 'Product', required: true },
  { key: 'product_url', label: 'Product URL', required: true },
  { key: 'go_live_date', label: 'Go live date', required: true },
  { key: 'funnel', label: 'Funnel', required: true },
  { key: 'angle', label: 'Angle', required: true },
  { key: 'persona', label: 'Persona', required: true },
  { key: 'primary_text', label: 'Primary text', required: true },
  { key: 'headline', label: 'Headline', required: true },
  { key: 'image_1x1', label: '1×1 creative', required: true },
  { key: 'image_9x16', label: '9×16 creative', required: true },
  { key: 'moment', label: 'Moment', required: false },
  { key: 'description', label: 'Description', required: false },
  { key: 'status', label: 'Status', required: false },
];

const normalizeFieldEntry = (field) => {
  const key = typeof field?.key === 'string' ? field.key.trim() : '';
  const label = typeof field?.label === 'string' ? field.label.trim() : key;
  const required = !!field?.required;
  return key
    ? {
        key,
        label,
        required,
      }
    : null;
};

const parseNumeric = (value) => {
  if (value === undefined || value === null) {
    return NaN;
  }
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) {
    return asNumber;
  }
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const inferCarouselAssetCount = (recipeType) => {
  if (!recipeType || typeof recipeType !== 'object') {
    return 1;
  }

  const fields = Array.isArray(recipeType.writeInFields)
    ? recipeType.writeInFields
    : [];

  let inferredMax = 1;

  fields.forEach((field) => {
    const normalized = normalizeFieldEntry(field);
    if (!normalized) {
      return;
    }

    const match = normalized.key.match(/^image[_]?1x1_(\d+)$/i);
    if (match) {
      const index = parseNumeric(match[1]);
      if (Number.isFinite(index)) {
        inferredMax = Math.max(inferredMax, index);
      }
      return;
    }

    if (/^image[_]?1x1$/i.test(normalized.key)) {
      const numericHints = [
        parseNumeric(field?.maxItems),
        parseNumeric(field?.maxCount),
        parseNumeric(field?.limit),
        parseNumeric(field?.count),
        parseNumeric(field?.total),
        parseNumeric(field?.max),
        parseNumeric(field?.maxAssets),
        parseNumeric(field?.carouselLength),
      ];
      numericHints.forEach((hint) => {
        if (Number.isFinite(hint)) {
          inferredMax = Math.max(inferredMax, hint);
        }
      });
      if (field?.multiple || field?.allowMultiple || field?.enableCarousel) {
        inferredMax = Math.max(inferredMax, 2);
      }
    }
  });

  const topLevelHints = [
    parseNumeric(recipeType?.carouselAssetCount),
    parseNumeric(recipeType?.carouselImageCount),
    parseNumeric(recipeType?.squareAssetCount),
    parseNumeric(recipeType?.squareAssets),
    parseNumeric(recipeType?.assetCarouselLength),
    parseNumeric(recipeType?.carouselLength),
  ];

  topLevelHints.forEach((hint) => {
    if (Number.isFinite(hint)) {
      inferredMax = Math.max(inferredMax, hint);
    }
  });

  return Number.isFinite(inferredMax) && inferredMax > 0 ? inferredMax : 1;
};

const EMPTY_FORM = {
  id: '',
  name: '',
  partnerKey: '',
  baseUrl: '',
  apiKey: '',
  enabled: true,
  notes: '',
  supportedFormatsText: '',
  recipeTypeId: '',
  fieldMapping: {},
};

const createEmptyForm = () => ({ ...EMPTY_FORM, fieldMapping: {} });

const maskSecret = (value) => {
  if (!value) {
    return '—';
  }
  if (value.length <= 4) {
    return '•'.repeat(value.length);
  }
  const visible = value.slice(-4);
  const masked = '•'.repeat(Math.max(0, value.length - 4));
  return `${masked}${visible}`;
};

const formatDateTime = (value) => {
  if (!value) {
    return null;
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toLocaleString();
  } catch (err) {
    return null;
  }
};

const AdminIntegrations = () => {
  const {
    integrations,
    loading,
    error,
    saveIntegration,
    deleteIntegration,
  } = useExporterIntegrations();

  const [formState, setFormState] = useState(() => createEmptyForm());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [recipeTypes, setRecipeTypes] = useState([]);
  const [recipeTypesLoading, setRecipeTypesLoading] = useState(true);
  const [recipeTypesError, setRecipeTypesError] = useState('');
  const [customRecipeField, setCustomRecipeField] = useState('');
  const [customPartnerField, setCustomPartnerField] = useState('');
  const [customMappingError, setCustomMappingError] = useState('');

  useEffect(() => {
    let active = true;

    const fetchRecipeTypes = async () => {
      setRecipeTypesLoading(true);
      setRecipeTypesError('');
      try {
        const snap = await getDocs(collection(db, 'recipeTypes'));
        if (!active) {
          return;
        }
        setRecipeTypes(
          snap.docs.map((docSnap) => {
            const data = docSnap.data() || {};
            return {
              id: docSnap.id,
              name: data.name || docSnap.id,
              writeInFields: Array.isArray(data.writeInFields)
                ? data.writeInFields
                : [],
            };
          }),
        );
      } catch (err) {
        console.error('Failed to fetch recipe types', err);
        if (!active) {
          return;
        }
        setRecipeTypes([]);
        setRecipeTypesError('Failed to load recipe types.');
      } finally {
        if (active) {
          setRecipeTypesLoading(false);
        }
      }
    };

    fetchRecipeTypes();

    return () => {
      active = false;
    };
  }, []);

  const recipeTypeMap = useMemo(() => {
    const map = {};
    recipeTypes.forEach((type) => {
      if (type && type.id) {
        map[type.id] = type;
      }
    });
    return map;
  }, [recipeTypes]);

  const currentRecipeType = formState.recipeTypeId
    ? recipeTypeMap[formState.recipeTypeId]
    : null;

  const availableRecipeFields = useMemo(() => {
    const carouselSlots = inferCarouselAssetCount(currentRecipeType);
    const standardFields = STANDARD_FIELDS.flatMap((field) => {
      if (field.key === 'image_1x1') {
        if (carouselSlots <= 1) {
          return [field];
        }
        return Array.from({ length: carouselSlots }, (_, index) => ({
          key: `${field.key}_${index + 1}`,
          label: `${field.label} #${index + 1}`,
          required: index === 0 ? field.required : false,
        }));
      }
      return [field];
    });

    const writeInFields = Array.isArray(currentRecipeType?.writeInFields)
      ? currentRecipeType.writeInFields
      : [];

    const customFields = writeInFields
      .map((field) => normalizeFieldEntry(field))
      .filter(Boolean);

    const merged = new Map();

    const addField = (field) => {
      if (!field || !field.key) {
        return;
      }
      const existing = merged.get(field.key);
      if (existing) {
        merged.set(field.key, {
          key: existing.key,
          label: field.label || existing.label || field.key,
          required: existing.required || field.required,
        });
      } else {
        merged.set(field.key, {
          key: field.key,
          label: field.label || field.key,
          required: !!field.required,
        });
      }
    };

    standardFields.forEach(addField);
    customFields.forEach(addField);

    return Array.from(merged.values());
  }, [currentRecipeType]);

  const recipeSpecificFieldCount = useMemo(() => {
    if (!currentRecipeType) {
      return 0;
    }
    const fields = Array.isArray(currentRecipeType.writeInFields)
      ? currentRecipeType.writeInFields
      : [];
    return fields.map((field) => normalizeFieldEntry(field)).filter(Boolean).length;
  }, [currentRecipeType]);

  const availableRecipeFieldKeys = useMemo(() => {
    return new Set(availableRecipeFields.map((field) => field.key));
  }, [availableRecipeFields]);

  const customMappingEntries = useMemo(() => {
    const mappingEntries = Object.entries(formState.fieldMapping || {});
    return mappingEntries.filter(([recipeField]) => !availableRecipeFieldKeys.has(recipeField));
  }, [formState.fieldMapping, availableRecipeFieldKeys]);

  const sortedIntegrations = useMemo(() => {
    return [...integrations].sort((a, b) => a.name.localeCompare(b.name));
  }, [integrations]);

  const updateFieldMapping = (recipeField, partnerField) => {
    setFormState((prev) => {
      const nextMapping = { ...(prev.fieldMapping || {}) };
      const trimmedPartner =
        typeof partnerField === 'string' ? partnerField.trim() : '';
      if (!trimmedPartner) {
        delete nextMapping[recipeField];
      } else {
        nextMapping[recipeField] = partnerField;
      }
      return { ...prev, fieldMapping: nextMapping };
    });
  };

  const handleRemoveCustomMapping = (recipeField) => {
    setFormState((prev) => {
      const nextMapping = { ...(prev.fieldMapping || {}) };
      delete nextMapping[recipeField];
      return { ...prev, fieldMapping: nextMapping };
    });
    setCustomMappingError('');
  };

  const handleAddCustomMapping = () => {
    const recipeField = customRecipeField.trim();
    const partnerField = customPartnerField.trim();
    if (!recipeField || !partnerField) {
      setCustomMappingError('Recipe field and partner field are required.');
      return;
    }
    updateFieldMapping(recipeField, partnerField);
    setCustomRecipeField('');
    setCustomPartnerField('');
    setCustomMappingError('');
  };

  const resetForm = () => {
    setFormState(createEmptyForm());
    setEditingId(null);
    setShowApiKey(false);
    setValidationError('');
    setCustomRecipeField('');
    setCustomPartnerField('');
    setCustomMappingError('');
  };

  const startCreate = () => {
    setFormState(createEmptyForm());
    setEditingId('new');
    setShowApiKey(false);
    setMessage('');
    setValidationError('');
    setCustomRecipeField('');
    setCustomPartnerField('');
    setCustomMappingError('');
  };

  const startEdit = (integration) => {
    setFormState({
      id: integration.id,
      name: integration.name || '',
      partnerKey: integration.partnerKey || '',
      baseUrl: integration.baseUrl || '',
      apiKey: integration.apiKey || '',
      enabled: integration.enabled !== false,
      notes: integration.notes || '',
      supportedFormatsText: Array.isArray(integration.supportedFormats)
        ? integration.supportedFormats.join(', ')
        : '',
      recipeTypeId: integration.recipeTypeId || '',
      fieldMapping: { ...(integration.fieldMapping || {}) },
    });
    setEditingId(integration.id);
    setShowApiKey(false);
    setMessage('');
    setValidationError('');
    setCustomRecipeField('');
    setCustomPartnerField('');
    setCustomMappingError('');
  };

  const handleDelete = async (integration) => {
    const confirmed = window.confirm(
      `Delete the \"${integration.name || integration.partnerKey}\" integration?` +
        '\nThis cannot be undone.',
    );
    if (!confirmed) {
      return;
    }
    try {
      await deleteIntegration(integration.id);
      setMessage('Integration deleted');
      if (editingId === integration.id) {
        resetForm();
      }
    } catch (err) {
      console.error('Failed to delete integration', err);
      setMessage('Failed to delete integration');
    }
  };

  const handleChange = (field, value) => {
    if (field === 'recipeTypeId') {
      setFormState((prev) => ({
        ...prev,
        recipeTypeId: value,
        fieldMapping: {},
      }));
      setCustomRecipeField('');
      setCustomPartnerField('');
      setCustomMappingError('');
      return;
    }
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    setValidationError('');

    const trimmedName = formState.name.trim();
    const trimmedPartnerKey = formState.partnerKey.trim();
    const trimmedBaseUrl = formState.baseUrl.trim();

    if (!trimmedName) {
      setValidationError('Name is required.');
      return;
    }
    if (!trimmedPartnerKey) {
      setValidationError('Partner key is required.');
      return;
    }

    const supportedFormats = (formState.supportedFormatsText || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const payload = {
      id: formState.id || undefined,
      name: trimmedName,
      partnerKey: trimmedPartnerKey,
      baseUrl: trimmedBaseUrl,
      apiKey: formState.apiKey.trim(),
      enabled: !!formState.enabled,
      notes: formState.notes.trim(),
      supportedFormats,
      recipeTypeId: formState.recipeTypeId || '',
      fieldMapping: formState.fieldMapping || {},
    };

    setSaving(true);
    try {
      await saveIntegration(payload);
      setMessage('Integration saved');
      resetForm();
    } catch (err) {
      console.error('Failed to save integration', err);
      setMessage('Failed to save integration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Partner Integrations</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Configure the API connections used by exporter jobs. Enable integrations to make
          them available in the export flow.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
          Failed to load integrations. Please refresh the page.
        </div>
      )}
      {recipeTypesError && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {recipeTypesError} Field mapping options may be incomplete.
        </div>
      )}
      {message && (
        <div className="mb-4 rounded-md border border-[var(--accent-color)]/40 bg-[var(--accent-color)]/10 p-3 text-sm text-[var(--accent-color)]">
          {message}
        </div>
      )}

      <div className="mb-8 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Configured partners</h2>
        <Button
          type="button"
          variant="accent"
          size="sm"
          onClick={startCreate}
          disabled={loading}
        >
          Add integration
        </Button>
      </div>

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-card-bg)]">
          Loading integrations…
        </div>
      ) : (
        <div className="space-y-4">
          {sortedIntegrations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-card-bg)]">
              No integrations configured yet.
            </div>
          ) : (
            sortedIntegrations.map((integration) => {
              const lastUpdated = formatDateTime(integration.updatedAt);
              return (
                <div
                  key={integration.id}
                  className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:border-[var(--accent-color)]/60 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-card-bg)]"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {integration.name || 'Untitled integration'}
                        </h3>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                            integration.enabled
                              ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-200'
                              : 'bg-gray-200 text-gray-700 dark:bg-gray-600/30 dark:text-gray-300'
                          }`}
                        >
                          {integration.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Partner key: {integration.partnerKey || '—'}
                      </p>
                      {integration.baseUrl && (
                        <p className="mt-2 text-sm text-gray-600 break-all dark:text-gray-300">
                          Base URL: {integration.baseUrl}
                        </p>
                      )}
                      {integration.recipeTypeId && (
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                          Recipe type:{' '}
                          {recipeTypeMap[integration.recipeTypeId]?.name ||
                            integration.recipeTypeId}
                        </p>
                      )}
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                        API key: {maskSecret(integration.apiKey)}
                      </p>
                      {integration.supportedFormats?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {integration.supportedFormats.map((format) => (
                            <span
                              key={format}
                              className="inline-flex items-center rounded-full bg-[var(--accent-color)]/10 px-2.5 py-1 text-xs font-medium text-[var(--accent-color)]"
                            >
                              {format}
                            </span>
                          ))}
                        </div>
                      )}
                      {integration.notes && (
                        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                          {integration.notes}
                        </p>
                      )}
                      {lastUpdated && (
                        <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
                          Last updated {lastUpdated}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="neutral"
                        size="sm"
                        onClick={() => startEdit(integration)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="delete"
                        size="sm"
                        onClick={() => handleDelete(integration)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {(editingId || validationError) && (
        <form
          onSubmit={handleSubmit}
          className="mt-10 space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-card-bg)]"
        >
          <h2 className="text-lg font-semibold">
            {editingId === 'new' || !editingId ? 'Add integration' : 'Edit integration'}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col text-sm font-medium text-gray-700 dark:text-gray-200">
              Name
              <input
                type="text"
                className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-input-bg)] dark:text-white"
                value={formState.name}
                onChange={(event) => handleChange('name', event.target.value)}
                placeholder="e.g. Meta Marketing API"
                required
              />
            </label>
            <label className="flex flex-col text-sm font-medium text-gray-700 dark:text-gray-200">
              Partner key
              <input
                type="text"
                className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-input-bg)] dark:text-white"
                value={formState.partnerKey}
                onChange={(event) => handleChange('partnerKey', event.target.value)}
                placeholder="Internal identifier"
                required
              />
            </label>
            <label className="md:col-span-2 flex flex-col text-sm font-medium text-gray-700 dark:text-gray-200">
              Base URL
              <input
                type="url"
                className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-input-bg)] dark:text-white"
                value={formState.baseUrl}
                onChange={(event) => handleChange('baseUrl', event.target.value)}
                placeholder="https://api.partner.com"
              />
            </label>
            <label className="md:col-span-2 flex flex-col text-sm font-medium text-gray-700 dark:text-gray-200">
              Recipe type
              {recipeTypesLoading ? (
                <div className="mt-1 rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-input-bg)]/40 dark:text-gray-300">
                  Loading recipe types…
                </div>
              ) : (
                <select
                  className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-input-bg)] dark:text-white"
                  value={formState.recipeTypeId}
                  onChange={(event) => handleChange('recipeTypeId', event.target.value)}
                >
                  <option value="">Select a recipe type</option>
                  {recipeTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name || type.id}
                    </option>
                  ))}
                </select>
              )}
              <span className="mt-1 text-xs font-normal text-gray-500 dark:text-gray-400">
                Choose the recipe type this integration exports. Field mappings are based on the selected type.
              </span>
            </label>
            <label className="flex flex-col text-sm font-medium text-gray-700 dark:text-gray-200">
              API key
              <div className="mt-1 flex gap-2">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-input-bg)] dark:text-white"
                  value={formState.apiKey}
                  onChange={(event) => handleChange('apiKey', event.target.value)}
                  placeholder="Token or credential"
                />
                <Button
                  type="button"
                  variant="neutral"
                  size="sm"
                  onClick={() => setShowApiKey((value) => !value)}
                >
                  {showApiKey ? 'Hide' : 'Show'}
                </Button>
              </div>
            </label>
            <label className="flex flex-col text-sm font-medium text-gray-700 dark:text-gray-200">
              Supported export types
              <input
                type="text"
                className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-input-bg)] dark:text-white"
                value={formState.supportedFormatsText}
                onChange={(event) => handleChange('supportedFormatsText', event.target.value)}
                placeholder="Comma-separated list, e.g. ads, catalog"
              />
            </label>
            <div className="md:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Field mapping</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Mapping {availableRecipeFields.length} field
                  {availableRecipeFields.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="mt-2 rounded-md border border-gray-200 bg-white dark:border-[var(--border-color-default)] dark:bg-[var(--dark-card-bg)]">
                {availableRecipeFields.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-[var(--border-color-default)]">
                      <thead className="bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500 dark:bg-[var(--dark-input-bg)] dark:text-gray-400">
                        <tr>
                          <th className="px-3 py-2">Recipe field</th>
                          <th className="px-3 py-2">Partner field</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-[var(--border-color-default)]">
                        {availableRecipeFields.map((field) => (
                          <tr key={field.key}>
                            <td className="px-3 py-2 align-top text-sm text-gray-700 dark:text-gray-200">
                              <div className="font-medium">{field.label || field.key}</div>
                              <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                Key: {field.key}
                                {field.required ? ' • Required' : ''}
                              </div>
                            </td>
                            <td className="px-3 py-2 align-top">
                              <input
                                type="text"
                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-input-bg)] dark:text-white"
                                value={formState.fieldMapping?.[field.key] || ''}
                                onChange={(event) => updateFieldMapping(field.key, event.target.value)}
                                placeholder="Partner field name"
                              />
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                Leave blank to omit this field from the payload.
                              </p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
                    No fields available to map for the selected recipe.
                  </p>
                )}
                {!currentRecipeType && (
                  <div className="border-t border-gray-200 p-4 text-xs text-gray-500 dark:border-[var(--border-color-default)] dark:text-gray-400">
                    Select a recipe type to include recipe-specific fields in addition to the standard mapping options.
                  </div>
                )}
                {currentRecipeType && recipeSpecificFieldCount === 0 && (
                  <div className="border-t border-gray-200 p-4 text-xs text-gray-500 dark:border-[var(--border-color-default)] dark:text-gray-400">
                    This recipe type does not define any custom fields; only standard mapping options are available.
                  </div>
                )}
              </div>
              <div className="mt-4 rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-card-bg)]/60">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Custom field mappings</span>
                  {customMappingEntries.length > 0 && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {customMappingEntries.length} custom field{customMappingEntries.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                {customMappingEntries.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {customMappingEntries.map(([recipeField, partnerField]) => (
                      <li
                        key={recipeField}
                        className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-input-bg)]"
                      >
                        <div>
                          <div className="font-medium text-gray-800 dark:text-gray-100">{recipeField}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Partner field: {partnerField}</div>
                        </div>
                        <Button
                          type="button"
                          variant="neutral"
                          size="sm"
                          onClick={() => handleRemoveCustomMapping(recipeField)}
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                    Add mappings for additional recipe fields or static values that are not part of the recipe type definition.
                  </p>
                )}
                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr),minmax(0,1fr),auto]">
                  <input
                    type="text"
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-input-bg)] dark:text-white"
                    value={customRecipeField}
                    onChange={(event) => {
                      setCustomRecipeField(event.target.value);
                      setCustomMappingError('');
                    }}
                    placeholder="Recipe field key"
                  />
                  <input
                    type="text"
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-input-bg)] dark:text-white"
                    value={customPartnerField}
                    onChange={(event) => {
                      setCustomPartnerField(event.target.value);
                      setCustomMappingError('');
                    }}
                    placeholder="Partner field name"
                  />
                  <Button
                    type="button"
                    variant="accent"
                    size="sm"
                    onClick={handleAddCustomMapping}
                  >
                    Add field
                  </Button>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Custom fields are saved in addition to the recipe type mappings.
                </p>
                {customMappingError && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">{customMappingError}</p>
                )}
              </div>
            </div>
            <label className="md:col-span-2 flex items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-[var(--accent-color)] focus:ring-[var(--accent-color)]"
                checked={!!formState.enabled}
                onChange={(event) => handleChange('enabled', event.target.checked)}
              />
              Integration is enabled
            </label>
            <label className="md:col-span-2 flex flex-col text-sm font-medium text-gray-700 dark:text-gray-200">
              Notes
              <textarea
                className="mt-1 min-h-[96px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-input-bg)] dark:text-white"
                value={formState.notes}
                onChange={(event) => handleChange('notes', event.target.value)}
                placeholder="Optional runbooks, SLA information, or configuration notes."
              />
            </label>
          </div>

          {validationError && (
            <p className="text-sm text-red-600 dark:text-red-400">{validationError}</p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="accent" size="sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save integration'}
            </Button>
            <Button
              type="button"
              variant="neutral"
              size="sm"
              onClick={resetForm}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};

export default AdminIntegrations;
