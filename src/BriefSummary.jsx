import React from 'react';
import { formatDateTime } from './monthlyBriefCopy.js';

const formatDeadline = (value, locale = 'en-US') => {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      // Handle YYYY-MM-DD strings by constructing a date in local time
      const parts = value.split('-');
      if (parts.length === 3) {
        const [y, m, d] = parts.map((p) => Number(p));
        if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
          const alt = new Date(y, m - 1, d);
          if (!Number.isNaN(alt.getTime())) {
            return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(alt);
          }
        }
      }
      return value;
    }
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
  } catch (err) {
    return value;
  }
};

const Section = ({ title, children }) => (
  <section className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-gray-900">
    <h3 className="text-base font-semibold mb-2 text-gray-900 dark:text-gray-100">{title}</h3>
    <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">{children}</div>
  </section>
);

const BriefSummary = ({ submission, locale = 'en-US' }) => {
  if (!submission) return null;
  const { payload = {}, submittedAt, updatedAt, status } = submission;
  const products = Array.isArray(payload.products) ? payload.products.filter(Boolean) : [];
  const assets = Array.isArray(payload.assets) ? payload.assets.filter((a) => a && (a.name || a.url)) : [];
  const notes = payload.notes || '';
  const deadline = payload.deadline || null;
  const updatedCopy = updatedAt && submittedAt && updatedAt !== submittedAt
    ? formatDateTime(updatedAt, locale)
    : null;

  return (
    <div className="space-y-4">
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-gray-900">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-700 dark:text-gray-300">
          <div>
            <dt className="font-medium text-gray-900 dark:text-gray-100">Submitted</dt>
            <dd>{formatDateTime(submittedAt, locale) || '—'}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900 dark:text-gray-100">Status</dt>
            <dd className="capitalize">{status || 'submitted'}</dd>
          </div>
          {updatedCopy && (
            <div>
              <dt className="font-medium text-gray-900 dark:text-gray-100">Last updated</dt>
              <dd>{updatedCopy}</dd>
            </div>
          )}
          {deadline && (
            <div>
              <dt className="font-medium text-gray-900 dark:text-gray-100">Requested deadline</dt>
              <dd>{formatDeadline(deadline, locale)}</dd>
            </div>
          )}
        </dl>
      </div>

      {products.length > 0 && (
        <Section title="Products & Campaigns">
          <ul className="list-disc list-inside space-y-1">
            {products.map((item, idx) => (
              <li key={`${item}-${idx}`}>{item}</li>
            ))}
          </ul>
        </Section>
      )}

      {assets.length > 0 && (
        <Section title="Assets">
          <ul className="space-y-2">
            {assets.map((asset, idx) => {
              const name = asset.name || `Asset ${idx + 1}`;
              const url = asset.url || '';
              return (
                <li key={`${name}-${idx}`} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{name}</span>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-300 hover:underline break-all"
                    >
                      {url}
                    </a>
                  ) : (
                    <span className="text-gray-500">No link provided</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {notes && (
        <Section title="Notes">
          <p className="whitespace-pre-wrap">{notes}</p>
        </Section>
      )}
    </div>
  );
};

export default BriefSummary;
