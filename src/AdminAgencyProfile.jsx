import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FiFeather, FiSliders } from 'react-icons/fi';
import TabButton from './components/TabButton.jsx';
import AgencyThemeSettings from './AgencyThemeSettings.jsx';
import AgencySettings from './AgencySettings.jsx';
import useAgencyTheme from './useAgencyTheme';
import OptimizedImage from './components/OptimizedImage.jsx';

const AdminAgencyProfile = () => {
  const { agencyId } = useParams();
  const { agency, loading } = useAgencyTheme(agencyId);
  const [tab, setTab] = useState('theme');

  const displayName = agency.name || agencyId;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[var(--dark-bg)]">
      <div className="px-4 py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <div className="flex items-center gap-3">
            <Link
              to="/admin/agencies"
              className="btn-arrow mr-2"
              aria-label="Back to agencies"
            >
              &lt;
            </Link>
            <div className="flex items-center gap-3">
              {agency.logoUrl && (
                <OptimizedImage
                  pngUrl={agency.logoUrl}
                  alt="Agency logo"
                  className="h-12 w-12 rounded-full border border-gray-200 object-contain p-1 dark:border-[var(--border-color-default)]"
                />
              )}
              <div>
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                  {displayName}
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">Manage settings, theme, and feature access.</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
            <TabButton active={tab === 'theme'} onClick={() => setTab('theme')} disabled={loading}>
              <FiFeather /> <span>Branding &amp; Theme</span>
            </TabButton>
            <TabButton active={tab === 'settings'} onClick={() => setTab('settings')} disabled={loading}>
              <FiSliders /> <span>Feature Settings</span>
            </TabButton>
          </div>
          <div className="pb-6">
            {loading ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-400">
                Loading agency...
              </div>
            ) : (
              <>
                {tab === 'theme' && <AgencyThemeSettings agencyId={agencyId} />}
                {tab === 'settings' && <AgencySettings agencyId={agencyId} />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminAgencyProfile;

