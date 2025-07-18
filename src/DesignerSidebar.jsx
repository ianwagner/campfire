import SidebarBase from './components/SidebarBase';
import { FiBell, FiGrid, FiSettings } from 'react-icons/fi';

const tabs = [
  { label: 'Notifications', path: '/designer/notifications', icon: FiBell },
  { label: 'Ad Groups', path: '/dashboard/designer', icon: FiGrid },
  { label: 'Account Settings', path: '/designer/account-settings', icon: FiSettings },
];

const DesignerSidebar = () => <SidebarBase tabs={tabs} />;

export default DesignerSidebar;
