import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase/config';
import { getCurrentPeriod } from './utils/briefPeriod.js';

const STATES = {
  AVAILABLE: 'AVAILABLE',
  SUBMITTED_EDITABLE: 'SUBMITTED_EDITABLE',
  CLOSED_BRAND: 'CLOSED_BRAND',
  CLOSED_AGENCY: 'CLOSED_AGENCY',
  LOADING: 'loading',
};

const normalizeDate = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value.toDate === 'function') {
    const parsed = value.toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

export default function useMonthlyBrief(agencyId, brandId, period) {
  const resolvedPeriod = period || getCurrentPeriod();
  const [brief, setBrief] = useState(null);
  const [briefLoaded, setBriefLoaded] = useState(false);
  const [submission, setSubmission] = useState(null);
  const [submissionLoaded, setSubmissionLoaded] = useState(false);

  useEffect(() => {
    let unsubscribe = () => {};
    setBriefLoaded(false);
    setBrief(null);
    if (!agencyId) {
      setBriefLoaded(true);
      return () => unsubscribe();
    }
    const ref = doc(db, 'briefs', `${agencyId}_${resolvedPeriod}`);
    unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setBrief(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setBriefLoaded(true);
      },
      (err) => {
        console.error('Failed to load brief config', err);
        setBrief(null);
        setBriefLoaded(true);
      }
    );
    return () => unsubscribe();
  }, [agencyId, resolvedPeriod]);

  useEffect(() => {
    let unsubscribe = () => {};
    setSubmissionLoaded(false);
    setSubmission(null);
    if (!agencyId || !brandId) {
      setSubmissionLoaded(true);
      return () => unsubscribe();
    }
    const ref = doc(db, 'briefSubmissions', `${brandId}_${resolvedPeriod}`);
    unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setSubmission(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setSubmissionLoaded(true);
      },
      (err) => {
        console.error('Failed to load brief submission', err);
        setSubmission(null);
        setSubmissionLoaded(true);
      }
    );
    return () => unsubscribe();
  }, [agencyId, brandId, resolvedPeriod]);

  const state = useMemo(() => {
    if (!briefLoaded || !submissionLoaded) return STATES.LOADING;
    if (brief && brief.isWindowOpen === false) return STATES.CLOSED_AGENCY;
    if (!submission) {
      return brief && brief.isWindowOpen === true ? STATES.AVAILABLE : STATES.CLOSED_AGENCY;
    }
    const canEditUntil = normalizeDate(submission.canEditUntil || submission.canEditUntilTs);
    if (canEditUntil && Date.now() < canEditUntil.getTime()) {
      return STATES.SUBMITTED_EDITABLE;
    }
    return STATES.CLOSED_BRAND;
  }, [brief, briefLoaded, submission, submissionLoaded]);

  return {
    period: resolvedPeriod,
    brief,
    submission,
    state,
    loading: !briefLoaded || !submissionLoaded,
  };
}

export { STATES as MONTHLY_BRIEF_STATES };
