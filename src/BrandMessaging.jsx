import React, { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase/config';
import slackMessageConfig from '../lib/slackMessageConfig.json';

const MESSAGE_TYPES = slackMessageConfig.types || [];
const TYPE_IDS = MESSAGE_TYPES.map((type) => type.id);

const createEmptyForm = () => {
  const initial = {};
  TYPE_IDS.forEach((typeId) => {
    initial[typeId] = { internal: '', external: '' };
  });
  return initial;
};

const cloneFormState = (state) => {
  const clone = {};
  TYPE_IDS.forEach((typeId) => {
    const entry = state?.[typeId] || { internal: '', external: '' };
    clone[typeId] = {
      internal: entry.internal || '',
      external: entry.external || '',
    };
  });
  return clone;
};

const normalizeTagConfig = (value) => {
  const base = createEmptyForm();
  if (!value || typeof value !== 'object') {
    return base;
  }

  TYPE_IDS.forEach((typeId) => {
    const entry = value[typeId];
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const toLines = (list) => {
      if (Array.isArray(list)) {
        return list.filter((item) => typeof item === 'string' && item.trim()).join('\n');
      }
      if (typeof list === 'string') {
        return list;
      }
      return '';
    };
    base[typeId] = {
      internal: toLines(entry.internal),
      external: toLines(entry.external),
    };
  });

  return base;
};

const parseEmails = (value) => {
  if (!value) return [];
  return Array.from(
    new Set(
      String(value)
        .split(/[\n,]/)
        .map((part) => part.trim().toLowerCase())
        .filter((part) => part)
    )
  );
};

const buildSavePayload = (formState) => {
  const payload = {};
  TYPE_IDS.forEach((typeId) => {
    const entry = formState?.[typeId] || { internal: '', external: '' };
    payload[typeId] = {
      internal: parseEmails(entry.internal),
      external: parseEmails(entry.external),
    };
  });
  return payload;
};

const BrandMessaging = ({ brandId, brandCode, brandName, role }) => {
  const [formState, setFormState] = useState(() => createEmptyForm());
  const [initialState, setInitialState] = useState(() => createEmptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const canEdit = useMemo(() => ['admin', 'ops', 'client'].includes(role), [role]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!brandId) {
        if (active) {
          setFormState(createEmptyForm());
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setMessage('');
      setError('');
      try {
        const snap = await getDoc(doc(db, 'brands', brandId));
        if (!active) return;
        if (snap.exists()) {
          const data = snap.data() || {};
          const normalized = normalizeTagConfig(data.slackMessageTags);
          setFormState(cloneFormState(normalized));
          setInitialState(cloneFormState(normalized));
        } else {
          const empty = createEmptyForm();
          setFormState(cloneFormState(empty));
          setInitialState(cloneFormState(empty));
        }
      } catch (err) {
        console.error('Failed to load Slack tagging configuration', err);
        if (active) {
          setError('Failed to load Slack messaging settings for this brand.');
          const empty = createEmptyForm();
          setFormState(cloneFormState(empty));
          setInitialState(cloneFormState(empty));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [brandId]);

  const handleChange = (typeId, field) => (event) => {
    const value = event.target.value;
    setFormState((prev) => ({
      ...prev,
      [typeId]: {
        ...(prev?.[typeId] || { internal: '', external: '' }),
        [field]: value,
      },
    }));
  };

  const handleReset = () => {
    setFormState(cloneFormState(initialState));
    setMessage('');
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!brandId || !canEdit) return;

    setSaving(true);
    setMessage('');
    setError('');
    try {
      const payload = buildSavePayload(formState);
      await updateDoc(doc(db, 'brands', brandId), {
        slackMessageTags: payload,
      });
      setMessage('Slack tagging preferences saved');
      const normalized = normalizeTagConfig(payload);
      setFormState(cloneFormState(normalized));
      setInitialState(cloneFormState(normalized));
    } catch (err) {
      console.error('Failed to save Slack tagging preferences', err);
      setError('Failed to save Slack tagging preferences.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Slack mentions</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Choose who should be tagged when Campfire sends Slack updates for {brandName || brandCode || 'this brand'}.
          Add one email per line or separate addresses with commas.
        </p>
      </div>
      {loading ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">Loading current Slack tagging settings…</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {message && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200">
              {message}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
              {error}
            </div>
          )}
          <div className="space-y-5">
            {MESSAGE_TYPES.map((type) => {
              const values = formState?.[type.id] || { internal: '', external: '' };
              return (
                <section
                  key={type.id}
                  className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)]"
                >
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{type.label}</h3>
                    <p className="mt-1 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{type.id}</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Internal channels</label>
                      <textarea
                        rows={3}
                        className="w-full rounded-lg border border-gray-300 bg-white p-3 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-100"
                        value={values.internal}
                        onChange={handleChange(type.id, 'internal')}
                        placeholder="email@example.com"
                        disabled={!canEdit || saving}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Mentioned in Campfire internal Slack channels.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Client workspaces</label>
                      <textarea
                        rows={3}
                        className="w-full rounded-lg border border-gray-300 bg-white p-3 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-100"
                        value={values.external}
                        onChange={handleChange(type.id, 'external')}
                        placeholder="client@example.com"
                        disabled={!canEdit || saving}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Mentioned in connected client Slack channels.
                      </p>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-3">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save Slack mentions'}
              </button>
              <button type="button" className="btn-secondary" onClick={handleReset} disabled={saving}>
                Reset changes
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              You can review the current tagging configuration, but only admins, ops, or client users can make changes.
            </p>
          )}
        </form>
      )}
    </div>
  );
};

export default BrandMessaging;
