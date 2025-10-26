import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase/config';
import slackMessageTypes from '../lib/slackMessageTypes.json';

const MESSAGE_TYPES = Array.isArray(slackMessageTypes) ? slackMessageTypes : [];
const EXTERNAL_MESSAGE_TYPES = MESSAGE_TYPES.filter((type) =>
  Array.isArray(type.audiences) ? type.audiences.includes('external') : false,
);

const createEmptyState = () =>
  EXTERNAL_MESSAGE_TYPES.reduce((acc, type) => {
    acc[type.key] = '';
    return acc;
  }, {});

const formatEmailsForInput = (value) => {
  if (Array.isArray(value)) {
    return value.filter((email) => typeof email === 'string' && email.trim()).join('\n');
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value && Array.isArray(value.emails)) {
    return formatEmailsForInput(value.emails);
  }
  return '';
};

const parseEmails = (value) => {
  if (typeof value !== 'string') {
    return [];
  }
  const normalized = value.replace(/\r\n/g, '\n');
  const candidates = normalized
    .split(/[\n,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const unique = Array.from(new Set(candidates));
  return unique.filter((email) => /.+@.+\..+/.test(email));
};

const normalizeForComparison = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean)
    .join('\n');
};

const BrandSlackMentions = ({ brandId: propId = null, brandCode: propCode = '' }) => {
  const [resolvedBrandId, setResolvedBrandId] = useState(propId);
  const [resolvedBrandCode, setResolvedBrandCode] = useState(propCode);
  const [formValues, setFormValues] = useState(createEmptyState);
  const [initialValues, setInitialValues] = useState(createEmptyState);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadMentions = async () => {
      if (!propId && !propCode) {
        setResolvedBrandId(null);
        setResolvedBrandCode('');
        setFormValues(createEmptyState());
        setInitialValues(createEmptyState());
        return;
      }

      setLoading(true);
      setMessage('');
      setError('');

      try {
        let brandDoc = null;
        if (propId) {
          const snap = await getDoc(doc(db, 'brands', propId));
          if (snap.exists()) {
            brandDoc = snap;
          }
        }

        if (!brandDoc && propCode) {
          const cleanCode = propCode.trim();
          if (cleanCode) {
            const snap = await getDocs(
              query(collection(db, 'brands'), where('code', '==', cleanCode)),
            );
            if (!snap.empty) {
              brandDoc = snap.docs[0];
            }
          }
        }

        if (cancelled) return;

        if (brandDoc && brandDoc.exists()) {
          const data = brandDoc.data() || {};
          setResolvedBrandId(brandDoc.id);
          setResolvedBrandCode(data.code || propCode || '');
          const config = data.slackMentions || {};
          const nextValues = createEmptyState();
          EXTERNAL_MESSAGE_TYPES.forEach((type) => {
            if (Object.prototype.hasOwnProperty.call(config, type.key)) {
              nextValues[type.key] = formatEmailsForInput(config[type.key]);
            }
          });
          setFormValues(nextValues);
          setInitialValues(nextValues);
        } else {
          setResolvedBrandId(propId || null);
          setResolvedBrandCode(propCode || '');
          const empty = createEmptyState();
          setFormValues(empty);
          setInitialValues(empty);
        }
      } catch (err) {
        console.error('Failed to load Slack mention settings', err);
        if (!cancelled) {
          setError('Failed to load Slack mention settings');
          const empty = createEmptyState();
          setFormValues(empty);
          setInitialValues(empty);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadMentions();

    return () => {
      cancelled = true;
    };
  }, [propId, propCode]);

  const hasChanges = useMemo(() => {
    return EXTERNAL_MESSAGE_TYPES.some((type) => {
      return (
        normalizeForComparison(formValues[type.key]) !==
        normalizeForComparison(initialValues[type.key])
      );
    });
  }, [formValues, initialValues]);

  const handleChange = (key, value) => {
    setFormValues((prev) => ({
      ...prev,
      [key]: value,
    }));
    setMessage('');
    setError('');
  };

  const handleReset = () => {
    setFormValues(initialValues);
    setMessage('');
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!resolvedBrandId) {
      setError('Brand information is still loading.');
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    try {
      const payload = {};
      EXTERNAL_MESSAGE_TYPES.forEach((type) => {
        const emails = parseEmails(formValues[type.key]);
        payload[type.key] = emails;
      });

      await setDoc(
        doc(db, 'brands', resolvedBrandId),
        { slackMentions: payload },
        { merge: true },
      );

      const normalized = createEmptyState();
      EXTERNAL_MESSAGE_TYPES.forEach((type) => {
        normalized[type.key] = formatEmailsForInput(payload[type.key]);
      });

      setInitialValues(normalized);
      setFormValues(normalized);
      setMessage('Slack mention settings saved');
    } catch (err) {
      console.error('Failed to save Slack mention settings', err);
      setError('Failed to save Slack mention settings');
    } finally {
      setSaving(false);
    }
  };

  const infoMessage = error || message;
  const infoClassName = error
    ? 'border border-red-300 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200'
    : 'border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-100';

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Slack mentions
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Choose who should be tagged when Slack status messages send for this brand.
            Add email addresses separated by commas or new lines. We look up Slack
            users by email when notifications fire.
          </p>
          {resolvedBrandCode && (
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Brand code: {resolvedBrandCode}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleReset}
            disabled={saving || loading || !hasChanges}
          >
            Reset
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={saving || loading || !hasChanges || !resolvedBrandId}
          >
            {saving ? 'Saving...' : 'Save mentions'}
          </button>
        </div>
      </div>
      {infoMessage && (
        <div className={`rounded-lg px-3 py-2 text-sm ${infoClassName}`}>
          {infoMessage}
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        {EXTERNAL_MESSAGE_TYPES.map((type) => (
          <div key={type.key} className="space-y-2">
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
              {type.label}
            </label>
            {type.description && (
              <p className="text-sm text-gray-600 dark:text-gray-300">{type.description}</p>
            )}
            <textarea
              className="w-full rounded-lg border border-gray-200 bg-white p-3 text-sm leading-6 text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)] dark:text-gray-100"
              rows={3}
              value={formValues[type.key] || ''}
              onChange={(event) => handleChange(type.key, event.target.value)}
              disabled={loading || saving}
              placeholder="Email addresses separated by commas or new lines"
            />
          </div>
        ))}
      </div>
      {EXTERNAL_MESSAGE_TYPES.length === 0 && (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          No Slack message types are configured.
        </p>
      )}
    </form>
  );
};

export default BrandSlackMentions;
