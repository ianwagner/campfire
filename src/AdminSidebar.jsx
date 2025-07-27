import React from 'react';
import SidebarBase from './components/SidebarBase';
import Logo from './components/Logo.jsx';
import {
  FiHome,
  FiList,
  FiGrid,
  FiUsers,
  FiBriefcase,
  FiPackage,
  FiSettings,
  FiCopy,
  FiBell,
  FiUser,
  FiTool,
} from 'react-icons/fi';

const tabs = [
  { label: 'Dashboard', path: '/admin/dashboard', icon: FiHome },
  { label: 'Tickets', path: '/admin/tickets', icon: FiList },
  { label: 'Ad Groups', path: '/admin/ad-groups', icon: FiGrid },
  { label: 'Accounts', path: '/admin/accounts', icon: FiUsers },
  { label: 'Brands', path: '/admin/brands', icon: FiBriefcase },
  { label: 'Agencies', path: '/admin/agencies', icon: FiPackage },
  {
    label: 'Settings',
    children: [
      { label: 'Ad Recipes', path: '/admin/ad-recipes', icon: FiList },
      { label: 'Copy Recipes', path: '/admin/copy-recipes', icon: FiCopy },
      { label: 'Notifications', path: '/admin/notifications', icon: FiBell },
      { label: 'Account Settings', path: '/admin/account-settings', icon: FiUser },
      { label: 'Site Settings', path: '/admin/site-settings', icon: FiTool },
    ],
    icon: FiSettings,
  },
];

const AdminSidebar = () => {
  const [collapsed, setCollapsed] = React.useState(false);
  const [logoOpen, setLogoOpen] = React.useState(true);

  React.useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--sidebar-width', collapsed ? '4rem' : '250px');
    return () => {
      root.style.setProperty('--sidebar-width', '250px');
    };
  }, [collapsed]);

  const handleToggleCollapse = () => {
    setCollapsed((c) => {
      const next = !c;
      if (next) {
        setLogoOpen(false);
      } else {
        setTimeout(() => setLogoOpen(true), 150);
      }
      return next;
    });
  };
  return (
    <SidebarBase
      tabs={tabs}
      collapsed={collapsed}
      onToggleCollapse={handleToggleCollapse}
      LogoComponent={(props) => <Logo {...props} isOpen={logoOpen} />}
    />
  );
};

export default AdminSidebar;
