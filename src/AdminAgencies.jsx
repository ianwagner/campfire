import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useAgencies from './useAgencies';
import AgencyCard from './components/AgencyCard.jsx';
import PageToolbar from './components/PageToolbar.jsx';
import CreateButton from './components/CreateButton.jsx';

const AdminAgencies = () => {
  const { agencies, loading } = useAgencies();
  const [filter, setFilter] = useState('');

  const displayAgencies = useMemo(() => {
    const term = filter.trim().toLowerCase();

    return [...agencies]
      .filter((agency) => {
        if (!term) return true;
        const values = [agency.name, agency.tagline, agency.description, agency.id]
          .map((value) => (value ? String(value).toLowerCase() : ''));
        return values.some((value) => value.includes(term));
      })
      .sort((a, b) => {
        const nameA = (a.name || a.id || '').toLowerCase();
        const nameB = (b.name || b.id || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
  }, [agencies, filter]);

  const hasFilter = Boolean(filter.trim());

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[var(--dark-bg)]">
      <div className="px-4 py-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
            <div className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Agency Directory</h1>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Browse all agencies, then open one to update branding, theme, and feature access.
                  </p>
                </div>
                <CreateButton
                  as={Link}
                  to="/admin/agencies/new"
                  ariaLabel="Create agency"
                  className="self-start"
                >
                  <span className="hidden sm:inline">New Agency</span>
                </CreateButton>
              </div>
              <PageToolbar
                left={
                  <input
                    type="search"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Search agencies"
                    aria-label="Search agencies"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)] dark:text-gray-200"
                  />
                }
                right={null}
              />
              {loading ? (
                <div className="flex justify-center py-12 text-sm text-gray-500 dark:text-gray-400">
                  Loading agencies...
                </div>
              ) : displayAgencies.length ? (
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {displayAgencies.map((agency) => (
                    <Link
                      key={agency.id}
                      to={`/admin/agencies/${agency.id}`}
                      className="group block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[var(--dark-sidebar)]"
                    >
                      <AgencyCard agency={agency} />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-400">
                  {hasFilter ? (
                    <p className="mb-0">
                      No agencies match “{filter.trim()}”. Try a different search term.
                    </p>
                  ) : (
                    <p className="mb-0">
                      No agencies created yet. Use the New Agency button to get started.
                    </p>
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

export default AdminAgencies;
