import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArchive, FiGrid, FiHome, FiList } from 'react-icons/fi';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import useUserRole from './useUserRole';
import useAgencies from './useAgencies';
import TabButton from './components/TabButton.jsx';
import PageToolbar from './components/PageToolbar.jsx';
import CreateButton from './components/CreateButton.jsx';
import BrandCard from './components/BrandCard.jsx';
import Table from './components/common/Table.jsx';
import getUserDisplayName from './utils/getUserDisplayName.js';

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
  const [view, setView] = useState('grid');
  const [designers, setDesigners] = useState([]);
  const [editors, setEditors] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [assignmentDrafts, setAssignmentDrafts] = useState({});
  const [savingAssignments, setSavingAssignments] = useState({});
  const [assignmentMessages, setAssignmentMessages] = useState({});
  const [assignmentErrors, setAssignmentErrors] = useState({});

  const user = auth.currentUser;
  const { role, brandCodes, agencyId } = useUserRole(user?.uid);
  const { agencies } = useAgencies();

  const agencyMap = useMemo(
    () => Object.fromEntries(agencies.map((agency) => [agency.id, agency.name])),
    [agencies]
  );

  const canManageStaffAssignments = ['admin', 'project-manager'].includes(role);

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

  useEffect(() => {
    if (!canManageStaffAssignments) {
      setDesigners([]);
      setEditors([]);
      setLoadingStaff(false);
      setAssignmentDrafts({});
      setAssignmentMessages({});
      setAssignmentErrors({});
      return;
    }

    let active = true;
    const loadStaff = async () => {
      setLoadingStaff(true);
      try {
        const [designerSnap, editorSnap] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('role', '==', 'designer'))),
          getDocs(query(collection(db, 'users'), where('role', '==', 'editor'))),
        ]);
        if (!active) return;
        const designerList = designerSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const editorList = editorSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        designerList.sort((a, b) => getUserDisplayName(a).localeCompare(getUserDisplayName(b)));
        editorList.sort((a, b) => getUserDisplayName(a).localeCompare(getUserDisplayName(b)));
        setDesigners(designerList);
        setEditors(editorList);
      } catch (err) {
        console.error('Failed to load staff options for brand directory', err);
        if (active) {
          setDesigners([]);
          setEditors([]);
        }
      } finally {
        if (active) setLoadingStaff(false);
      }
    };

    loadStaff();

    return () => {
      active = false;
    };
  }, [canManageStaffAssignments]);

  const brandById = useMemo(
    () => Object.fromEntries(brands.map((brand) => [brand.id, brand])),
    [brands]
  );

  useEffect(() => {
    if (!canManageStaffAssignments) return;

    setAssignmentDrafts((prev) => {
      const next = {};
      brands.forEach((brand) => {
        const originalDesigner = typeof brand.defaultDesignerId === 'string' ? brand.defaultDesignerId : '';
        const originalEditor = typeof brand.defaultEditorId === 'string' ? brand.defaultEditorId : '';
        const existing = prev[brand.id];
        if (existing && existing.dirty) {
          next[brand.id] = existing;
        } else {
          next[brand.id] = {
            designerId: originalDesigner,
            editorId: originalEditor,
            dirty: false,
          };
        }
      });
      return next;
    });
    setAssignmentMessages((prev) => {
      const validIds = new Set(brands.map((brand) => brand.id));
      return Object.fromEntries(
        Object.entries(prev).filter(([id]) => validIds.has(id))
      );
    });
    setAssignmentErrors((prev) => {
      const validIds = new Set(brands.map((brand) => brand.id));
      return Object.fromEntries(
        Object.entries(prev).filter(([id]) => validIds.has(id))
      );
    });
  }, [brands, canManageStaffAssignments]);

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

  const handleDraftChange = (brandId, field, value) => {
    if (!canManageStaffAssignments) return;
    const brand = brandById[brandId];
    if (!brand) return;
    const originalDesigner = typeof brand.defaultDesignerId === 'string' ? brand.defaultDesignerId : '';
    const originalEditor = typeof brand.defaultEditorId === 'string' ? brand.defaultEditorId : '';
    const normalizedValue = value || '';
    setAssignmentDrafts((prev) => {
      const prevDraft = prev[brandId] ?? {
        designerId: originalDesigner,
        editorId: originalEditor,
        dirty: false,
      };
      const nextDraft = {
        ...prevDraft,
        [field]: normalizedValue,
      };
      nextDraft.dirty =
        nextDraft.designerId !== originalDesigner || nextDraft.editorId !== originalEditor;
      return {
        ...prev,
        [brandId]: nextDraft,
      };
    });
    setAssignmentMessages((prev) => {
      if (!prev[brandId]) return prev;
      const { [brandId]: _removed, ...rest } = prev;
      return rest;
    });
    setAssignmentErrors((prev) => {
      if (!prev[brandId]) return prev;
      const { [brandId]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const handleSaveAssignments = async (brandId) => {
    if (!canManageStaffAssignments) return;
    const brand = brandById[brandId];
    const draft = assignmentDrafts[brandId];
    if (!brand || !draft || !draft.dirty) return;

    const normalizedDesigner = draft.designerId || '';
    const normalizedEditor = draft.editorId || '';

    setSavingAssignments((prev) => ({ ...prev, [brandId]: true }));
    setAssignmentErrors((prev) => {
      if (!prev[brandId]) return prev;
      const { [brandId]: _removed, ...rest } = prev;
      return rest;
    });
    setAssignmentMessages((prev) => {
      if (!prev[brandId]) return prev;
      const { [brandId]: _removed, ...rest } = prev;
      return rest;
    });

    try {
      await updateDoc(doc(db, 'brands', brandId), {
        defaultDesignerId: normalizedDesigner || null,
        defaultEditorId: normalizedEditor || null,
      });
      setBrands((prev) =>
        prev.map((item) =>
          item.id === brandId
            ? {
                ...item,
                defaultDesignerId: normalizedDesigner || null,
                defaultEditorId: normalizedEditor || null,
              }
            : item,
        ),
      );
      setAssignmentDrafts((prev) => ({
        ...prev,
        [brandId]: {
          designerId: normalizedDesigner,
          editorId: normalizedEditor,
          dirty: false,
        },
      }));
      setAssignmentMessages((prev) => ({
        ...prev,
        [brandId]: 'Staff assignments updated.',
      }));
    } catch (err) {
      console.error('Failed to update staff assignments for brand directory row', brandId, err);
      setAssignmentErrors((prev) => ({
        ...prev,
        [brandId]: 'Failed to update staff assignments. Please try again.',
      }));
    } finally {
      setSavingAssignments((prev) => ({
        ...prev,
        [brandId]: false,
      }));
    }
  };

  const renderStaffSelect = (brandId, field, options) => {
    const draft = assignmentDrafts[brandId];
    const value = draft ? draft[field] || '' : '';
    return (
      <select
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)] dark:text-gray-100"
        value={value}
        onChange={(event) => handleDraftChange(brandId, field, event.target.value)}
        disabled={loadingStaff || savingAssignments[brandId]}
      >
        <option value="">Unassigned</option>
        {options.map((user) => (
          <option key={user.id} value={user.id}>
            {getUserDisplayName(user)}
          </option>
        ))}
      </select>
    );
  };

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
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-full border border-gray-200 bg-white p-1 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
                      <TabButton
                        type="button"
                        active={view === 'grid'}
                        onClick={() => setView('grid')}
                        aria-label="Grid view"
                        className="rounded-full px-3 py-1 text-sm"
                      >
                        <FiGrid className="shrink-0" />
                        <span className="hidden sm:inline">Grid</span>
                      </TabButton>
                      <TabButton
                        type="button"
                        active={view === 'list'}
                        onClick={() => setView('list')}
                        aria-label="List view"
                        className="rounded-full px-3 py-1 text-sm"
                      >
                        <FiList className="shrink-0" />
                        <span className="hidden sm:inline">List</span>
                      </TabButton>
                    </div>
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
                  </div>
                }
              />
              {loading ? (
                <div className="flex justify-center py-12 text-sm text-gray-500 dark:text-gray-400">
                  Loading brands...
                </div>
              ) : displayBrands.length ? (
                view === 'list' ? (
                  <Table
                    columns={
                      canManageStaffAssignments
                        ? ['auto', '14rem', '14rem', '10rem']
                        : ['auto']
                    }
                  >
                    <thead>
                      <tr>
                        <th className="text-left">Brand</th>
                        {canManageStaffAssignments && (
                          <>
                            <th className="text-left">Default designer</th>
                            <th className="text-left">Default editor</th>
                            <th className="text-left">Actions</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {displayBrands.map((brand) => {
                        const draft = assignmentDrafts[brand.id];
                        const isSaving = Boolean(savingAssignments[brand.id]);
                        const showSuccess = Boolean(assignmentMessages[brand.id]);
                        const errorMessage = assignmentErrors[brand.id] || '';
                        return (
                          <tr key={brand.id}>
                            <td data-label="Brand" className="align-middle">
                              <div className="flex flex-wrap items-center gap-3">
                                {brand.publicDashboardSlug ? (
                                  <Link
                                    to={`/${brand.publicDashboardSlug}`}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-gray-500 transition hover:border-[var(--accent-color)] hover:text-[var(--accent-color)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 dark:border-[var(--border-color-default)] dark:text-gray-300 dark:hover:border-[var(--accent-color)] dark:hover:text-[var(--accent-color)] dark:focus-visible:ring-offset-0"
                                    title="Open public dashboard"
                                  >
                                    <FiHome className="h-4 w-4" aria-hidden="true" />
                                    <span className="sr-only">View public dashboard for {brand.name || brand.code || 'this brand'}</span>
                                  </Link>
                                ) : (
                                  <span
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-300 dark:border-[var(--border-color-default)] dark:text-gray-500"
                                    aria-hidden="true"
                                  >
                                    <FiHome className="h-4 w-4" />
                                  </span>
                                )}
                                <div className="flex flex-col gap-1">
                                  <Link
                                    to={`${basePath}/${brand.id}`}
                                    className="inline-flex flex-wrap items-center gap-2 font-semibold text-gray-900 transition hover:text-[var(--accent-color)] dark:text-gray-100 dark:hover:text-[var(--accent-color)]"
                                  >
                                    <span>{brand.name || brand.code || brand.id}</span>
                                    {brand.code && (
                                      <span className="inline-flex items-center rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-600 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)] dark:text-[var(--dark-text)]">
                                        {brand.code}
                                      </span>
                                    )}
                                  </Link>
                                  {brand.archived && (
                                    <span className="inline-flex w-fit items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
                                      Archived
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            {canManageStaffAssignments && (
                              <>
                                <td data-label="Default designer" className="align-middle">
                                  {renderStaffSelect(brand.id, 'designerId', designers)}
                                </td>
                                <td data-label="Default editor" className="align-middle">
                                  {renderStaffSelect(brand.id, 'editorId', editors)}
                                </td>
                                <td className="align-middle">
                                  <div className="flex flex-col gap-2">
                                    {loadingStaff && (
                                      <span className="text-xs text-gray-500 dark:text-gray-400">Loading staff…</span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleSaveAssignments(brand.id)}
                                      disabled={!draft?.dirty || isSaving || loadingStaff}
                                      className="inline-flex items-center justify-center rounded-lg bg-[var(--accent-color)] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-offset-[var(--dark-sidebar)]"
                                    >
                                      {isSaving ? 'Saving…' : 'Save'}
                                    </button>
                                    {showSuccess && (
                                      <span className="text-xs font-medium text-[var(--accent-color)]">{assignmentMessages[brand.id]}</span>
                                    )}
                                    {errorMessage && (
                                      <span className="text-xs font-medium text-rose-600 dark:text-rose-400">{errorMessage}</span>
                                    )}
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                ) : (
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
                )
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
