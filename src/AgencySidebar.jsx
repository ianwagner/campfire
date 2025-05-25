import SidebarBase from './components/SidebarBase';

const AgencySidebar = ({ agencyId }) => {
  const q = agencyId ? `?agencyId=${agencyId}` : '';
  const tabs = [
    { label: 'Dashboard', path: `/agency/dashboard${q}` },
    { label: 'Ad Groups', path: `/agency/ad-groups${q}` },
    { label: 'Brands', path: `/agency/brands${q}` },
    { label: 'Theme', path: `/agency/theme${q}` },
  ];
  return <SidebarBase tabs={tabs} />;
};

export default AgencySidebar;
