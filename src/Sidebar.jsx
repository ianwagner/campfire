import SidebarBase from './components/SidebarBase';
import useAgencyTheme from './useAgencyTheme';

const defaultTabs = [
  { label: 'Campfire', path: '/dashboard/client' },
  { label: 'Request', path: '/request' },
  { label: 'Brand Profile', path: '/brand-profile' },
  { label: 'Account Settings', path: '/account-settings' },
];

const managerTabs = [
  { label: 'Tickets', path: '/admin/tickets' },
  { label: 'Ad Groups', path: '/admin/ad-groups' },
  { label: 'Brands', path: '/admin/brands' },
  { label: 'Account Settings', path: '/account-settings' },
];

const editorTabs = [
  { label: 'Tickets', path: '/admin/tickets' },
  { label: 'Ad Groups', path: '/editor/ad-groups' },
  { label: 'Brands', path: '/editor/brands' },
  { label: 'Account Settings', path: '/account-settings' },
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
