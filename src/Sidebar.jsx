import React, { useState } from 'react';

const tabs = [
  'Dashboard',
  'Request',
  'Brand Setup',
  'Account Settings',
  'Log Out',
];

const Sidebar = () => {
  const [active, setActive] = useState('Dashboard');

  return (
    <div className="w-56 h-screen border-r bg-white p-4 flex flex-col space-y-2">
      {tabs.map((tab) => {
        const isActive = active === tab;
        return (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={
              (isActive
                ? 'bg-orange-50 text-orange-600 font-medium border border-orange-500 rounded-lg '
                : 'text-gray-700 hover:bg-gray-100 ') +
              'w-full text-left px-3 py-2'
            }
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
};

export default Sidebar;
