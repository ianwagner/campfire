import SidebarBase from './components/SidebarBase';

const tabs = [
  { label: 'Dashboard', path: '/dashboard/client' },
  { label: 'Request', path: '/request' },
  { label: 'Brand Setup', path: '/brand-setup' },
  { label: 'Account Settings', path: '/account-settings' },
  { label: 'MFA Setup', path: '/enroll-mfa' },
];

const Sidebar = () => <SidebarBase tabs={tabs} />;

export default Sidebar;
