import SidebarBase from './components/SidebarBase';
import {
  FiHome,
  FiList,
  FiGrid,
  FiUser,
  FiBriefcase,
  FiUsers,
  FiSettings,
  FiBell,
  FiFileText,
  FiSliders,
} from 'react-icons/fi';

const tabs = [
  { label: 'Dashboard', path: '/admin/dashboard', icon: FiHome },
  { label: 'Tickets', path: '/admin/tickets', icon: FiList },
  { label: 'Ad Groups', path: '/admin/ad-groups', icon: FiGrid },
  { label: 'Accounts', path: '/admin/accounts', icon: FiUser },
  { label: 'Brands', path: '/admin/brands', icon: FiBriefcase },
  { label: 'Agencies', path: '/admin/agencies', icon: FiUsers },
  {
    label: 'Settings',
    icon: FiSettings,
    children: [
      { label: 'Ad Recipes', path: '/admin/ad-recipes', icon: FiList },
      { label: 'Copy Recipes', path: '/admin/copy-recipes', icon: FiFileText },
      { label: 'Notifications', path: '/admin/notifications', icon: FiBell },
      { label: 'Account Settings', path: '/admin/account-settings', icon: FiSettings },
      { label: 'Site Settings', path: '/admin/site-settings', icon: FiSliders },
    ],
  },
];

const AdminSidebar = () => <SidebarBase tabs={tabs} />;

export default AdminSidebar;
