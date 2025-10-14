import React from 'react';
import SidebarBase from './components/SidebarBase';
import Logo from './components/Logo.jsx';
import useAgencyTheme from './useAgencyTheme';
import useBrandsByCode from './useBrandsByCode.js';
import useMonthlyBrief from './useMonthlyBrief.js';
import {
  MONTHLY_BRIEF_BADGE_TONE_CLASSES,
  MONTHLY_BRIEF_MENU_LABEL,
  getMonthlyBriefBadge,
} from './monthlyBriefCopy.js';
import {
  FiHome,
  FiEdit,
  FiBriefcase,
  FiUser,
  FiList,
  FiGrid,
  FiFileText,
  FiDatabase,
  FiZap,
} from 'react-icons/fi';
import { FiFolder } from 'react-icons/fi';

const clientBaseTabs = [
  { label: 'Dashboard', path: '/dashboard/client', icon: FiHome },
  { label: 'Create', path: '/projects', icon: FiFolder },
  { label: 'Ad Groups', path: '/ad-groups', icon: FiGrid },
  { label: 'Data', path: '/data', icon: FiDatabase },
  { label: 'Brand Profile', path: '/brand-profile', icon: FiBriefcase },
  { label: 'Mini-Game', path: '/mini-game', icon: FiZap },
  { label: 'Account Settings', path: '/account-settings', icon: FiUser },
];

const managerTabs = [
  { label: 'Tickets', path: '/admin/tickets', icon: FiList },
  { label: 'Ad Groups', path: '/admin/ad-groups', icon: FiGrid },
  { label: 'Brands', path: '/admin/brands', icon: FiBriefcase },
  { label: 'Mini-Game', path: '/mini-game', icon: FiZap },
  { label: 'Account Settings', path: '/account-settings', icon: FiUser },
];

const pmTabs = [
  { label: 'Dashboard', path: '/pm/dashboard', icon: FiHome },
  { label: 'Tickets', path: '/pm/tickets', icon: FiList },
  { label: 'Ad Groups', path: '/pm/ad-groups', icon: FiGrid },
  { label: 'Data', path: '/pm/data', icon: FiDatabase },
  { label: 'Brands', path: '/admin/brands', icon: FiBriefcase },
  { label: 'Mini-Game', path: '/mini-game', icon: FiZap },
  { label: 'Account Settings', path: '/account-settings', icon: FiUser },
];

const opsTabs = [
  { label: 'Dashboard', path: '/pm/dashboard', icon: FiHome },
  { label: 'Create', path: '/ops/create', icon: FiFolder },
  { label: 'Tickets', path: '/pm/tickets', icon: FiList },
  { label: 'Ad Groups', path: '/pm/ad-groups', icon: FiGrid },
  { label: 'Data', path: '/pm/data', icon: FiDatabase },
  { label: 'Contracts', path: '/ops/contracts', icon: FiFileText },
  { label: 'Mini-Game', path: '/mini-game', icon: FiZap },
  { label: 'Account Settings', path: '/account-settings', icon: FiUser },
];

const editorTabs = [
  { label: 'Tickets', path: '/editor/tickets', icon: FiList },
  { label: 'Ad Groups', path: '/editor/ad-groups', icon: FiGrid },
  { label: 'Brands', path: '/editor/brands', icon: FiBriefcase },
  { label: 'Mini-Game', path: '/mini-game', icon: FiZap },
  { label: 'Account Settings', path: '/account-settings', icon: FiUser },
];

const Sidebar = ({ agencyId, role, brandCodes = [] }) => {
  const isManager = role === 'manager';
  const isEditor = role === 'editor';
  const isPm = role === 'project-manager';
  const isOps = role === 'ops';
  const isClient = role === 'client';
  const shouldShowBriefTab = isClient;
  const { agency } = useAgencyTheme(isManager || isEditor ? null : agencyId);
  const { brands } = useBrandsByCode(shouldShowBriefTab ? brandCodes : []);
  const primaryBrand = shouldShowBriefTab && brands.length > 0 ? brands[0] : null;
  const resolvedAgencyId = shouldShowBriefTab && primaryBrand
    ? primaryBrand.agencyId || agencyId || null
    : null;
  const { period: briefPeriod, state: briefState } = useMonthlyBrief(
    resolvedAgencyId,
    shouldShowBriefTab && primaryBrand ? primaryBrand.id || null : null,
    undefined
  );
  const briefBadge = shouldShowBriefTab ? getMonthlyBriefBadge(briefState) : null;
  const briefBadgeClasses = briefBadge
    ? MONTHLY_BRIEF_BADGE_TONE_CLASSES[briefBadge.tone] || MONTHLY_BRIEF_BADGE_TONE_CLASSES.muted
    : null;
  const briefTabPath = briefPeriod ? `/brief/${briefPeriod}` : '/brief';
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
  const clientTabs = React.useMemo(() => {
    if (!shouldShowBriefTab) return clientBaseTabs;
    const list = [...clientBaseTabs];
    const briefTab = {
      label: MONTHLY_BRIEF_MENU_LABEL,
      path: briefTabPath,
      icon: FiEdit,
      badge: briefBadge && briefBadgeClasses
        ? { label: briefBadge.label, toneClass: briefBadgeClasses }
        : briefBadge
          ? { label: briefBadge.label, toneClass: MONTHLY_BRIEF_BADGE_TONE_CLASSES.muted }
          : null,
    };
    list.splice(2, 0, briefTab);
    return list;
  }, [briefBadge, briefBadgeClasses, briefTabPath, shouldShowBriefTab]);

  const tabs = isManager
    ? managerTabs
    : isEditor
      ? editorTabs
      : isOps
        ? opsTabs
        : isPm
          ? pmTabs
          : clientTabs;

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
