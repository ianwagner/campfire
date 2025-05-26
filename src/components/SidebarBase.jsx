import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import useSiteSettings from '../useSiteSettings';
import { DEFAULT_LOGO_URL } from '../constants';

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
            : 'text-gray-700 hover:bg-accent-10 border border-transparent ') +
          'rounded-lg w-full text-center px-3 py-2';
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
      <div className="hidden md:flex fixed top-0 left-0 w-[250px] border-r bg-white p-4 flex-col h-screen justify-between">
        <div className="space-y-2">
          <img
            src={logoUrl || settings.logoUrl || DEFAULT_LOGO_URL}
            alt={logoAlt || 'Logo'}
            className="mx-auto mt-4 mb-4 max-h-16 w-auto"
          />
          {menuItems}
        </div>
        <div className="flex flex-col items-center space-y-1">
          <button
            onClick={handleLogout}
            className="text-gray-700 hover:bg-gray-100 w-full text-center font-bold px-3 py-2"
          >
            Log Out
          </button>
          <footer className="text-xs text-gray-400 text-center">
            © 2025 Studio Tak. All rights reserved.
          </footer>
        </div>
      </div>

      {/* Mobile hamburger */}
      <button
        type="button"
        aria-label="Menu"
        className="md:hidden fixed top-2 left-2 m-2 text-2xl z-40"
        onClick={() => setOpen(true)}
      >
        &#9776;
      </button>

        {open && (
          <div className="fixed inset-0 bg-white p-4 flex flex-col h-full justify-between z-50">
            <div className="space-y-2">
              <button
                type="button"
                aria-label="Close menu"
                className="self-end mb-4 text-2xl"
                onClick={() => setOpen(false)}
              >
                &times;
              </button>
              <img
                src={logoUrl || settings.logoUrl || DEFAULT_LOGO_URL}
                alt={logoAlt || 'Logo'}
                className="mx-auto mt-4 mb-4 max-h-16 w-auto"
              />
              {menuItems}
            </div>
            <div className="flex flex-col items-center space-y-1">
              <button
                onClick={handleLogout}
                className="text-gray-700 hover:bg-gray-100 w-full text-center font-bold px-3 py-2"
              >
                Log Out
              </button>
              <footer className="text-xs text-gray-400 text-center">
                © 2025 Studio Tak. All rights reserved.
              </footer>
            </div>
          </div>
        )}
    </>
  );
};

export default SidebarBase;
