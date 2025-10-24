import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import useUserRole from './useUserRole';
import BrandCard from './components/BrandCard.jsx';
import PageToolbar from './components/PageToolbar.jsx';

const chunkArray = (values = [], size = 10) => {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
};

const normalizeBrands = (docs = []) => {
  const seen = new Set();
  return docs
    .filter((docSnap) => {
      if (seen.has(docSnap.id)) return false;
      seen.add(docSnap.id);
      return true;
    })
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
};

const BrandDirectory = () => {
  const user = auth.currentUser;
  const { brandCodes } = useUserRole(user?.uid);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const fetchBrands = async () => {
      const codes = Array.isArray(brandCodes) ? brandCodes.filter(Boolean) : [];
      if (codes.length === 0) {
        setBrands([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const base = collection(db, 'brands');
        const docs = [];
        for (const chunk of chunkArray(codes)) {
          const snap = await getDocs(query(base, where('code', 'in', chunk)));
          docs.push(...snap.docs);
        }
        setBrands(normalizeBrands(docs));
      } catch (err) {
        console.error('Failed to fetch brands', err);
        setBrands([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBrands();
  }, [brandCodes]);

  const displayBrands = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return [...brands]
      .filter((brand) => {
        if (!term) return true;
        const values = [brand.name, brand.code, brand.toneOfVoice, brand.offering]
          .map((value) => (value ? String(value).toLowerCase() : ''));
        return values.some((value) => value.includes(term));
      })
      .sort((a, b) => {
        const nameA = (a.name || a.code || '').toLowerCase();
        const nameB = (b.name || b.code || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
  }, [brands, filter]);

  const hasFilter = Boolean(filter.trim());
  const hasAccess = Array.isArray(brandCodes) && brandCodes.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[var(--dark-bg)]">
      <div className="px-4 py-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
            <div className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Brand Directory</h1>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Browse your brands, then open one to review setup details, tone, assets, and campaigns.
                  </p>
                </div>
              </div>
              <PageToolbar
                left={
                  <input
                    type="search"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Search brands"
                    aria-label="Search brands"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)] dark:text-gray-200"
                  />
                }
                right={null}
              />
              {!hasAccess ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-400">
                  You don&apos;t have access to any brands yet. Contact your administrator for help.
                </div>
              ) : loading ? (
                <div className="flex justify-center py-12 text-sm text-gray-500 dark:text-gray-400">
                  Loading brands...
                </div>
              ) : displayBrands.length ? (
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {displayBrands.map((brand) => (
                    <Link
                      key={brand.id}
                      to={`/brand-profile/${brand.id}`}
                      className="group block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[var(--dark-sidebar)]"
                    >
                      <BrandCard brand={brand} />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-400">
                  {hasFilter ? (
                    <p className="mb-0">No brands match “{filter.trim()}”. Try a different search term.</p>
                  ) : (
                    <p className="mb-0">No brands available yet.</p>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default BrandDirectory;
