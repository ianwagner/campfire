import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import useSiteSettings from '../useSiteSettings';
import { DEFAULT_LOGO_URL } from '../constants';

const SidebarBase = ({ tabs = [], logoUrl, logoAlt }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = React.useState(false);
  const { settings } = useSiteSettings();

  const displayLogoUrl = logoUrl || settings.logoUrl || DEFAULT_LOGO_URL;
  const displayLogoAlt = logoAlt || 'Studio Tak logo';

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
        const isActive = tab.path && location.pathname.startsWith(tab.path);
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
      <div className="hidden md:flex fixed top-0 left-0 w-[250px] h-screen border-r bg-white p-4 flex-col space-y-2">
        <img
          src={displayLogoUrl}
          alt={displayLogoAlt}
          className="mx-auto mt-4 mb-4 w-40"
        />
        {menuItems}
        <button
          onClick={handleLogout}
          className="mt-auto text-gray-700 hover:bg-gray-100 w-full text-center font-bold px-3 py-2"
        >
          Log Out
        </button>
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
        <div className="fixed inset-0 bg-white p-4 flex flex-col h-full space-y-2 z-50">
          <button
            type="button"
            aria-label="Close menu"
            className="self-end mb-4 text-2xl"
            onClick={() => setOpen(false)}
          >
            &times;
          </button>
          <img
            src={displayLogoUrl}
            alt={displayLogoAlt}
            className="mx-auto mt-4 mb-4 w-40"
          />
          {menuItems}
          <button
            onClick={handleLogout}
            className="mt-auto text-gray-700 hover:bg-gray-100 w-full text-center font-bold px-3 py-2"
          >
            Log Out
          </button>
        </div>
      )}
    </>
  );
};

export default SidebarBase;
