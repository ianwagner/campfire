import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from './firebase/config';
import useSiteSettings from './useSiteSettings';

const defaultLogo =
  'https://firebasestorage.googleapis.com/v0/b/tak-campfire-main/o/StudioTak%2Flogo_new.webp?alt=media&token=1f08d552-6c85-444d-ac4f-1e895e97e5bd';

const tabs = [
  { label: 'Notifications', path: '/designer/notifications' },
  { label: 'Ad Groups', path: '/dashboard/designer' },
  { label: 'Upload Ads', path: '/create-group' },
  { label: 'Account Settings', path: '/designer/account-settings' },
];

const DesignerSidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = React.useState(false);
  const { settings } = useSiteSettings();

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
            ? 'text-accent font-medium border border-accent '
            : 'text-gray-700 hover:bg-gray-100 border border-transparent ') +
          'rounded-lg w-full text-left px-3 py-2';
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
      <div className="hidden md:flex w-[250px] h-screen border-r bg-white p-4 flex-col space-y-2">
        <img
          src={settings.logoUrl || defaultLogo}
          alt="Studio Tak logo"
          className="mx-auto mb-4 w-32"
        />
        {menuItems}
        <button
          onClick={handleLogout}
          className="mt-auto text-gray-700 hover:bg-gray-100 w-full text-left px-3 py-2"
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
            src={settings.logoUrl || defaultLogo}
            alt="Studio Tak logo"
            className="mx-auto mb-4 w-32"
          />
          {menuItems}
          <button
            onClick={handleLogout}
            className="mt-auto text-gray-700 hover:bg-gray-100 w-full text-left px-3 py-2"
          >
            Log Out
          </button>
        </div>
      )}
    </>
  );
};

export default DesignerSidebar;
