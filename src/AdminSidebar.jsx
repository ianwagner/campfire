import SidebarBase from './components/SidebarBase';

const tabs = [
  { label: 'Requests', path: '/admin/requests' },
  { label: 'Ad Groups', path: '/admin/ad-groups' },
  { label: 'Accounts', path: '/admin/accounts' },
  { label: 'Brands', path: '/admin/brands' },
  { label: 'Ad Recipes', path: '/admin/ad-recipes' },
  { label: 'Copy Recipes', path: '/admin/copy-recipes' },
  { label: 'Notifications', path: '/admin/notifications' },
  { label: 'Site Settings', path: '/admin/site-settings' },
  { label: 'Account Settings', path: '/admin/account-settings' },
];

const AdminSidebar = () => <SidebarBase tabs={tabs} />;

export default AdminSidebar;
