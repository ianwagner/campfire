import SidebarBase from './components/SidebarBase';
import useAgencyTheme from './useAgencyTheme';
import { FiHome, FiGrid, FiBriefcase, FiFeather, FiUser } from 'react-icons/fi';

const AgencySidebar = ({ agencyId }) => {
  const { agency } = useAgencyTheme(agencyId);
  const q = agencyId ? `?agencyId=${agencyId}` : '';
  const tabs = [
    { label: 'Dashboard', path: `/agency/dashboard${q}`, icon: FiHome },
    { label: 'Ad Groups', path: `/agency/ad-groups${q}`, icon: FiGrid },
    { label: 'Brands', path: `/agency/brands${q}`, icon: FiBriefcase },
    { label: 'Theme', path: `/agency/theme${q}`, icon: FiFeather },
    { label: 'Account Settings', path: `/agency/account-settings${q}`, icon: FiUser },
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
