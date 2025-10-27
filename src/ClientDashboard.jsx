import React, { useEffect, useState, useMemo } from 'react';
import ReviewGroupCard from './components/ReviewGroupCard.jsx';
import summarizeByRecipe from './utils/summarizeByRecipe.js';
import summarizeAdUnits from './utils/summarizeAdUnits.js';
import { db } from './firebase/config';
import getPrimaryLogoUrl from './utils/getPrimaryLogoUrl.js';
import {
  AlertTriangle,
  Calendar,
  RotateCcw,
  Search,
  Sparkles,
} from 'lucide-react';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  limit,
  onSnapshot,
} from 'firebase/firestore';

const ClientDashboard = ({ user, brandCodes = [] }) => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasNegativeCredits, setHasNegativeCredits] = useState(false);
  const [brandLogos, setBrandLogos] = useState({});
  const [filter, setFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');

  const months = useMemo(
    () =>
      Array.from(new Set(groups.map((g) => g.month).filter(Boolean))).sort(),
    [groups]
  );
  const filteredGroups = useMemo(
    () =>
      groups.filter(
        (g) =>
          g.name.toLowerCase().includes(filter.toLowerCase()) &&
          (!monthFilter || g.month === monthFilter)
      ),
    [groups, filter, monthFilter]
  );

  const hasActiveFilters = Boolean(filter.trim()) || Boolean(monthFilter);

  useEffect(() => {
    if (brandCodes.length === 0) {
      setHasNegativeCredits(false);
      setBrandLogos({});
      return;
    }
    const checkCredits = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'brands'), where('code', 'in', brandCodes))
        );
        const negative = snap.docs.some(
          (d) => (d.data().credits ?? 0) < 0
        );
        setHasNegativeCredits(negative);
        const logos = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          const primaryLogo = getPrimaryLogoUrl(data.logos);
          logos[data.code] = primaryLogo || data.logoUrl || '';
        });
        setBrandLogos(logos);
      } catch (err) {
        console.error('Failed to check brand credits', err);
        setHasNegativeCredits(false);
        setBrandLogos({});
      }
    };
    checkCredits();
  }, [brandCodes]);

  useEffect(() => {
    if (!user?.uid || brandCodes.length === 0) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, 'adGroups'),
      where('brandCode', 'in', brandCodes)
    );

    const unsub = onSnapshot(
      q,
      async (snap) => {
        try {
          const list = await Promise.all(
            snap.docs.map(async (d) => {
            const data = d.data();
            const group = {
              id: d.id,
              ...data,
              thumbnail: data.thumbnailUrl || '',
              lastUpdated: data.lastUpdated?.toDate
                ? data.lastUpdated.toDate()
                : null,
              counts: {
                reviewed: data.reviewedCount || 0,
                approved: data.approvedCount || 0,
                archived: data.archivedCount || 0,
                edit: data.editCount || 0,
                rejected: data.rejectedCount || 0,
              },
            };

            let previewSnap;
            try {
              previewSnap = await getDocs(
                query(
                  collection(db, 'adGroups', d.id, 'assets'),
                  where('aspectRatio', '==', '1x1'),
                  limit(3)
                )
              );
            } catch (err) {
              console.error('Failed to load preview ads', err);
              previewSnap = { docs: [] };
            }
            group.previewAds = previewSnap.docs.map((adDoc) => ({
              id: adDoc.id,
              ...adDoc.data(),
            }));
            group.showLogo =
              group.previewAds.length === 0 ||
              group.previewAds.every((a) => a.status === 'pending');
            group.brandLogo = brandLogos[group.brandCode] || '';
            if (!group.brandLogo && group.showLogo) {
              try {
                const brandSnap = await getDocs(
                  query(
                    collection(db, 'brands'),
                    where('code', '==', group.brandCode),
                    limit(1)
                  )
                );
                const brandData = brandSnap.docs[0]?.data();
                const fallbackLogo = getPrimaryLogoUrl(brandData?.logos);
                group.brandLogo = fallbackLogo || brandData?.logoUrl || '';
              } catch (err) {
                console.error('Failed to load brand logo', err);
              }
            }

            let unitSnap;
            try {
              unitSnap = await getDocs(
                collection(db, 'adGroups', d.id, 'adUnits')
              );
            } catch (err) {
              console.error('Failed to load ad units', err);
              unitSnap = { docs: [] };
            }

            let summary;
            if (unitSnap.docs.length > 0) {
              const units = unitSnap.docs.map((u) => u.data());
              summary = summarizeAdUnits(units);
              group.totalAds = unitSnap.docs.length;
            } else {
              let assetSnap;
              try {
                assetSnap = await getDocs(
                  collection(db, 'adGroups', d.id, 'assets')
                );
              } catch (err) {
                console.error('Failed to load group assets', err);
                assetSnap = { docs: [] };
              }
              summary = summarizeByRecipe(
                assetSnap.docs.map((adDoc) => adDoc.data())
              );
              group.totalAds = assetSnap.docs.length;
            }

            group.thumbnail = group.thumbnail || summary.thumbnail;
            group.counts = {
              reviewed: summary.reviewed,
              approved: summary.approved,
              archived: summary.archived,
              edit: summary.edit,
              rejected: summary.rejected,
            };

            const needsSummary =
              !data.thumbnailUrl ||
              data.reviewedCount !== summary.reviewed ||
              data.approvedCount !== summary.approved ||
              data.archivedCount !== summary.archived ||
              data.editCount !== summary.edit ||
              data.rejectedCount !== summary.rejected;

            if (needsSummary) {
              try {
                const update = {
                  reviewedCount: summary.reviewed,
                  approvedCount: summary.approved,
                  archivedCount: summary.archived,
                  editCount: summary.edit,
                  rejectedCount: summary.rejected,
                  ...(data.thumbnailUrl
                    ? {}
                    : summary.thumbnail
                    ? { thumbnailUrl: summary.thumbnail }
                    : {}),
                };
                await updateDoc(doc(db, 'adGroups', d.id), update);
              } catch (err) {
                console.error('Failed to update group summary', err);
              }
            }

            return group;
          })
        );
          setGroups(
            list.filter(
              (g) =>
                g.status !== 'archived' &&
                (['designed', 'reviewed', 'done'].includes(g.status) ||
                  g.visibility === 'public')
            )
          );
          setLoading(false);
        } catch (err) {
          console.error('Failed to fetch groups', err);
          setGroups([]);
          setLoading(false);
        }
      },
      (err) => {
        console.error('Failed to fetch groups', err);
        setGroups([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [brandCodes, user]);

  useEffect(() => {
    if (Object.keys(brandLogos).length === 0) return;
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        brandLogo: brandLogos[g.brandCode] || g.brandLogo || '',
      }))
    );
  }, [brandLogos]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/60 py-10 dark:from-[#0b1220] dark:via-[#0f172a] dark:to-[#1d1b39]">
      <div className="mx-auto flex min-h-[70vh] max-w-6xl flex-col gap-8 px-4 sm:px-6 lg:px-8">
        {hasNegativeCredits && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4 text-amber-900 shadow-sm backdrop-blur dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">Negative credit balance</p>
              <p className="text-sm text-amber-700 dark:text-amber-100/80">
                Your credit balance is negative. Please add more credits.
              </p>
            </div>
          </div>
        )}

        <header className="flex flex-col gap-3 text-center md:text-left">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-500 dark:text-indigo-300">
            Campaign overview
          </p>
          <div>
            <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl dark:text-white">
              Your active ad groups
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
              Stay on top of every review cycle. Filter groups by name or month to quickly find the creative work that needs your attention.
            </p>
          </div>
        </header>

        <section className="rounded-3xl border border-slate-200/70 bg-white/70 p-6 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/70">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="flex w-full flex-col gap-2 md:max-w-lg">
              <label htmlFor="dashboard-group-search" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Search
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  id="dashboard-group-search"
                  type="text"
                  placeholder="Search by ad group name"
                  className="w-full rounded-2xl border border-slate-200 bg-white/90 py-3 pl-10 pr-4 text-sm text-slate-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400/30"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 md:max-w-xs">
              <label htmlFor="dashboard-month-filter" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Month
              </label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <select
                  id="dashboard-month-filter"
                  className="w-full appearance-none rounded-2xl border border-slate-200 bg-white/90 py-3 pl-10 pr-8 text-sm text-slate-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-400/30"
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                >
                  <option value="">All months</option>
                  {months.map((m) => {
                    const label = new Date(
                      Number(m.slice(0, 4)),
                      Number(m.slice(-2)) - 1,
                      1
                    ).toLocaleString('default', {
                      month: 'short',
                      year: 'numeric',
                    });
                    return (
                      <option key={m} value={m}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setFilter('');
                  setMonthFilter('');
                }}
                className="inline-flex items-center justify-center gap-2 self-start rounded-full border border-indigo-100 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-600 shadow-sm transition hover:bg-indigo-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-indigo-400/40 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Reset filters
              </button>
            )}
          </div>
        </section>

        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white/60 shadow-sm backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/60"
              >
                <div className="h-40 w-full animate-pulse bg-slate-100 dark:bg-slate-800" />
                <div className="space-y-3 p-5">
                  <div className="h-4 w-1/2 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
                  <div className="flex gap-2">
                    <div className="h-3 w-20 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
                    <div className="h-3 w-16 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-slate-300/70 bg-white/80 p-12 text-center shadow-inner backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/70">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-indigo-500 shadow-sm dark:bg-indigo-500/20 dark:text-indigo-200">
              <Sparkles className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">No ad groups found</h2>
              <p className="max-w-md text-sm text-slate-600 dark:text-slate-300">
                Try adjusting your search or choose a different month to discover more ad groups ready for review.
              </p>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setFilter('');
                  setMonthFilter('');
                }}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-5 py-2 text-sm font-medium text-indigo-600 shadow-sm transition hover:bg-indigo-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-indigo-400/40 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {filteredGroups.map((g) => (
              <ReviewGroupCard key={g.id} group={g} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientDashboard;
