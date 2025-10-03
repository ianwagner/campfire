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
  FiFileText,
  FiDatabase,
} from 'react-icons/fi';
import { FiFolder } from 'react-icons/fi';

const defaultTabs = [
  { label: 'Dashboard', path: '/dashboard/client', icon: FiHome },
  { label: 'Create', path: '/projects', icon: FiFolder },
  { label: 'Ad Groups', path: '/ad-groups', icon: FiGrid },
  { label: 'Data', path: '/data', icon: FiDatabase },
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
  { label: 'Tickets', path: '/pm/tickets', icon: FiList },
  { label: 'Ad Groups', path: '/pm/ad-groups', icon: FiGrid },
  { label: 'Data', path: '/pm/data', icon: FiDatabase },
  { label: 'Brands', path: '/admin/brands', icon: FiBriefcase },
  { label: 'Account Settings', path: '/account-settings', icon: FiUser },
];

const opsTabs = [
  { label: 'Dashboard', path: '/pm/dashboard', icon: FiHome },
  { label: 'Tickets', path: '/pm/tickets', icon: FiList },
  { label: 'Ad Groups', path: '/pm/ad-groups', icon: FiGrid },
  { label: 'Data', path: '/pm/data', icon: FiDatabase },
  { label: 'Contracts', path: '/ops/contracts', icon: FiFileText },
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
  const isOps = role === 'ops';
  const { agency } = useAgencyTheme(isManager || isEditor ? null : agencyId);
  const showAnimatedLogo = isManager || isEditor || !agencyId;
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
  const tabs = isManager
    ? managerTabs
    : isEditor
      ? editorTabs
      : isOps
        ? opsTabs
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
