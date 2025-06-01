import SidebarBase from './components/SidebarBase';

const tabs = [
  { label: 'Dashboard', path: '/dashboard/admin' },
  { label: 'Ad Groups', path: '/admin/ad-groups' },
  { label: 'Accounts', path: '/admin/accounts' },
  { label: 'Brands', path: '/admin/brands' },
  { label: 'Site Settings', path: '/admin/site-settings' },
  { label: 'Account Settings', path: '/admin/account-settings' },
];

const AdminSidebar = () => <SidebarBase tabs={tabs} />;

export default AdminSidebar;
