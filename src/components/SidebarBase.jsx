import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import useSiteSettings from '../useSiteSettings';
import { DEFAULT_LOGO_URL } from '../constants';
import OptimizedImage from './OptimizedImage.jsx';

/**
 * Common sidebar layout.
 *
 * @param {Object} props
 * @param {boolean} [props.applySiteAccent=true] When false the sidebar will not
 * apply the global site accent color. This allows callers to control theming.
 */
const SidebarBase = ({ tabs = [], logoUrl, logoAlt, applySiteAccent = true }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = React.useState(false);
  const { settings } = useSiteSettings(applySiteAccent);

  const handleClick = (tab) => {
    if (tab.path) {
      navigate(tab.path);
    }
    // Close the mobile menu when a tab is selected
    setOpen(false);
  };

  const handleLogout = () => {
    signOut(auth).catch((err) => console.error('Failed to sign out', err));
  };

  const menuItems = (
    <>
      {tabs.map((tab) => {
        const currentPath = location.pathname + location.search;
        const isActive = tab.path && currentPath.startsWith(tab.path);
        const classes =
          (isActive
            ? 'text-accent font-medium border border-accent bg-accent-10 '
            : 'text-gray-700 dark:text-gray-200 hover:bg-accent-10 border border-transparent ') +
          'rounded-xl w-full text-center px-3 py-[0.9rem]';
        return (
          <button key={tab.label} onClick={() => handleClick(tab)} className={classes}>
            {tab.label}
          </button>
        );
      })}
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex fixed top-0 left-0 w-[250px] border-r bg-white dark:bg-[var(--dark-sidebar-bg)] dark:border-[var(--dark-sidebar-hover)] p-4 flex-col h-screen justify-between">
        <div className="space-y-2">
          <OptimizedImage
            pngUrl={logoUrl || settings.logoUrl || DEFAULT_LOGO_URL}
            alt={logoAlt || 'Logo'}
            className="mx-auto mt-4 mb-4 max-h-16 w-auto"
          />
          {menuItems}
        </div>
        <div className="flex flex-col items-center space-y-1">
          <button
            onClick={handleLogout}
            className="text-gray-700 dark:text-gray-200 hover:bg-accent-10 w-full text-center font-bold px-3 py-[0.9rem] rounded-xl"
          >
            Log Out
          </button>
          <footer className="text-xs text-gray-400 dark:text-gray-500 text-center">
            © 2025 Studio Tak. All rights reserved.
          </footer>
        </div>
      </div>

      {/* Mobile hamburger */}
      <button
        type="button"
        aria-label="Menu"
        className="md:hidden fixed top-4 right-2 m-2 text-2xl z-40"
        onClick={() => setOpen(true)}
      >
        &#9776;
      </button>

        {open && (
          <div className="fixed inset-0 bg-white dark:bg-[var(--dark-sidebar-bg)] p-4 flex flex-col h-full justify-between z-50">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute top-4 right-4 text-2xl"
              onClick={() => setOpen(false)}
            >
              &times;
            </button>
            <div className="space-y-2 mt-8">
              <OptimizedImage
                pngUrl={logoUrl || settings.logoUrl || DEFAULT_LOGO_URL}
                alt={logoAlt || 'Logo'}
                className="mx-auto mt-4 mb-4 max-h-16 w-auto"
              />
              {menuItems}
            </div>
            <div className="flex flex-col items-center space-y-1">
              <button
                onClick={handleLogout}
                className="text-gray-700 dark:text-gray-200 hover:bg-accent-10 w-full text-center font-bold px-3 py-[0.9rem] rounded-xl"
              >
                Log Out
              </button>
              <footer className="text-xs text-gray-400 dark:text-gray-500 text-center">
                © 2025 Studio Tak. All rights reserved.
              </footer>
            </div>
          </div>
        )}
    </>
  );
};

export default SidebarBase;
