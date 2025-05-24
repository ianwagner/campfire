import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from './firebase/config';

const tabs = [
  { label: 'Dashboard', path: '/dashboard/client' },
  { label: 'Request', path: '/request' },
  { label: 'Brand Setup', path: '/brand-setup' },
  { label: 'Account Settings', path: '/account-settings' },
  { label: 'Log Out', action: 'logout' },
];

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = React.useState(false);

  const handleClick = (tab) => {
    if (tab.action === 'logout') {
      signOut(auth).catch((err) => console.error('Failed to sign out', err));
      return;
    }
    if (tab.path) {
      navigate(tab.path);
    }
  };

  const menuItems = (
    <>
      {tabs.map((tab) => {
        const isActive = tab.path && location.pathname.startsWith(tab.path);
        const classes =
          (isActive
            ? 'bg-orange-50 text-orange-600 font-medium border border-orange-500 rounded-lg '
            : 'text-gray-700 hover:bg-gray-100 ') +
          'w-full text-left px-3 py-2';
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
      <div className="hidden md:flex w-56 h-screen border-r bg-white p-4 flex-col space-y-2">
        {menuItems}
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
        <div className="fixed inset-0 bg-white p-4 flex flex-col space-y-2 z-50">
          <button
            type="button"
            aria-label="Close menu"
            className="self-end mb-4 text-2xl"
            onClick={() => setOpen(false)}
          >
            &times;
          </button>
          {menuItems}
        </div>
      )}
    </>
  );
};

export default Sidebar;
