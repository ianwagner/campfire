import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, addDoc, doc, setDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import useAgencyTheme from './useAgencyTheme';
import useBrandsByCode from './useBrandsByCode.js';
import useMonthlyBrief, { MONTHLY_BRIEF_STATES } from './useMonthlyBrief.js';
import BriefForm from './BriefForm.jsx';
import SubmittedEditable from './SubmittedEditable.jsx';
import ClosedMessage from './ClosedMessage.jsx';
import {
  MONTHLY_BRIEF_BADGE_TONE_CLASSES,
  MONTHLY_BRIEF_MENU_LABEL,
  getMonthlyBriefBadge,
} from './monthlyBriefCopy.js';
import { getCurrentPeriod } from './utils/briefPeriod.js';

const EDIT_GRACE_MS = 2 * 60 * 60 * 1000;

const getCanEditUntil = (submission) => {
  if (!submission) return null;
  if (submission.canEditUntil) return submission.canEditUntil;
  if (submission.canEditUntilTs && typeof submission.canEditUntilTs.toDate === 'function') {
    return submission.canEditUntilTs.toDate().toISOString();
  }
  return null;
};

const countsForPayload = (payload = {}) => ({
  products: Array.isArray(payload.products) ? payload.products.filter(Boolean).length : 0,
  assets: Array.isArray(payload.assets) ? payload.assets.filter((a) => a && (a.name || a.url)).length : 0,
  notes: payload.notes ? 1 : 0,
});

const resolveDeliveryWindow = (brief) =>
  Array.isArray(brief?.deliveryWindowDays) ? brief.deliveryWindowDays : null;

const resolveFields = (brief) => (Array.isArray(brief?.fields) ? brief.fields : undefined);

const BriefPage = ({ brandCodes = [], agencyId: userAgencyId = null }) => {
  const params = useParams();
  const requestedPeriod = params?.period;
  const periodOverride = requestedPeriod && requestedPeriod.length === 6 ? requestedPeriod : null;
  const [selectedBrandCode, setSelectedBrandCode] = useState(brandCodes[0] || '');
  const { brands, loading: brandsLoading } = useBrandsByCode(brandCodes);
  const activeBrand = useMemo(() => {
    if (brands.length === 0) return null;
    if (selectedBrandCode) {
      const match = brands.find(
        (brand) => brand.code && brand.code.toLowerCase() === selectedBrandCode.toLowerCase()
      );
      if (match) return match;
    }
    return brands[0];
  }, [brands, selectedBrandCode]);
  const activeAgencyId = activeBrand?.agencyId || userAgencyId || null;
  const { agency } = useAgencyTheme(activeAgencyId);
  const {
    period,
    brief,
    submission,
    state,
    loading: briefLoading,
  } = useMonthlyBrief(activeAgencyId, activeBrand?.id || null, periodOverride || getCurrentPeriod());
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusTone, setStatusTone] = useState('success');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (brandCodes.length === 1) {
      setSelectedBrandCode(brandCodes[0] || '');
    }
  }, [brandCodes]);

  useEffect(() => {
    if (!selectedBrandCode && brands.length > 0) {
      setSelectedBrandCode(brands[0].code || '');
    }
  }, [brands, selectedBrandCode]);

  useEffect(() => {
    setEditing(false);
    setStatusMessage('');
  }, [activeBrand?.id, period, state]);

  const deliveryWindowDays = resolveDeliveryWindow(brief);
  const fields = resolveFields(brief);
  const instructions = brief?.instructions || '';
  const canEditUntil = getCanEditUntil(submission);
  const badge = getMonthlyBriefBadge(state);
  const badgeClasses = badge
    ? MONTHLY_BRIEF_BADGE_TONE_CLASSES[badge.tone] || MONTHLY_BRIEF_BADGE_TONE_CLASSES.muted
    : null;

  const user = auth.currentUser;

  const handleSubmit = async (payload) => {
    if (!user || user.isAnonymous) {
      throw new Error('You must be signed in to submit your brief.');
    }
    if (!activeBrand?.id || !activeAgencyId) {
      throw new Error('Select a brand before submitting your brief.');
    }

    setSubmitting(true);
    setStatusMessage('');
    try {
      const now = new Date();
      const nowIso = now.toISOString();
      const submissionRef = doc(db, 'briefSubmissions', `${activeBrand.id}_${period}`);
      const counts = countsForPayload(payload);

      if (submission) {
        await setDoc(
          submissionRef,
          {
            payload,
            status: 'updated',
            updatedAt: nowIso,
            updatedBy: {
              uid: user.uid,
              email: user.email || user.displayName || 'client@campfire',
            },
          },
          { merge: true }
        );
        await addDoc(collection(db, 'events'), {
          type: 'brief.updated',
          brandId: activeBrand.id,
          agencyId: activeAgencyId,
          period,
          counts,
          createdAt: nowIso,
        });
        setStatusTone('success');
        setStatusMessage('Brief updates saved.');
        setEditing(false);
      } else {
        const editUntilDate = new Date(now.getTime() + EDIT_GRACE_MS);
        await setDoc(submissionRef, {
          brandId: activeBrand.id,
          brandCode: activeBrand.code || '',
          agencyId: activeAgencyId,
          period,
          status: 'submitted',
          submittedAt: nowIso,
          updatedAt: nowIso,
          canEditUntil: editUntilDate.toISOString(),
          canEditUntilTs: Timestamp.fromDate(editUntilDate),
          payload,
          submittedBy: {
            uid: user.uid,
            email: user.email || user.displayName || 'client@campfire',
          },
          updatedBy: {
            uid: user.uid,
            email: user.email || user.displayName || 'client@campfire',
          },
        });
        await addDoc(collection(db, 'events'), {
          type: 'brief.submitted',
          brandId: activeBrand.id,
          agencyId: activeAgencyId,
          period,
          counts,
          createdAt: nowIso,
        });
        setStatusTone('success');
        setStatusMessage('Brief submitted! You can edit for the next couple of hours.');
      }
    } catch (err) {
      console.error('Failed to persist monthly brief', err);
      setStatusTone('error');
      setStatusMessage('');
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const renderContent = () => {
    if (briefLoading || brandsLoading) {
      return (
        <div className="py-20 flex justify-center">
          <div className="loading-ring w-12 h-12" aria-label="Loading monthly brief" />
        </div>
      );
    }

    if (!activeBrand) {
      return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-2xl p-6 bg-white dark:bg-gray-900 text-center">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Select a brand</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            We couldn’t find any brands connected to your account. Reach out to your producer for access.
          </p>
        </div>
      );
    }

    if (state === MONTHLY_BRIEF_STATES.AVAILABLE) {
      return (
        <BriefForm
          period={period}
          agencyName={agency?.name || activeBrand?.agencyName || ''}
          deliveryWindowDays={deliveryWindowDays}
          instructions={instructions}
          onSubmit={handleSubmit}
          submitting={submitting}
          initialValues={{}}
          fields={fields}
        />
      );
    }

    if (state === MONTHLY_BRIEF_STATES.SUBMITTED_EDITABLE) {
      const payload = submission?.payload || {};
      return (
        <SubmittedEditable
          submission={submission}
          canEditUntil={canEditUntil}
          deliveryWindowDays={deliveryWindowDays}
          onEdit={() => setEditing(true)}
          editing={editing}
        >
          {editing && (
            <BriefForm
              period={period}
              agencyName={agency?.name || activeBrand?.agencyName || ''}
              deliveryWindowDays={deliveryWindowDays}
              instructions={instructions}
              onSubmit={handleSubmit}
              onCancel={() => setEditing(false)}
              submitting={submitting}
              initialValues={{
                products: payload.products || [],
                notes: payload.notes || '',
                deadline: payload.deadline || '',
                assets: payload.assets || [],
              }}
              fields={fields}
            />
          )}
        </SubmittedEditable>
      );
    }

    const closedType = state === MONTHLY_BRIEF_STATES.CLOSED_AGENCY ? 'agency' : 'brand';
    return (
      <ClosedMessage
        type={closedType}
        agencyName={agency?.name || activeBrand?.agencyName || ''}
        deliveryWindowDays={deliveryWindowDays}
        submission={submission}
      />
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 py-10">
      <div className="max-w-4xl mx-auto px-4 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{MONTHLY_BRIEF_MENU_LABEL}</h1>
            {activeBrand && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {activeBrand.name || activeBrand.code}
              </p>
            )}
          </div>
          {badge && badgeClasses && (
            <span className={`inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold rounded-full ${badgeClasses}`}>
              {badge.label}
            </span>
          )}
        </div>

        {brandCodes.length > 1 && brands.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label htmlFor="brand-selector" className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Brand
            </label>
            <select
              id="brand-selector"
              value={selectedBrandCode}
              onChange={(e) => setSelectedBrandCode(e.target.value)}
              className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {brands.map((brand) => (
                <option key={brand.id} value={brand.code || brand.id}>
                  {brand.name || brand.code || brand.id}
                </option>
              ))}
            </select>
          </div>
        )}

        {statusMessage && (
          <div
            className={`rounded-xl px-4 py-3 text-sm font-medium border ${
              statusTone === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-500/40 dark:text-emerald-100'
                : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-500/40 dark:text-red-100'
            }`}
          >
            {statusMessage}
          </div>
        )}

        {renderContent()}
      </div>
    </div>
  );
};

export default BriefPage;
