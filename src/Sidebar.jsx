import SidebarBase from './components/SidebarBase';

const tabs = [
  { label: 'Campfire', path: '/dashboard/client' },
  { label: 'Request', path: '/request' },
  { label: 'Brand Setup', path: '/brand-setup' },
  { label: 'Account Settings', path: '/account-settings' },
];

const Sidebar = () => <SidebarBase tabs={tabs} />;

export default Sidebar;
