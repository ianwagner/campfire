import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiAlertCircle, FiClock, FiShare2 } from 'react-icons/fi';
import {
  collection,
  getDocs,
  query,
  where,
  getCountFromServer,
  doc,
  getDoc,
  Timestamp,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from './firebase/config';
import PageWrapper from './components/PageWrapper.jsx';
import Table from './components/common/Table';
import MonthSelector from './components/MonthSelector.jsx';
import getMonthString from './utils/getMonthString.js';
import { normalizeReviewVersion } from './utils/reviewVersion';
import useUserRole from './useUserRole';

const parseMetricValue = (input) => {
  if (input === null || input === undefined) {
    return { value: null, unknown: false };
  }
  if (typeof input === 'number') {
    return Number.isFinite(input)
      ? { value: input, unknown: false }
      : { value: null, unknown: true };
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed || trimmed === '-' || trimmed === '—') {
      return { value: null, unknown: false };
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return { value: numeric, unknown: false };
    }
    return { value: null, unknown: true };
  }
  return { value: null, unknown: true };
};

const getNumericValue = (input) => {
  const { value } = parseMetricValue(input);
  return value;
};

const formatMetricDisplay = (input) => {
  if (input === null || input === undefined) {
    return '—';
  }
  if (typeof input === 'number') {
    return Number.isFinite(input) ? input.toLocaleString() : '—';
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed || trimmed === '-' || trimmed === '—') {
      return '—';
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric.toLocaleString();
    }
    return trimmed;
  }
  return '—';
};

const formatSummaryValue = (stat) => {
  if (!stat) return '—';
  if (stat.hasData) {
    return stat.total.toLocaleString();
  }
  if (stat.hasUnknown) {
    return '—';
  }
  return '0';
};

const pluralize = (count, singular, plural = `${singular}s`) =>
  count === 1 ? singular : plural;

function AdminDashboard({ agencyId, brandCodes = [], requireFilters = false } = {}) {
  const thisMonth = getMonthString();
  const [month, setMonth] = useState(thisMonth);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [briefOnly, setBriefOnly] = useState(false);
  const [notes, setNotes] = useState({});
  const [noteDrafts, setNoteDrafts] = useState({});
  const [savingNotes, setSavingNotes] = useState({});
  const [noteErrors, setNoteErrors] = useState({});
  const fallbackSourceRef = useRef({});

  const user = auth.currentUser;
  const { role } = useUserRole(user?.uid);
  const canEditNotes = role === 'admin' || role === 'ops';

  const getWorkflow = () => (briefOnly ? 'brief' : 'production');

  const getBaseNoteKey = (brand) => {
    const rawKey = brand?.noteKey || brand?.code || brand?.id;
    return rawKey ? String(rawKey) : '';
  };

  const getScopedNoteKey = (input) => {
    const baseKey = typeof input === 'string' ? input : getBaseNoteKey(input);
    if (!baseKey) return '';
    const workflow = getWorkflow();
    return `${baseKey}__${month}__${workflow}`;
  };

  const monthDisplay = useMemo(() => {
    if (!month) return '';
    const [yearStr, monthStr] = month.split('-');
    const yearNum = Number(yearStr);
    const monthNum = Number(monthStr) - 1;
    if (Number.isFinite(yearNum) && Number.isFinite(monthNum)) {
      const date = new Date(yearNum, monthNum);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric',
        });
      }
    }
    return month;
  }, [month]);

  const viewLabel = briefOnly ? 'Brief-only workflow' : 'Production workflow';

  const relevantNoteKeys = useMemo(() => {
    const unique = new Set();
    rows.forEach((row) => {
      const key = getScopedNoteKey(row);
      if (key) unique.add(key);
    });
    return Array.from(unique.values());
  }, [rows, month, briefOnly]);

  const dashboardSummary = useMemo(() => {
    if (rows.length === 0) {
      return null;
    }
    const metricKeys = ['contracted', 'briefed', 'delivered'];
    if (!briefOnly) {
      metricKeys.push('approved', 'rejected');
    }
    const stats = {};
    metricKeys.forEach((key) => {
      stats[key] = { total: 0, hasData: false, hasUnknown: false };
    });

    rows.forEach((row) => {
      metricKeys.forEach((key) => {
        const { value, unknown } = parseMetricValue(row[key]);
        if (value !== null) {
          stats[key].total += value;
          stats[key].hasData = true;
        } else if (unknown) {
          stats[key].hasUnknown = true;
        }
      });
    });

    const getPercentage = (key) => {
      if (!stats[key]?.hasData || !stats.contracted?.hasData) {
        return null;
      }
      const denominator = stats.contracted.total;
      if (denominator <= 0) {
        return null;
      }
      return Math.round((stats[key].total / denominator) * 100);
    };

    const remaining =
      stats.contracted?.hasData && stats.delivered?.hasData
        ? Math.max(stats.contracted.total - stats.delivered.total, 0)
        : null;

    return {
      stats,
      percentages: {
        briefed: getPercentage('briefed'),
        delivered: getPercentage('delivered'),
        approved: getPercentage('approved'),
      },
      remaining,
    };
  }, [rows, briefOnly]);

  const summaryCards = useMemo(() => {
    if (rows.length === 0) {
      return [];
    }

    const baseCards = [
      {
        key: 'brands',
        label: 'Brands in view',
        value: rows.length.toLocaleString(),
        description: requireFilters
          ? 'You are viewing the brands shared with you.'
          : 'Includes every active brand in this timeframe.',
        accent: 'from-sky-500 to-blue-600',
      },
    ];

    if (!dashboardSummary) {
      return baseCards;
    }

    const cards = [...baseCards];

    const contractedStat = dashboardSummary.stats.contracted;
    cards.push({
      key: 'contracted',
      label: briefOnly ? 'Contracted briefs' : 'Contracted units',
      value: formatSummaryValue(contractedStat),
      secondary: monthDisplay ? `Scheduled for ${monthDisplay}` : null,
      description: contractedStat?.hasUnknown
        ? 'Some brands are missing contract data.'
        : 'Total commitments for the selected month.',
      accent: 'from-indigo-500 to-purple-500',
    });

    const deliveredStat = dashboardSummary.stats.delivered;
    cards.push({
      key: 'delivered',
      label: 'Delivered',
      value: formatSummaryValue(deliveredStat),
      secondary:
        dashboardSummary.percentages.delivered !== null
          ? `${dashboardSummary.percentages.delivered}% of goal`
          : null,
      description:
        dashboardSummary.remaining !== null
          ? `${dashboardSummary.remaining.toLocaleString()} ${pluralize(
              dashboardSummary.remaining,
              'unit',
            )} remaining`
          : 'Delivery progress for the current month.',
      accent: 'from-emerald-500 to-teal-500',
    });

    const briefedStat = dashboardSummary.stats.briefed;
    cards.push({
      key: 'briefed',
      label: briefOnly ? 'Briefs submitted' : 'Briefed',
      value: formatSummaryValue(briefedStat),
      secondary:
        dashboardSummary.percentages.briefed !== null
          ? `${dashboardSummary.percentages.briefed}% of goal`
          : null,
      description: briefOnly
        ? 'Brief progress within the selected workflow.'
        : 'Requests that have been briefed for production.',
      accent: 'from-amber-500 to-orange-500',
    });

    if (!briefOnly) {
      const approvedStat = dashboardSummary.stats.approved;
      cards.push({
        key: 'approved',
        label: 'Approved',
        value: formatSummaryValue(approvedStat),
        secondary:
          dashboardSummary.percentages.approved !== null
            ? `${dashboardSummary.percentages.approved}% of goal`
            : null,
        description: approvedStat?.hasUnknown
          ? 'Some brands are missing approval data.'
          : 'Assets that cleared review this month.',
        accent: 'from-blue-500 to-cyan-500',
      });
    }

    return cards;
  }, [
    rows,
    dashboardSummary,
    requireFilters,
    monthDisplay,
    briefOnly,
  ]);

  const handleNoteChange = (key, value) => {
    if (!canEditNotes) return;
    if (!key) return;
    setNoteDrafts((prev) => ({ ...prev, [key]: value }));
    setNoteErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleNoteBlur = async (row) => {
    if (!canEditNotes) return;
    const baseKey = getBaseNoteKey(row);
    const key = getScopedNoteKey(baseKey);
    if (!key) return;
    const draftValue = (noteDrafts[key] ?? '').trim();
    const savedValue = (notes[key] ?? '').trim();
    if (!draftValue && !savedValue) {
      return;
    }
    if (draftValue === savedValue) {
      // Draft matches what we already saved.
      if ((noteDrafts[key] ?? '') !== (notes[key] ?? '')) {
        setNoteDrafts((prev) => ({ ...prev, [key]: notes[key] ?? '' }));
      }
      return;
    }

    setSavingNotes((prev) => ({ ...prev, [key]: true }));
    const workflow = getWorkflow();
    try {
      const noteRef = doc(db, 'dashboardNotes', key);
      const legacyKey = fallbackSourceRef.current[key] || (baseKey && baseKey !== key ? baseKey : '');
      if (!draftValue) {
        await deleteDoc(noteRef);
        setNotes((prev) => {
          const next = { ...prev };
          next[key] = '';
          return next;
        });
        setNoteDrafts((prev) => ({ ...prev, [key]: '' }));
        if (legacyKey) {
          try {
            await deleteDoc(doc(db, 'dashboardNotes', legacyKey));
          } catch (cleanupErr) {
            console.error('Failed to remove legacy dashboard note', cleanupErr);
          }
          const nextFallback = { ...fallbackSourceRef.current };
          delete nextFallback[key];
          fallbackSourceRef.current = nextFallback;
        }
      } else {
        await setDoc(
          noteRef,
          {
            note: draftValue,
            brandCode: row.code || '',
            brandId: row.id || '',
            brandName: row.name || '',
            workflow,
            month,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        setNotes((prev) => ({ ...prev, [key]: draftValue }));
        setNoteDrafts((prev) => ({ ...prev, [key]: draftValue }));
        if (legacyKey) {
          try {
            await deleteDoc(doc(db, 'dashboardNotes', legacyKey));
          } catch (cleanupErr) {
            console.error('Failed to remove legacy dashboard note', cleanupErr);
          }
          const nextFallback = { ...fallbackSourceRef.current };
          delete nextFallback[key];
          fallbackSourceRef.current = nextFallback;
        }
      }
    } catch (err) {
      console.error('Failed to save dashboard note', err);
      setNoteErrors((prev) => ({
        ...prev,
        [key]: 'Failed to save note. Please try again.',
      }));
      setNoteDrafts((prev) => ({ ...prev, [key]: notes[key] ?? '' }));
    } finally {
      setSavingNotes((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      setLoading(true);
      if (requireFilters && brandCodes.length === 0 && !agencyId) {
        if (active) {
          setRows([]);
          setNotes({});
          setNoteDrafts({});
          setSavingNotes({});
          setNoteErrors({});
          fallbackSourceRef.current = {};
          setLoading(false);
        }
        return;
      }
      try {
        fallbackSourceRef.current = {};
        const base = collection(db, 'brandStats');
        let statDocs = [];
        if (brandCodes.length > 0) {
          const chunks = [];
          for (let i = 0; i < brandCodes.length; i += 10) {
            chunks.push(brandCodes.slice(i, i + 10));
          }
          const snaps = await Promise.all(
            chunks.map((chunk) =>
              getDocs(query(base, where('code', 'in', chunk)))
            )
          );
          snaps.forEach((snap) => statDocs.push(...snap.docs));
        } else if (agencyId) {
          const snap = await getDocs(query(base, where('agencyId', '==', agencyId)));
          statDocs = snap.docs;
        } else {
          const snap = await getDocs(base);
          statDocs = snap.docs;
        }
        let extraBrands = [];
        if (statDocs.length === 0) {
          if (brandCodes.length > 0) {
            extraBrands = brandCodes.map((code) => ({ id: code, code }));
          } else {
            let brandQuery = agencyId
              ? query(collection(db, 'brands'), where('agencyId', '==', agencyId))
              : collection(db, 'brands');
            const brandSnap = await getDocs(brandQuery);
            extraBrands = brandSnap.docs.map((d) => ({
              id: d.id,
              code: d.data().code,
              name: d.data().name,
            }));
            if (extraBrands.length === 0) {
              let contractQuery = agencyId
                ? query(collection(db, 'contracts'), where('agencyId', '==', agencyId))
                : collection(db, 'contracts');
              const contractSnap = await getDocs(contractQuery);
              extraBrands = contractSnap.docs.map((d) => {
                const data = d.data() || {};
                return {
                  id: data.brandId || d.id,
                  code: data.brandCode,
                  name: data.brandName,
                };
              });
            }
          }
        } else if (brandCodes.length > 0) {
          const existingCodes = new Set(
            statDocs.map((d) => (d.data() || {}).code)
          );
          const missing = brandCodes.filter((c) => !existingCodes.has(c));
          extraBrands = missing.map((code) => ({ id: code, code }));
        }

        const computeCounts = async (brand, { briefOnly: briefFilter } = {}) => {
          let contractedProduction = 0;
          let contractedBrief = 0;
          let briefed = 0;
          let delivered = 0;
          let approved = 0;
          let rejected = 0;

          try {
            let brandId = brand.id;
            let brandCode = brand.code;
            let brandName = brand.name;
            let brandSnap;
            if (brandId) {
              brandSnap = await getDoc(doc(db, 'brands', brandId));
            }
            if ((!brandSnap || !brandSnap.exists()) && brandCode) {
              const q = query(
                collection(db, 'brands'),
                where('code', '==', brandCode)
              );
              const snap = await getDocs(q);
              if (!snap.empty) {
                brandSnap = snap.docs[0];
                brandId = brandSnap.id;
              }
            }
            if (brandSnap && brandSnap.exists()) {
              const bData = brandSnap.data() || {};
              brandName = brandName || bData.name;
              const contracts = Array.isArray(bData.contracts)
                ? bData.contracts
                : [];
              const selected = new Date(`${month}-01`);
              contracts.forEach((c) => {
                const contractMode =
                  typeof c.mode === 'string'
                    ? c.mode.toLowerCase()
                    : 'production';
                const isBriefContract = contractMode === 'brief';
                if (briefFilter ? !isBriefContract : isBriefContract) {
                  return;
                }
                const startStr = c.startDate ? c.startDate.slice(0, 7) : '';
                if (!startStr) return;
                const start = new Date(`${startStr}-01`);
                let end;
                const endStr = c.endDate ? c.endDate.slice(0, 7) : '';
                if (endStr) {
                  end = new Date(`${endStr}-01`);
                } else if (c.renews || c.repeat) {
                  // Open-ended contracts should count for future months up to five years
                  end = new Date(start);
                  end.setMonth(end.getMonth() + 60);
                } else {
                  end = new Date(`${startStr}-01`);
                }
                if (selected >= start && selected <= end) {
                  const units = Number(c.stills || 0) + Number(c.videos || 0);
                  if (isBriefContract) {
                    contractedBrief += units;
                  } else {
                    contractedProduction += units;
                  }
                }
              });
            }

            if (brandCode) {
              const startDate = new Date(`${month}-01`);
              const endDate = new Date(startDate);
              endDate.setMonth(endDate.getMonth() + 1);
              const monthQ = query(
                collection(db, 'adGroups'),
                where('brandCode', '==', brandCode),
                where('month', '==', month)
              );
              const dueQ = query(
                collection(db, 'adGroups'),
                where('brandCode', '==', brandCode),
                where('dueDate', '>=', Timestamp.fromDate(startDate)),
                where('dueDate', '<', Timestamp.fromDate(endDate))
              );
              const [monthSnap, dueSnap] = await Promise.all([
                getDocs(monthQ),
                getDocs(dueQ),
              ]);
              const dueDocs = dueSnap.docs.filter((g) => {
                const data = g.data() || {};
                return !data.month;
              });
              const adDocs = [...monthSnap.docs, ...dueDocs];
              for (const g of adDocs) {
                const gData = g.data() || {};
                const normalizedReview = normalizeReviewVersion(
                  gData.reviewVersion ?? gData.reviewType ?? 1
                );
                const isBriefGroup = normalizedReview === '3';
                if (briefFilter && !isBriefGroup) continue;
                if (!briefFilter && isBriefGroup) continue;
                const [rSnap, aSnap] = await Promise.all([
                  getCountFromServer(collection(db, 'adGroups', g.id, 'recipes')),
                  getDocs(
                    query(
                      collection(db, 'adGroups', g.id, 'assets'),
                      where('status', 'in', [
                        'ready',
                        'approved',
                        'rejected',
                        'edit_requested',
                        'pending',
                      ])
                    )
                  ),
                ]);
                const recipeCount = rSnap.data().count || 0;
                briefed += recipeCount;
                const deliveredSet = new Set();
                const approvedSet = new Set();
                const rejectedSet = new Set();
                aSnap.docs.forEach((a) => {
                  const data = a.data() || {};
                  const key = `${g.id}:${data.recipeCode || ''}`;
                  deliveredSet.add(key);
                  if (data.status === 'approved') {
                    approvedSet.add(key);
                  }
                  if (data.status === 'rejected') {
                    rejectedSet.add(key);
                  }
                });
                let deliveredCount = deliveredSet.size;
                if (briefFilter && gData.status === 'designed') {
                  deliveredCount = Math.max(deliveredCount, recipeCount);
                }
                delivered += deliveredCount;
                if (!briefFilter) {
                  approved += approvedSet.size;
                  rejected += rejectedSet.size;
                }
              }
            }

            const contracted = briefFilter ? contractedBrief : contractedProduction;

            const noProgress =
              contracted === 0 &&
              briefed === 0 &&
              delivered === 0 &&
              (briefFilter || (approved === 0 && rejected === 0));
            if (noProgress) {
              return null;
            }

            const noteKeyRaw = brandCode || brandId || brand.id;
            const noteKey = noteKeyRaw ? String(noteKeyRaw) : '';

            return {
              id: brandId || brand.code || brand.id,
              code: brandCode,
              name: brandName,
              contracted,
              briefed,
              delivered,
              approved: briefFilter ? '-' : approved,
              rejected: briefFilter ? '-' : rejected,
              noteKey,
            };
          } catch (err) {
            console.error('Failed to compute counts', err);
            return {
              id: brand.id || brand.code,
              code: brand.code,
              name: brand.name,
              contracted: '?',
              briefed: '?',
              delivered: '?',
              approved: briefFilter ? '-' : '?',
              rejected: briefFilter ? '-' : '?',
              noteKey: brand.code || brand.id || '',
            };
          }
        };

        const brandEntryMap = new Map();
        statDocs.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const entry = {
            id: docSnap.id,
            code: data.code,
            name: data.name,
          };
          const key = entry.code || entry.id;
          if (key && !brandEntryMap.has(key)) {
            brandEntryMap.set(key, entry);
          }
        });
        extraBrands.forEach((brand) => {
          const key = brand.code || brand.id;
          if (key && !brandEntryMap.has(key)) {
            brandEntryMap.set(key, brand);
          }
        });

        const brandEntries = Array.from(brandEntryMap.values());
        const computedResults = (
          await Promise.all(
            brandEntries.map((brand) => computeCounts(brand, { briefOnly }))
          )
        ).filter(Boolean);
        computedResults.sort((a, b) =>
          (a.name || a.code || '').localeCompare(b.name || b.code || '')
        );
        if (active) setRows(computedResults);

        const noteEntries = {};
        const noteDraftEntries = {};
        const fallbackSourceMap = {};
        const scopedToBaseKey = new Map();
        const uniqueScopedKeys = [];
        computedResults.forEach((row) => {
          const baseKey = getBaseNoteKey(row);
          const scopedKey = getScopedNoteKey(baseKey);
          if (!scopedKey) return;
          if (!scopedToBaseKey.has(scopedKey)) {
            scopedToBaseKey.set(scopedKey, baseKey);
            uniqueScopedKeys.push(scopedKey);
          }
        });

        if (uniqueScopedKeys.length > 0) {
          try {
            const noteSnaps = await Promise.all(
              uniqueScopedKeys.map((key) => getDoc(doc(db, 'dashboardNotes', key)))
            );
            const missingScopedKeys = [];
            noteSnaps.forEach((snap, idx) => {
              const scopedKey = uniqueScopedKeys[idx];
              if (snap?.exists()) {
                const data = snap.data() || {};
                const value = typeof data.note === 'string' ? data.note : '';
                noteEntries[scopedKey] = value;
                noteDraftEntries[scopedKey] = value;
              } else {
                noteEntries[scopedKey] = '';
                noteDraftEntries[scopedKey] = '';
                missingScopedKeys.push(scopedKey);
              }
            });

            if (missingScopedKeys.length > 0) {
              const fallbackBaseKeys = Array.from(
                new Set(
                  missingScopedKeys
                    .map((scopedKey) => scopedToBaseKey.get(scopedKey))
                    .filter((key) => typeof key === 'string' && key.length > 0)
                )
              );
              if (fallbackBaseKeys.length > 0) {
                try {
                  const fallbackSnaps = await Promise.all(
                    fallbackBaseKeys.map((key) => getDoc(doc(db, 'dashboardNotes', key)))
                  );
                  const workflow = getWorkflow();
                  fallbackSnaps.forEach((snap, idx) => {
                    const baseKey = fallbackBaseKeys[idx];
                    if (!snap?.exists()) return;
                    const data = snap.data() || {};
                    const docWorkflow =
                      typeof data.workflow === 'string' ? data.workflow : 'production';
                    if (docWorkflow !== workflow) return;
                    let noteMonth = '';
                    if (typeof data.month === 'string' && data.month) {
                      noteMonth = data.month;
                    } else if (data.updatedAt?.toDate) {
                      noteMonth = data.updatedAt
                        .toDate()
                        .toISOString()
                        .slice(0, 7);
                    } else if (typeof snap.updateTime?.toDate === 'function') {
                      noteMonth = snap
                        .updateTime
                        .toDate()
                        .toISOString()
                        .slice(0, 7);
                    }
                    if (noteMonth && noteMonth !== month) return;
                    const value = typeof data.note === 'string' ? data.note : '';
                    missingScopedKeys.forEach((scopedKey) => {
                      if (scopedToBaseKey.get(scopedKey) !== baseKey) return;
                      noteEntries[scopedKey] = value;
                      noteDraftEntries[scopedKey] = value;
                      fallbackSourceMap[scopedKey] = baseKey;
                    });
                  });
                } catch (fallbackErr) {
                  console.error('Failed to load legacy dashboard notes', fallbackErr);
                }
              }
            }
          } catch (err) {
            console.error('Failed to load dashboard notes', err);
          }
        }

        if (active) {
          setNotes(noteEntries);
          setNoteDrafts(noteDraftEntries);
          setSavingNotes({});
          setNoteErrors({});
          fallbackSourceRef.current = fallbackSourceMap;
        }
      } catch (err) {
        console.error('Failed to fetch dashboard data', err);
        if (active) {
          setRows([]);
          setNotes({});
          setNoteDrafts({});
          setSavingNotes({});
          setNoteErrors({});
          fallbackSourceRef.current = {};
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchData();
    return () => {
      active = false;
    };
  }, [month, agencyId, brandCodes, briefOnly]);

  const columnWidths = useMemo(
    () =>
      briefOnly
        ? ['auto', '7.5rem', '7.5rem', '7.5rem', 'auto']
        : ['auto', '7.5rem', '7.5rem', '7.5rem', '7.5rem', '7.5rem', 'auto'],
    [briefOnly]
  );

  const ToggleButton = ({ active, children, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
        active
          ? 'bg-blue-600 text-white shadow-sm dark:bg-blue-500'
          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-[var(--dark-sidebar-hover)]'
      }`}
      aria-pressed={active}
    >
      {children}
    </button>
  );

  return (
    <PageWrapper className="bg-gray-50 dark:bg-[var(--dark-bg)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
                {requireFilters ? 'Shared dashboard' : 'Admin dashboard'}
              </h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                {monthDisplay ? `${monthDisplay} · ${viewLabel}` : viewLabel}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-300">
                  Month
                </span>
                <div className="mt-2">
                  <MonthSelector
                    value={month}
                    onChange={setMonth}
                    className="flex-wrap"
                    inputClassName="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-[var(--dark-text)] dark:focus:border-blue-400 dark:focus:ring-blue-500/40"
                  />
                </div>
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-300">
                  Workflow
                </span>
                <div
                  className="mt-2 inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-100 p-1 text-sm font-medium dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]"
                  role="group"
                  aria-label="Workflow view"
                >
                  <ToggleButton active={!briefOnly} onClick={() => setBriefOnly(false)}>
                    Production
                  </ToggleButton>
                  <ToggleButton active={briefOnly} onClick={() => setBriefOnly(true)}>
                    Brief only
                  </ToggleButton>
                </div>
              </div>
            </div>
          </div>
          {requireFilters && (
            <div className="mt-4 inline-flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/90 px-4 py-3 text-sm text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-100">
              <FiShare2 className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium">Shared dashboard view</p>
                <p className="text-xs text-blue-600/80 dark:text-blue-100/80">
                  This dashboard is filtered to the brands assigned to your team.
                </p>
              </div>
            </div>
          )}
        </div>

        {!loading && summaryCards.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <div
                key={card.key}
                className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]"
              >
                <div
                  className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.accent}`}
                  aria-hidden="true"
                />
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-300">
                    {card.label}
                  </span>
                  <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                    {card.value}
                  </span>
                  {card.secondary && (
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                      {card.secondary}
                    </span>
                  )}
                  {card.description && (
                    <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                      {card.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
            <div className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" aria-hidden="true" />
              Loading dashboard data…
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              No results for {monthDisplay || 'this selection'}
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              {requireFilters
                ? 'Try a different month or ask your admin for access to additional brands.'
                : 'Adjust the month or review your contracts to see activity here.'}
            </p>
          </div>
        ) : (
          <Table className="dashboard-table" columns={columnWidths}>
            <thead>
              <tr>
                <th>Brand</th>
                <th className="metric-col">Contracted</th>
                <th className="metric-col">Briefed</th>
                <th className="metric-col">Delivered</th>
                {!briefOnly && <th className="metric-col">Approved</th>}
                {!briefOnly && <th className="metric-col">Rejected</th>}
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const contractedValue = getNumericValue(r.contracted);
                const noteKey = getScopedNoteKey(r);
                const noteValue = noteDrafts[noteKey] ?? '';
                const renderMetricCell = (
                  key,
                  label,
                  {
                    showProgress = true,
                    highlightOnGoal = false,
                    accent = 'bg-blue-500 dark:bg-blue-400',
                    textClass = '',
                    subLabel = null,
                  } = {},
                ) => {
                  const rawValue = r[key];
                  const metricValue = getNumericValue(rawValue);
                  const ratio =
                    showProgress &&
                    contractedValue !== null &&
                    contractedValue > 0 &&
                    metricValue !== null
                      ? Math.round((metricValue / contractedValue) * 100)
                      : null;
                  const clampedRatio =
                    ratio !== null ? Math.max(0, Math.min(ratio, 999)) : null;
                  const highlightClass =
                    highlightOnGoal && clampedRatio !== null && clampedRatio >= 100
                      ? 'bg-approve-10'
                      : '';
                  const progressWidth = clampedRatio !== null ? Math.min(clampedRatio, 100) : 0;
                  return (
                    <td
                      className={`metric-col align-top text-center ${highlightClass}`.trim()}
                      data-label={label}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className={`text-base font-semibold text-gray-900 dark:text-gray-100 ${textClass}`.trim()}
                        >
                          {formatMetricDisplay(rawValue)}
                        </span>
                        {subLabel && (
                          <span className="text-[10px] uppercase tracking-[0.12em] text-gray-500 dark:text-gray-300">
                            {subLabel}
                          </span>
                        )}
                        {clampedRatio !== null && (
                          <div className="w-full" aria-hidden="true">
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-[var(--border-color-default)]/40">
                              <div
                                className={`h-full rounded-full ${accent}`}
                                style={{ width: `${progressWidth}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  );
                };

                return (
                  <tr key={r.id}>
                    <td data-label="Brand" className="align-top">
                      {r.code ? (
                        <Link
                          to={`/admin/ad-groups?brandCode=${encodeURIComponent(r.code)}`}
                          className="inline-flex flex-wrap items-center gap-2 font-semibold text-gray-900 transition hover:text-blue-600 dark:text-gray-100 dark:hover:text-blue-300"
                        >
                          <span>{r.name || r.code}</span>
                          <span className="inline-flex items-center rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-600 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)] dark:text-[var(--dark-text)]">
                            {r.code}
                          </span>
                        </Link>
                      ) : (
                        <div className="inline-flex flex-wrap items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
                          <span>{r.name || r.id}</span>
                        </div>
                      )}
                    </td>
                    {renderMetricCell('contracted', 'Contracted', {
                      showProgress: false,
                      subLabel: 'Goal',
                    })}
                    {renderMetricCell('briefed', 'Briefed', {
                      highlightOnGoal: true,
                      accent: 'bg-amber-500 dark:bg-amber-400',
                    })}
                    {renderMetricCell('delivered', 'Delivered', {
                      highlightOnGoal: true,
                      accent: 'bg-emerald-500 dark:bg-emerald-400',
                    })}
                    {!briefOnly &&
                      renderMetricCell('approved', 'Approved', {
                        highlightOnGoal: true,
                        accent: 'bg-blue-500 dark:bg-blue-400',
                      })}
                    {!briefOnly &&
                      renderMetricCell('rejected', 'Rejected', {
                        showProgress: false,
                        textClass: 'text-reject',
                      })}
                    <td className="notes-cell align-top" data-label="Notes">
                      <div className="flex w-full flex-col gap-2">
                        <textarea
                          value={noteValue}
                          onChange={(e) => handleNoteChange(noteKey, e.target.value)}
                          onBlur={() => handleNoteBlur(r)}
                          placeholder={
                            canEditNotes
                              ? 'Add context or action items for this brand'
                              : 'Notes are view only'
                          }
                          rows={2}
                          style={{ height: 'auto' }}
                          disabled={!canEditNotes}
                          aria-disabled={!canEditNotes}
                          className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-relaxed text-gray-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-[var(--dark-text)] dark:focus:border-blue-400 dark:focus:ring-blue-500/30 dark:disabled:border-[var(--border-color-default)] dark:disabled:bg-[var(--dark-sidebar-hover)] dark:disabled:text-gray-400"
                        />
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {savingNotes[noteKey] && (
                            <span className="note-status inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-amber-700 dark:bg-amber-500/20 dark:text-amber-100">
                              <FiClock className="h-3 w-3" />
                              Saving…
                            </span>
                          )}
                          {noteErrors[noteKey] && (
                            <span className="note-status inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-1 text-rose-700 dark:bg-rose-500/20 dark:text-rose-100">
                              <FiAlertCircle className="h-3 w-3" />
                              {noteErrors[noteKey]}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </div>
    </PageWrapper>
  );
}

export default AdminDashboard;
