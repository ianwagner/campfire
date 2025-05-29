import SidebarBase from './components/SidebarBase';
import useAgencyTheme from './useAgencyTheme';

const tabs = [
  { label: 'Campfire', path: '/dashboard/client' },
  { label: 'Request', path: '/request' },
  { label: 'Brand Setup', path: '/brand-setup' },
  { label: 'Account Settings', path: '/account-settings' },
];

const Sidebar = ({ agencyId }) => {
  const { agency } = useAgencyTheme(agencyId);
  return (
    <SidebarBase
      tabs={tabs}
      logoUrl={agencyId ? agency.logoUrl : undefined}
      logoAlt={agencyId ? `${agency.name} logo` : undefined}
      applySiteAccent={!agencyId}
    />
  );
};

export default Sidebar;
