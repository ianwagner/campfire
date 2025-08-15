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
  FiType,
  FiPieChart,
} from 'react-icons/fi';

const tabs = [
  { label: 'Dashboard', path: '/admin/dashboard', icon: FiHome },
  { label: 'Tickets', path: '/admin/tickets', icon: FiList },
  { label: 'Ad Groups', path: '/admin/ad-groups', icon: FiGrid },
  { label: 'Accounts', path: '/admin/accounts', icon: FiUsers },
  { label: 'Brands', path: '/admin/brands', icon: FiBriefcase },
  { label: 'Agencies', path: '/admin/agencies', icon: FiPackage },
  { label: 'Distribution', path: '/admin/distribution', icon: FiPieChart },
  {
    label: 'Settings',
    children: [
      { label: 'Ad Recipes', path: '/admin/ad-recipes', icon: FiList },
      { label: 'Copy Recipes', path: '/admin/copy-recipes', icon: FiCopy },
      { label: 'Notifications', path: '/admin/notifications', icon: FiBell },
      {
        label: 'Dynamic Headlines',
        path: '/admin/dynamic-headlines',
        icon: FiType,
      },
      { label: 'Account Settings', path: '/admin/account-settings', icon: FiUser },
      { label: 'Site Settings', path: '/admin/site-settings', icon: FiTool },
    ],
    icon: FiSettings,
  },
];

const AdminSidebar = () => {
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    const handleResize = () => setCollapsed(window.innerWidth < 1200);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  React.useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--sidebar-width', collapsed ? '4rem' : '250px');
    return () => {
      root.style.setProperty('--sidebar-width', '250px');
    };
  }, [collapsed]);
  return (
    <SidebarBase
      tabs={tabs}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((c) => !c)}
      LogoComponent={Logo}
    />
  );
};

export default AdminSidebar;
