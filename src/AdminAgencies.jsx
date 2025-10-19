import React from 'react';
import { Link } from 'react-router-dom';
import useAgencies from './useAgencies';
import AgencyCard from './components/AgencyCard.jsx';

const AdminAgencies = () => {
  const { agencies, loading } = useAgencies();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[var(--dark-bg)]">
      <div className="px-4 py-6">
        <div className="mx-auto max-w-6xl">
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Agency Directory</h1>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Select an agency to manage theme, branding, and feature settings.
                </p>
              </div>
            </div>
            <div className="mt-6">
              {loading ? (
                <div className="flex justify-center py-12 text-sm text-gray-500 dark:text-gray-400">
                  Loading agencies...
                </div>
              ) : agencies.length ? (
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {agencies.map((agency) => (
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
                  No agencies available yet.
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
