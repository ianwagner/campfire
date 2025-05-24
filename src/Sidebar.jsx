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

  const handleClick = (tab) => {
    if (tab.action === 'logout') {
      signOut(auth).catch((err) => console.error('Failed to sign out', err));
      return;
    }
    if (tab.path) {
      navigate(tab.path);
    }
  };

  return (
    <div className="w-56 md:w-56 h-screen border-r bg-white p-4 flex flex-col space-y-2">
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
    </div>
  );
};

export default Sidebar;
