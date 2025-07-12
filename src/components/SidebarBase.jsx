import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import useSiteSettings from '../useSiteSettings';
import debugLog from '../utils/debugLog';
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
  const [openGroups, setOpenGroups] = React.useState({});
  const { settings } = useSiteSettings(applySiteAccent);
  const [logoReady, setLogoReady] = React.useState(false);
  const logoSrc = logoUrl || settings.logoUrl || DEFAULT_LOGO_URL;

  const handleClick = (tab) => {
    debugLog('Navigate to', tab.path);
    if (tab.path) {
      navigate(tab.path);
    }
    // Close the mobile menu when a tab is selected
    setOpen(false);
  };

  const handleLogout = () => {
    signOut(auth).catch((err) => console.error('Failed to sign out', err));
  };

  const toggleGroup = (label) =>
    setOpenGroups((g) => ({ ...g, [label]: !g[label] }));

  const menuItems = (
    <>
      {tabs.map((tab) => {
        const currentPath = location.pathname + location.search;
        if (tab.children) {
          const activeChild = tab.children.some((c) => currentPath.startsWith(c.path));
          const isOpen = openGroups[tab.label] || activeChild;
          const parentClasses =
            (activeChild
              ? 'text-accent font-medium border border-accent dark:border-accent bg-accent-10 '
              : 'text-gray-700 dark:text-gray-200 hover:bg-accent-10 border border-transparent dark:!border-transparent ') +
            'rounded-xl w-full text-center px-3 py-[0.9rem] transition-colors duration-200 flex items-center justify-between';
          return (
            <div key={tab.label} className="space-y-1">
              <button onClick={() => toggleGroup(tab.label)} className={parentClasses}>
                <span>{tab.label}</span>
                <span
                  className={`transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`}
                >
                  ▶
                </span>
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-96' : 'max-h-0'}`}
              >
                <div className="mt-1 space-y-1 pl-3">
                  {tab.children.map((child) => {
                    const isActive = child.path && currentPath.startsWith(child.path);
                    const childClasses =
                      (isActive
                        ? 'text-accent font-medium border border-accent dark:border-accent bg-accent-10 '
                        : 'text-gray-700 dark:text-gray-200 hover:bg-accent-10 border border-transparent dark:!border-transparent ') +
                      'rounded-lg w-full text-left text-sm px-3 py-2 transition-colors duration-200';
                    return (
                      <button
                        key={child.label}
                        onClick={() => handleClick(child)}
                        className={childClasses}
                      >
                        {child.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        }
        const isActive = tab.path && currentPath.startsWith(tab.path);
        const classes =
          (isActive
            ? 'text-accent font-medium border border-accent dark:border-accent bg-accent-10 '
            : 'text-gray-700 dark:text-gray-200 hover:bg-accent-10 border border-transparent dark:!border-transparent ') +
          'rounded-xl w-full text-center px-3 py-[0.9rem] transition-colors duration-200';
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
          <div className="relative mx-auto mt-4 mb-4 h-16 flex items-center justify-center">
            {!logoReady && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="loading-ring w-6 h-6" />
              </div>
            )}
            <OptimizedImage
              pngUrl={logoSrc}
              alt={logoAlt || 'Logo'}
              loading="eager"
              cacheKey={logoSrc}
              className={`max-h-full w-auto ${logoReady ? '' : 'opacity-0'}`}
              onLoad={() => setLogoReady(true)}
              onError={() => setLogoReady(true)}
            />
          </div>
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
              <div className="relative mx-auto mt-4 mb-4 h-16 flex items-center justify-center">
                {!logoReady && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="loading-ring w-6 h-6" />
                  </div>
                )}
                <OptimizedImage
                  pngUrl={logoSrc}
                  alt={logoAlt || 'Logo'}
                  loading="eager"
                  cacheKey={logoSrc}
                  className={`max-h-full w-auto ${logoReady ? '' : 'opacity-0'}`}
                  onLoad={() => setLogoReady(true)}
                  onError={() => setLogoReady(true)}
                />
              </div>
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
