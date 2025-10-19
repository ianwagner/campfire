import React, { useMemo, useState } from 'react';
import useExporterIntegrations from './useExporterIntegrations';
import Button from './components/Button.jsx';

const EMPTY_FORM = {
  id: '',
  name: '',
  partnerKey: '',
  baseUrl: '',
  apiKey: '',
  enabled: true,
  notes: '',
  supportedFormatsText: '',
};

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

  const [formState, setFormState] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [validationError, setValidationError] = useState('');

  const sortedIntegrations = useMemo(() => {
    return [...integrations].sort((a, b) => a.name.localeCompare(b.name));
  }, [integrations]);

  const resetForm = () => {
    setFormState(EMPTY_FORM);
    setEditingId(null);
    setShowApiKey(false);
    setValidationError('');
  };

  const startCreate = () => {
    setFormState(EMPTY_FORM);
    setEditingId('new');
    setShowApiKey(false);
    setMessage('');
    setValidationError('');
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
    });
    setEditingId(integration.id);
    setShowApiKey(false);
    setMessage('');
    setValidationError('');
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
