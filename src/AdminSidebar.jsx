import SidebarBase from './components/SidebarBase';

const tabs = [
  { label: 'Tickets', path: '/admin/tickets' },
  { label: 'Ad Groups', path: '/admin/ad-groups' },
  { label: 'Accounts', path: '/admin/accounts' },
  { label: 'Brands', path: '/admin/brands' },
  { label: 'Agencies', path: '/admin/agencies' },
  {
    label: 'Settings',
    children: [
      { label: 'Ad Recipes', path: '/admin/ad-recipes' },
      { label: 'Copy Recipes', path: '/admin/copy-recipes' },
      { label: 'Notifications', path: '/admin/notifications' },
      { label: 'Account Settings', path: '/admin/account-settings' },
      { label: 'Site Settings', path: '/admin/site-settings' },
    ],
  },
];

const AdminSidebar = () => <SidebarBase tabs={tabs} />;

export default AdminSidebar;
