import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiAlertCircle, FiClock, FiBarChart2, FiTable, FiHome } from 'react-icons/fi';
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
import TabButton from './components/TabButton.jsx';
import DashboardTotalsChart from './components/charts/DashboardTotalsChart.jsx';
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

const formatMonthLabel = (value) => {
  if (!value) return '';
  const [yearStr, monthStr] = value.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
    return value;
  }
  const date = new Date(year, monthIndex);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
};

const compareMonthValues = (a, b) => {
  if (!a || !b) return 0;
  const [aYearStr, aMonthStr] = a.split('-');
  const [bYearStr, bMonthStr] = b.split('-');
  const aYear = Number(aYearStr);
  const aMonth = Number(aMonthStr);
  const bYear = Number(bYearStr);
  const bMonth = Number(bMonthStr);
  if (!Number.isFinite(aYear) || !Number.isFinite(aMonth) || !Number.isFinite(bYear) || !Number.isFinite(bMonth)) {
    return 0;
  }
  if (aYear === bYear) {
    return aMonth - bMonth;
  }
  return aYear - bYear;
};

const getMonthsBetween = (start, end, limit = 24) => {
  if (!start || !end) return [];
  const startDate = new Date(`${start}-01T00:00:00`);
  const endDate = new Date(`${end}-01T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return [];
  }
  if (startDate > endDate) {
    return [];
  }
  const months = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate && months.length < limit) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
};

const getDefaultOverviewRange = () => {
  const end = getMonthString();
  const endDate = new Date(`${end}-01T00:00:00`);
  if (Number.isNaN(endDate.getTime())) {
    return { start: end, end };
  }
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - 2);
  const start = startDate.toISOString().slice(0, 7);
  return { start, end };
};

function AdminDashboard({ agencyId, brandCodes = [], requireFilters = false } = {}) {
  const thisMonth = getMonthString();
  const [month, setMonth] = useState(thisMonth);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [briefOnly, setBriefOnly] = useState(false);
  const [activeTab, setActiveTab] = useState('brands');
  const [overviewRange, setOverviewRange] = useState(() => getDefaultOverviewRange());
  const [overviewData, setOverviewData] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState(null);
  const [brandSources, setBrandSources] = useState([]);
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

  const monthDisplay = useMemo(() => formatMonthLabel(month), [month]);

  const rangeLabel = useMemo(() => {
    if (!overviewRange.start || !overviewRange.end) return '';
    if (overviewRange.start === overviewRange.end) {
      return formatMonthLabel(overviewRange.start);
    }
    return `${formatMonthLabel(overviewRange.start)} – ${formatMonthLabel(
      overviewRange.end,
    )}`;
  }, [overviewRange.start, overviewRange.end]);

  const viewLabel = briefOnly ? 'Brief-only workflow' : 'Production workflow';

  const headerSubtitle = useMemo(() => {
    if (activeTab === 'overview') {
      return rangeLabel ? `${rangeLabel} · ${viewLabel}` : viewLabel;
    }
    return monthDisplay ? `${monthDisplay} · ${viewLabel}` : viewLabel;
  }, [activeTab, monthDisplay, rangeLabel, viewLabel]);

  const adGroupListPath = useMemo(() => {
    switch (role) {
      case 'project-manager':
      case 'ops':
        return '/pm/ad-groups';
      case 'agency':
        return '/agency/ad-groups';
      case 'client':
        return '/ad-groups';
      default:
        return '/admin/ad-groups';
    }
  }, [role]);

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
      metricKeys.push('inRevisions', 'approved', 'rejected');
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

  const overviewMetricLabels = useMemo(
    () => ({
      contracted: briefOnly ? 'Contracted briefs' : 'Contracted units',
      briefed: briefOnly ? 'Briefs submitted' : 'Briefed',
      delivered: 'Delivered',
      inRevisions: 'In Revisions',
      approved: 'Approved',
      rejected: 'Rejected',
    }),
    [briefOnly],
  );

  const overviewCards = useMemo(() => {
    if (!overviewData?.aggregate) {
      return [];
    }

    const monthsCount = overviewData.months?.length ?? 0;
    const cards = [
      {
        key: 'range',
        label: 'Months in range',
        value: monthsCount > 0 ? monthsCount.toLocaleString() : '0',
        description: rangeLabel
          ? `Aggregated totals for ${rangeLabel}.`
          : 'Aggregated totals for the selected range.',
        accent: 'from-[var(--accent-color)] to-[var(--accent-color)]',
      },
    ];

    const metricOrder = ['contracted', 'briefed', 'delivered'];
    if (!briefOnly) {
      metricOrder.push('inRevisions', 'approved', 'rejected');
    }

    const accentMap = {
      contracted: 'from-indigo-500 to-purple-500',
      briefed: 'from-amber-500 to-orange-500',
      delivered: 'from-emerald-500 to-teal-500',
      inRevisions: 'from-amber-500 to-orange-500',
      approved: 'from-blue-500 to-cyan-500',
      rejected: 'from-rose-500 to-red-500',
    };

    metricOrder.forEach((key) => {
      const stat = overviewData.aggregate[key];
      if (!stat) return;
      cards.push({
        key: `overview-${key}`,
        label: overviewMetricLabels[key],
        value: formatSummaryValue(stat),
        description: stat.hasUnknown
          ? 'Includes months with partial reporting.'
          : 'Total across the selected months.',
        accent: accentMap[key] || 'from-slate-500 to-slate-600',
      });
    });

    return cards;
  }, [overviewData, rangeLabel, briefOnly, overviewMetricLabels]);

  const overviewMetricKeys = useMemo(
    () =>
      briefOnly
        ? ['contracted', 'briefed', 'delivered']
        : ['contracted', 'briefed', 'delivered', 'inRevisions', 'approved', 'rejected'],
    [briefOnly],
  );

  const overviewHasUnknown = useMemo(
    () =>
      overviewData?.months?.some((entry) =>
        overviewMetricKeys.some((key) => entry.metrics?.[key]?.hasUnknown),
      ) ?? false,
    [overviewData, overviewMetricKeys],
  );

  const updateRangeStart = (value) => {
    setOverviewRange((prev) => {
      if (!value) {
        return { start: value, end: prev.end };
      }
      if (!prev.end || compareMonthValues(value, prev.end) <= 0) {
        return { start: value, end: prev.end || value };
      }
      return { start: value, end: value };
    });
  };

  const updateRangeEnd = (value) => {
    setOverviewRange((prev) => {
      if (!value) {
        return { start: prev.start, end: value };
      }
      if (!prev.start || compareMonthValues(prev.start, value) <= 0) {
        return { start: prev.start || value, end: value };
      }
      return { start: value, end: value };
    });
  };

  const computeBrandCounts = React.useCallback(
    async ({ brand, targetMonth, briefFilter }) => {
      const monthToUse = targetMonth || month;
      if (!monthToUse) {
        return null;
      }

      let contractedProduction = 0;
      let contractedBrief = 0;
      let briefed = 0;
      let delivered = 0;
      let inRevisions = 0;
      let approved = 0;
      let rejected = 0;
      let publicDashboardSlug =
        typeof brand.publicDashboardSlug === 'string'
          ? brand.publicDashboardSlug.trim()
          : '';

      try {
        let brandId = brand.id;
        let brandCode = brand.code;
        let brandName = brand.name;
        let brandSnap;
        if (brandId) {
          brandSnap = await getDoc(doc(db, 'brands', brandId));
        }
        if ((!brandSnap || !brandSnap.exists()) && brandCode) {
          const q = query(collection(db, 'brands'), where('code', '==', brandCode));
          const snap = await getDocs(q);
          if (!snap.empty) {
            brandSnap = snap.docs[0];
            brandId = brandSnap.id;
          }
        }
        if (brandSnap && brandSnap.exists()) {
          const bData = brandSnap.data() || {};
          brandName = brandName || bData.name;
          if (!brandCode) {
            brandCode = bData.code || brandCode;
          }
          if (!publicDashboardSlug && typeof bData.publicDashboardSlug === 'string') {
            publicDashboardSlug = bData.publicDashboardSlug.trim();
          }
          const contracts = Array.isArray(bData.contracts) ? bData.contracts : [];
          const selected = new Date(`${monthToUse}-01`);
          contracts.forEach((c) => {
            const contractMode =
              typeof c.mode === 'string' ? c.mode.toLowerCase() : 'production';
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
          const startDate = new Date(`${monthToUse}-01`);
          const endDate = new Date(startDate);
          endDate.setMonth(endDate.getMonth() + 1);
          const monthQ = query(
            collection(db, 'adGroups'),
            where('brandCode', '==', brandCode),
            where('month', '==', monthToUse),
          );
          const dueQ = query(
            collection(db, 'adGroups'),
            where('brandCode', '==', brandCode),
            where('dueDate', '>=', Timestamp.fromDate(startDate)),
            where('dueDate', '<', Timestamp.fromDate(endDate)),
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
              gData.reviewVersion ?? gData.reviewType ?? 1,
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
                  ]),
                ),
              ),
            ]);
            const recipeCount = rSnap.data().count || 0;
            briefed += recipeCount;
            const deliveredSet = new Set();
            const revisionSet = new Set();
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
              if (data.status === 'edit_requested') {
                revisionSet.add(key);
              }
            });
            let deliveredCount = deliveredSet.size;
            if (briefFilter && gData.status === 'designed') {
              deliveredCount = Math.max(deliveredCount, recipeCount);
            }
            delivered += deliveredCount;
            inRevisions += revisionSet.size;
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
          (briefFilter || (inRevisions === 0 && approved === 0 && rejected === 0));
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
          inRevisions: briefFilter ? '-' : inRevisions,
          approved: briefFilter ? '-' : approved,
          rejected: briefFilter ? '-' : rejected,
          noteKey,
          publicDashboardSlug,
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
          inRevisions: briefFilter ? '-' : '?',
          approved: briefFilter ? '-' : '?',
          rejected: briefFilter ? '-' : '?',
          noteKey: brand.code || brand.id || '',
          publicDashboardSlug,
        };
      }
    },
    [month],
  );

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
          setBrandSources([]);
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

        const brandEntryMap = new Map();
        statDocs.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const entry = {
            id: docSnap.id,
            code: data.code,
            name: data.name,
            publicDashboardSlug:
              typeof data.publicDashboardSlug === 'string'
                ? data.publicDashboardSlug.trim()
                : '',
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
            brandEntries.map((brand) =>
              computeBrandCounts({
                brand,
                targetMonth: month,
                briefFilter: briefOnly,
              })
            )
          )
        ).filter(Boolean);
        computedResults.sort((a, b) =>
          (a.name || a.code || '').localeCompare(b.name || b.code || '')
        );
        if (active) {
          setRows(computedResults);
          setBrandSources(brandEntries);
        }

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
          setBrandSources([]);
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
  }, [month, agencyId, brandCodes, briefOnly, computeBrandCounts]);

  useEffect(() => {
    if (activeTab !== 'overview') {
      return;
    }

    if (requireFilters && brandCodes.length === 0 && !agencyId) {
      setOverviewLoading(false);
      setOverviewData(null);
      setOverviewError(null);
      return;
    }

    if (!overviewRange.start || !overviewRange.end) {
      setOverviewLoading(false);
      setOverviewData(null);
      setOverviewError(null);
      return;
    }

    const monthsInRange = getMonthsBetween(overviewRange.start, overviewRange.end);
    if (monthsInRange.length === 0) {
      setOverviewLoading(false);
      setOverviewData({ months: [], aggregate: {} });
      setOverviewError(null);
      return;
    }

    let cancelled = false;

    const fetchOverview = async () => {
      setOverviewLoading(true);
      setOverviewError(null);
      try {
        const monthSummaries = [];
        for (const monthKey of monthsInRange) {
          const results = await Promise.all(
            brandSources.map((brand) =>
              computeBrandCounts({
                brand,
                targetMonth: monthKey,
                briefFilter: briefOnly,
              })
            ),
          );
          const metricKeys = ['contracted', 'briefed', 'delivered'];
          if (!briefOnly) {
            metricKeys.push('inRevisions', 'approved', 'rejected');
          }
          const metrics = {};
          metricKeys.forEach((key) => {
            metrics[key] = { total: 0, hasData: false, hasUnknown: false };
          });
          results
            .filter(Boolean)
            .forEach((row) => {
              metricKeys.forEach((key) => {
                const { value, unknown } = parseMetricValue(row[key]);
                if (value !== null) {
                  metrics[key].total += value;
                  metrics[key].hasData = true;
                } else if (unknown) {
                  metrics[key].hasUnknown = true;
                }
              });
            });
          monthSummaries.push({ month: monthKey, metrics });
        }

        const aggregate = monthSummaries.reduce((acc, entry) => {
          Object.entries(entry.metrics).forEach(([key, metric]) => {
            if (!acc[key]) {
              acc[key] = { total: 0, hasData: false, hasUnknown: false };
            }
            if (metric.hasData) {
              acc[key].total += metric.total;
              acc[key].hasData = true;
            }
            if (metric.hasUnknown) {
              acc[key].hasUnknown = true;
            }
          });
          return acc;
        }, {});

        if (!cancelled) {
          setOverviewData({ months: monthSummaries, aggregate });
        }
      } catch (err) {
        console.error('Failed to load dashboard overview', err);
        if (!cancelled) {
          setOverviewError('Failed to load trends. Please try again.');
          setOverviewData(null);
        }
      } finally {
        if (!cancelled) {
          setOverviewLoading(false);
        }
      }
    };

    fetchOverview();

    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    overviewRange.start,
    overviewRange.end,
    briefOnly,
    brandSources,
    computeBrandCounts,
    requireFilters,
    brandCodes,
    agencyId,
  ]);

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
      className={`rounded-full px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-0 ${
        active
          ? 'bg-[var(--accent-color)] text-white shadow-sm'
          : 'text-gray-600 hover:bg-[var(--accent-color-10)] dark:text-gray-300 dark:hover:bg-[var(--accent-color-10)]/40'
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
                {requireFilters ? 'Dashboard' : 'Admin dashboard'}
              </h1>
              {headerSubtitle && (
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{headerSubtitle}</p>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-4">
              {activeTab === 'brands' ? (
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-300">
                    Month
                  </span>
                  <div className="mt-2">
                    <MonthSelector
                      value={month}
                      onChange={setMonth}
                      inputClassName="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-[var(--dark-text)] dark:focus:border-[var(--accent-color)] dark:focus:ring-[var(--accent-color)]/30"
                      inputProps={{ 'aria-label': 'Select month' }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-4">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-300">
                      Start month
                    </span>
                    <div className="mt-2">
                      <MonthSelector
                        value={overviewRange.start}
                        onChange={updateRangeStart}
                        showButton={false}
                        inputClassName="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-[var(--dark-text)] dark:focus:border-[var(--accent-color)] dark:focus:ring-[var(--accent-color)]/30"
                        inputProps={{
                          'aria-label': 'Select start month',
                          max: overviewRange.end || undefined,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-300">
                      End month
                    </span>
                    <div className="mt-2">
                      <MonthSelector
                        value={overviewRange.end}
                        onChange={updateRangeEnd}
                        showButton={false}
                        inputClassName="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-[var(--dark-text)] dark:focus:border-[var(--accent-color)] dark:focus:ring-[var(--accent-color)]/30"
                        inputProps={{
                          'aria-label': 'Select end month',
                          min: overviewRange.start || undefined,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
              <div>
                <div
                  className="mt-2 inline-flex items-center gap-1 rounded-full border border-[var(--accent-color-10)] bg-[var(--accent-color-10)]/40 p-1 text-sm font-medium dark:border-[var(--accent-color-10)]/50 dark:bg-[var(--accent-color-10)]/20"
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

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <TabButton
              type="button"
              active={activeTab === 'brands'}
              onClick={() => setActiveTab('brands')}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeTab === 'brands'
                  ? 'shadow-sm'
                  : 'border-transparent text-gray-600 hover:bg-[var(--accent-color-10)]/50 dark:text-gray-300'
              }`}
            >
              <FiTable className="h-4 w-4" aria-hidden="true" />
              <span>Brand metrics</span>
            </TabButton>
            <TabButton
              type="button"
              active={activeTab === 'overview'}
              onClick={() => setActiveTab('overview')}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeTab === 'overview'
                  ? 'shadow-sm'
                  : 'border-transparent text-gray-600 hover:bg-[var(--accent-color-10)]/50 dark:text-gray-300'
              }`}
            >
              <FiBarChart2 className="h-4 w-4" aria-hidden="true" />
              <span>Range trends</span>
            </TabButton>
          </div>
        </div>

        {activeTab === 'brands' ? (
          <>
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
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent-color)]" aria-hidden="true" />
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
                <thead className="sticky top-0 z-10 bg-white shadow-sm dark:bg-[var(--dark-sidebar-bg)]">
                  <tr>
                    <th>Brand</th>
                    <th className="metric-col">Contracted</th>
                    <th className="metric-col">Briefed</th>
                    <th className="metric-col">Delivered</th>
                    {!briefOnly && <th className="metric-col">In Revisions</th>}
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
                        accent = 'bg-[var(--approve-color)] dark:bg-[var(--approve-color)]/80',
                        textClass = '',
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
                      const progressWidth = clampedRatio !== null ? Math.min(clampedRatio, 100) : 0;
                      return (
                        <td className="metric-col align-middle text-center" data-label={label}>
                          <div className="flex flex-col items-center gap-1">
                            <span
                              className={`text-base font-semibold text-gray-900 dark:text-gray-100 ${textClass}`.trim()}
                            >
                              {formatMetricDisplay(rawValue)}
                            </span>
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
                        <td data-label="Brand" className="align-middle">
                          <div className="flex items-center gap-3">
                            {r.publicDashboardSlug ? (
                              <Link
                                to={`/${r.publicDashboardSlug}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-gray-500 transition hover:border-[var(--accent-color)] hover:text-[var(--accent-color)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 dark:border-[var(--border-color-default)] dark:text-gray-300 dark:hover:border-[var(--accent-color)] dark:hover:text-[var(--accent-color)] dark:focus-visible:ring-offset-0"
                                title="Open public dashboard"
                              >
                                <FiHome className="h-4 w-4" aria-hidden="true" />
                                <span className="sr-only">
                                  View public dashboard for {r.name || r.code || 'this brand'}
                                </span>
                              </Link>
                            ) : (
                              <span
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-300 dark:border-[var(--border-color-default)] dark:text-gray-500"
                                aria-hidden="true"
                              >
                                <FiHome className="h-4 w-4" />
                              </span>
                            )}
                            {r.code ? (
                              <Link
                                to={`${adGroupListPath}?brandCode=${encodeURIComponent(r.code)}`}
                                className="inline-flex flex-wrap items-center gap-2 font-semibold text-gray-900 transition hover:text-[var(--accent-color)] dark:text-gray-100 dark:hover:text-[var(--accent-color)]"
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
                          </div>
                        </td>
                        {renderMetricCell('contracted', 'Contracted', { showProgress: false })}
                        {renderMetricCell('briefed', 'Briefed')}
                        {renderMetricCell('delivered', 'Delivered')}
                        {!briefOnly &&
                          renderMetricCell('inRevisions', 'In Revisions', {
                            accent: 'bg-amber-500 dark:bg-amber-400',
                          })}
                        {!briefOnly && renderMetricCell('approved', 'Approved')}
                        {!briefOnly &&
                          renderMetricCell('rejected', 'Rejected', {
                            showProgress: false,
                            textClass: 'text-reject',
                          })}
                        <td className="notes-cell align-middle" data-label="Notes">
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
                              className="dashboard-note-input w-full resize-y rounded-lg border border-gray-300 bg-white text-sm leading-relaxed text-gray-900 shadow-sm transition focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-[var(--dark-text)] dark:focus:border-[var(--accent-color)] dark:focus:ring-[var(--accent-color)]/30 dark:disabled:border-[var(--border-color-default)] dark:disabled:bg-[var(--dark-sidebar-hover)] dark:disabled:text-gray-400"
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
          </>
        ) : (
          <div className="flex flex-col gap-6">
            {overviewError && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
                {overviewError}
              </div>
            )}

            {overviewLoading ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
                <div className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent-color)]" aria-hidden="true" />
                  Loading range insights…
                </div>
              </div>
            ) : overviewData?.months?.length ? (
              <>
                {overviewCards.length > 0 && (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {overviewCards.map((card) => (
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

                <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
                  <div className="flex flex-col gap-2 pb-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Monthly momentum</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Track how production shifts over time and spot trends across the shared range.
                    </p>
                  </div>
                  <DashboardTotalsChart entries={overviewData.months} briefOnly={briefOnly} />
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Monthly totals</h2>
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full table-fixed text-sm">
                      <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-300">
                        <tr>
                          <th className="px-4 py-3">Month</th>
                          {overviewMetricKeys.map((key) => (
                            <th key={key} className="px-4 py-3 text-center">
                              {overviewMetricLabels[key]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {overviewData.months.map((entry) => (
                          <tr
                            key={entry.month}
                            className="border-t border-gray-100 text-sm text-gray-700 dark:border-[var(--border-color-default)] dark:text-gray-200"
                          >
                            <th scope="row" className="px-4 py-3 text-left font-medium text-gray-900 dark:text-gray-100">
                              {formatMonthLabel(entry.month)}
                            </th>
                            {overviewMetricKeys.map((key) => {
                              const metric = entry.metrics?.[key];
                              return (
                                <td key={`${entry.month}-${key}`} className="px-4 py-3 text-center">
                                  {metric ? formatSummaryValue(metric) : '—'}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {overviewHasUnknown && (
                    <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                      Months with incomplete reporting show an em dash for the affected metrics.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  No data for this range
                </h2>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  Try expanding the range or switch back to the brand view for a different month.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}

export default AdminDashboard;
