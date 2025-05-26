import SidebarBase from './components/SidebarBase';
import useAgencyTheme from './useAgencyTheme';

const AgencySidebar = ({ agencyId }) => {
  const { agency } = useAgencyTheme(agencyId);
  const q = agencyId ? `?agencyId=${agencyId}` : '';
  const tabs = [
    { label: 'Dashboard', path: `/agency/dashboard${q}` },
    { label: 'Ad Groups', path: `/agency/ad-groups${q}` },
    { label: 'Brands', path: `/agency/brands${q}` },
    { label: 'Theme', path: `/agency/theme${q}` },
  ];
  return (
    <SidebarBase
      tabs={tabs}
      logoUrl={agency.logoUrl}
      logoAlt={`${agency.name} logo`}
      /* prevent site accent from overriding agency theme */
      applySiteAccent={false}
    />
  );
};

export default AgencySidebar;
