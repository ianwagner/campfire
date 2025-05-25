import SidebarBase from './components/SidebarBase';

const tabs = [
  { label: 'Dashboard', path: '/agency/dashboard' },
];

const AgencySidebar = () => <SidebarBase tabs={tabs} />;

export default AgencySidebar;
