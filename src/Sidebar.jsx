import SidebarBase from './components/SidebarBase';
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

const editorTabs = [
  { label: 'Tickets', path: '/editor/tickets', icon: FiList },
  { label: 'Ad Groups', path: '/editor/ad-groups', icon: FiGrid },
  { label: 'Brands', path: '/editor/brands', icon: FiBriefcase },
  { label: 'Account Settings', path: '/account-settings', icon: FiUser },
];

const Sidebar = ({ agencyId, role }) => {
  const isManager = role === 'manager';
  const isEditor = role === 'editor';
  const { agency } = useAgencyTheme(isManager || isEditor ? null : agencyId);
  const tabs = isManager ? managerTabs : isEditor ? editorTabs : defaultTabs;

  return (
    <SidebarBase
      tabs={tabs}
      logoUrl={isManager ? undefined : agencyId ? agency.logoUrl : undefined}
      logoAlt={isManager ? undefined : agencyId ? `${agency.name} logo` : undefined}
      applySiteAccent={isManager || isEditor || !agencyId}
    />
  );
};

export default Sidebar;
