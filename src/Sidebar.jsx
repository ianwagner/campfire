import SidebarBase from './components/SidebarBase';

const tabs = [
  { label: 'Campfire', path: '/dashboard/client' },
  { label: 'Request', path: '/request' },
  { label: 'Brand Setup', path: '/brand-setup' },
  { label: 'Account Settings', path: '/account-settings' },
  { label: 'MFA Setup', path: '/mfa-settings' },
];

const Sidebar = () => <SidebarBase tabs={tabs} />;

export default Sidebar;
