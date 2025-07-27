import React from 'react';
import SidebarBase from './components/SidebarBase';
import Logo from './components/Logo.jsx';
import useAgencyTheme from './useAgencyTheme';
import {
  FiHome,
  FiEdit,
  FiBriefcase,
  FiUser,
  FiList,
  FiGrid,
} from 'react-icons/fi';

const defaultTabs = [
  { label: 'Campfire', path: '/dashboard/client', icon: FiHome },
  { label: 'Request', path: '/request', icon: FiEdit },
  { label: 'Brand Profile', path: '/brand-profile', icon: FiBriefcase },
  { label: 'Account Settings', path: '/account-settings', icon: FiUser },
];

const managerTabs = [
  { label: 'Tickets', path: '/admin/tickets', icon: FiList },
  { label: 'Ad Groups', path: '/admin/ad-groups', icon: FiGrid },
  { label: 'Brands', path: '/admin/brands', icon: FiBriefcase },
  { label: 'Account Settings', path: '/account-settings', icon: FiUser },
];

const pmTabs = [
  { label: 'Dashboard', path: '/pm/dashboard', icon: FiHome },
  { label: 'Ad Groups', path: '/pm/ad-groups', icon: FiGrid },
  { label: 'Account Settings', path: '/account-settings', icon: FiUser },
];

const editorTabs = [
  { label: 'Tickets', path: '/editor/tickets', icon: FiList },
  { label: 'Ad Groups', path: '/editor/ad-groups', icon: FiGrid },
  { label: 'Brands', path: '/editor/brands', icon: FiBriefcase },
  { label: 'Account Settings', path: '/account-settings', icon: FiUser },
];

const Sidebar = ({ agencyId, role }) => {
  const isManager = role === 'manager';
  const isEditor = role === 'editor';
  const isPm = role === 'project-manager';
  const { agency } = useAgencyTheme(isManager || isEditor ? null : agencyId);
  const showAnimatedLogo = isManager || isEditor || !agencyId;
  const [collapsed, setCollapsed] = React.useState(false);
  React.useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--sidebar-width', collapsed ? '4rem' : '250px');
    return () => {
      root.style.setProperty('--sidebar-width', '250px');
    };
  }, [collapsed]);
  const tabs = isManager
    ? managerTabs
    : isEditor
      ? editorTabs
      : isPm
        ? pmTabs
        : defaultTabs;

  return (
    <SidebarBase
      tabs={tabs}
      logoUrl={showAnimatedLogo ? undefined : agency.logoUrl}
      logoAlt={showAnimatedLogo ? undefined : `${agency.name} logo`}
      applySiteAccent={isManager || isEditor || !agencyId}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((c) => !c)}
      LogoComponent={showAnimatedLogo ? Logo : undefined}
    />
  );
};

export default Sidebar;
