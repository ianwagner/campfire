import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArchive } from 'react-icons/fi';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import useUserRole from './useUserRole';
import useAgencies from './useAgencies';
import TabButton from './components/TabButton.jsx';
import PageToolbar from './components/PageToolbar.jsx';
import CreateButton from './components/CreateButton.jsx';
import BrandCard from './components/BrandCard.jsx';

const chunkArray = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const BrandDirectory = ({
  title = 'Brand Directory',
  description = 'Browse every brand, search quickly, and jump into a brand to manage assets, campaigns, and settings.',
  basePathOverride,
  showCreateOverride,
}) => {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const user = auth.currentUser;
  const { role, brandCodes, agencyId } = useUserRole(user?.uid);
  const { agencies } = useAgencies();

  const agencyMap = useMemo(
    () => Object.fromEntries(agencies.map((agency) => [agency.id, agency.name])),
    [agencies]
  );

  useEffect(() => {
    if (!role) return;

    const fetchBrands = async () => {
      setLoading(true);
      try {
        const base = collection(db, 'brands');
        let docs = [];

        if (role === 'ops') {
          if (agencyId) {
            const snap = await getDocs(query(base, where('agencyId', '==', agencyId)));
            docs = snap.docs;
          } else if (brandCodes && brandCodes.length) {
            const chunks = chunkArray(brandCodes, 10);
            for (const chunk of chunks) {
              const snap = await getDocs(query(base, where('code', 'in', chunk)));
              docs.push(...snap.docs);
            }
          } else {
            setBrands([]);
            setLoading(false);
            return;
          }
        } else if (
          (role === 'project-manager' || role === 'editor') &&
          (!brandCodes || brandCodes.length === 0)
        ) {
          setBrands([]);
          setLoading(false);
          return;
        } else if (role === 'project-manager' || role === 'editor') {
          const chunks = chunkArray(brandCodes, 10);
          for (const chunk of chunks) {
            const snap = await getDocs(query(base, where('code', 'in', chunk)));
            docs.push(...snap.docs);
          }
        } else {
          const snap = await getDocs(base);
          docs = snap.docs;
        }

        const seen = new Set();
        const list = docs
          .filter((docSnap) => {
            if (seen.has(docSnap.id)) return false;
            seen.add(docSnap.id);
            return true;
          })
          .map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              ...data,
              credits: typeof data.credits === 'number' ? data.credits : 0,
            };
          });

        setBrands(list);
      } catch (err) {
        console.error('Failed to fetch brands', err);
        setBrands([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBrands();
  }, [agencyId, brandCodes, role]);

  const term = filter.trim().toLowerCase();

  const displayBrands = useMemo(() => {
    return [...brands]
      .filter((brand) => {
        if (!showArchived && brand.archived) return false;
        if (!term) return true;
        const values = [
          brand.name,
          brand.code,
          brand.description,
          brand.agencyId,
          agencyMap[brand.agencyId],
        ];
        return values.some((value) =>
          value ? String(value).toLowerCase().includes(term) : false
        );
      })
      .sort((a, b) => {
        const nameA = (a.name || a.code || '').toLowerCase();
        const nameB = (b.name || b.code || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
  }, [agencyMap, brands, showArchived, term]);

  const hasFilter = Boolean(term);
  const canCreate = showCreateOverride ?? ['admin', 'manager', 'project-manager'].includes(role);
  const basePath =
    basePathOverride ||
    (role === 'editor' ? '/editor/brands' : role === 'ops' ? '/ops/brands' : '/admin/brands');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[var(--dark-bg)]">
      <div className="px-4 py-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
            <div className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{description}</p>
                </div>
                {canCreate && (
                  <CreateButton
                    as={Link}
                    to="/admin/brands/new"
                    ariaLabel="Create brand"
                    className="self-start"
                  >
                    <span className="hidden sm:inline">New Brand</span>
                  </CreateButton>
                )}
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
                right={
                  <TabButton
                    type="button"
                    active={showArchived}
                    onClick={() => setShowArchived((prev) => !prev)}
                    aria-label={showArchived ? 'Hide archived brands' : 'Show archived brands'}
                    className="text-sm"
                  >
                    <FiArchive className="shrink-0" />
                    <span>{showArchived ? 'Showing archived' : 'Show archived'}</span>
                  </TabButton>
                }
              />
              {loading ? (
                <div className="flex justify-center py-12 text-sm text-gray-500 dark:text-gray-400">
                  Loading brands...
                </div>
              ) : displayBrands.length ? (
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {displayBrands.map((brand) => (
                    <div key={brand.id} className="relative">
                      <Link
                        to={`${basePath}/${brand.id}`}
                        className="group block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[var(--dark-sidebar)]"
                      >
                        <BrandCard brand={brand} />
                      </Link>
                      {brand.archived && (
                        <span className="absolute left-3 top-3 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium uppercase tracking-wide text-amber-700 shadow-sm dark:bg-amber-500/10 dark:text-amber-200">
                          Archived
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-400">
                  {hasFilter ? (
                    <p className="mb-0">No brands match “{filter.trim()}”. Try a different search term.</p>
                  ) : showArchived ? (
                    <p className="mb-0">No archived brands to display.</p>
                  ) : (
                    <p className="mb-0">No brands created yet. Use the New Brand button to get started.</p>
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
