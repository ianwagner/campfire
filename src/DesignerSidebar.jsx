import React from 'react';
import SidebarBase from './components/SidebarBase';
import { FiBell, FiGrid, FiUser } from 'react-icons/fi';

const tabs = [
  { label: 'Notifications', path: '/designer/notifications', icon: FiBell },
  { label: 'Ad Groups', path: '/dashboard/designer', icon: FiGrid },
  { label: 'Account Settings', path: '/designer/account-settings', icon: FiUser },
];

const DesignerSidebar = () => {
  const [collapsed, setCollapsed] = React.useState(false);
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
    />
  );
};

export default DesignerSidebar;
