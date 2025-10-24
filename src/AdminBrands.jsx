import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArchive, FiEdit2, FiRotateCcw, FiTrash } from 'react-icons/fi';
import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db, auth } from './firebase/config';
import useUserRole from './useUserRole';
import createArchiveTicket from './utils/createArchiveTicket';
import useAgencies from './useAgencies';
import IconButton from './components/IconButton.jsx';
import TabButton from './components/TabButton.jsx';
import PageToolbar from './components/PageToolbar.jsx';
import CreateButton from './components/CreateButton.jsx';
import BrandCard from './components/BrandCard.jsx';

const AdminBrands = () => {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const user = auth.currentUser;
  const { role, brandCodes } = useUserRole(user?.uid);
  const isAdmin = role === 'admin';
  const isManager = role === 'manager' || role === 'editor';
  const { agencies } = useAgencies();
  const agencyMap = useMemo(
    () => Object.fromEntries(agencies.map((agency) => [agency.id, agency.name])),
    [agencies]
  );

  useEffect(() => {
    const fetchBrands = async () => {
      setLoading(true);
      try {
        const base = collection(db, 'brands');
        let docs = [];
        if (role === 'project-manager') {
          if (!brandCodes || brandCodes.length === 0) {
            setBrands([]);
            setLoading(false);
            return;
          }
          for (let i = 0; i < brandCodes.length; i += 10) {
            const chunk = brandCodes.slice(i, i + 10);
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
  }, [role, brandCodes]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this brand?')) return;
    try {
      await deleteDoc(doc(db, 'brands', id));
      setBrands((prev) => prev.filter((brand) => brand.id !== id));
    } catch (err) {
      console.error('Failed to delete brand', err);
    }
  };

  const handleArchive = async (id) => {
    if (!window.confirm('Archive this brand?')) return;
    try {
      const brand = brands.find((b) => b.id === id);
      await updateDoc(doc(db, 'brands', id), {
        archived: true,
        archivedAt: serverTimestamp(),
        archivedBy: auth.currentUser?.uid || null,
      });
      setBrands((prev) =>
        prev.map((b) => (b.id === id ? { ...b, archived: true } : b))
      );
      if (brand) {
        await createArchiveTicket({ target: 'brand', brandId: id, brandCode: brand.code });
      }
    } catch (err) {
      console.error('Failed to archive brand', err);
    }
  };

  const handleRestore = async (id) => {
    try {
      await updateDoc(doc(db, 'brands', id), {
        archived: false,
        archivedAt: null,
        archivedBy: null,
      });
      setBrands((prev) =>
        prev.map((b) => (b.id === id ? { ...b, archived: false } : b))
      );
    } catch (err) {
      console.error('Failed to restore brand', err);
    }
  };

  const displayBrands = useMemo(() => {
    const term = filter.trim().toLowerCase();
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
  }, [agencyMap, brands, filter, showArchived]);

  const hasFilter = Boolean(filter.trim());

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
                    Browse every brand, search quickly, and jump into a brand to manage assets, campaigns, and settings.
                  </p>
                </div>
                <CreateButton
                  as={Link}
                  to="/admin/brands/new"
                  ariaLabel="Create brand"
                  className="self-start"
                >
                  <span className="hidden sm:inline">New Brand</span>
                </CreateButton>
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
                        to={`/admin/brands/${brand.id}`}
                        className="group block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[var(--dark-sidebar)]"
                      >
                        <BrandCard brand={brand} />
                      </Link>
                      {brand.archived && (
                        <span className="absolute left-3 top-3 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium uppercase tracking-wide text-amber-700 shadow-sm dark:bg-amber-500/10 dark:text-amber-200">
                          Archived
                        </span>
                      )}
                      <div className="absolute top-2 right-2 flex flex-col gap-2">
                        <IconButton
                          as={Link}
                          to={`/admin/brands/${brand.id}/edit`}
                          aria-label={`Edit ${brand.name || brand.code || 'brand'}`}
                          className="bg-white shadow-sm dark:bg-[var(--dark-sidebar)]"
                        >
                          <FiEdit2 />
                        </IconButton>
                        {(isAdmin || isManager) && (
                          brand.archived ? (
                            <IconButton
                              onClick={() => handleRestore(brand.id)}
                              aria-label={`Restore ${brand.name || brand.code || 'brand'}`}
                              className="bg-white shadow-sm dark:bg-[var(--dark-sidebar)]"
                            >
                              <FiRotateCcw />
                            </IconButton>
                          ) : (
                            <IconButton
                              onClick={() => handleArchive(brand.id)}
                              aria-label={`Archive ${brand.name || brand.code || 'brand'}`}
                              className="bg-white shadow-sm dark:bg-[var(--dark-sidebar)]"
                            >
                              <FiArchive />
                            </IconButton>
                          )
                        )}
                        {isAdmin && (
                          <IconButton
                            onClick={() => handleDelete(brand.id)}
                            aria-label={`Delete ${brand.name || brand.code || 'brand'}`}
                            className="bg-white shadow-sm text-red-600 hover:text-red-700 dark:bg-[var(--dark-sidebar)] dark:text-red-400 dark:hover:text-red-300"
                          >
                            <FiTrash />
                          </IconButton>
                        )}
                      </div>
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

export default AdminBrands;
