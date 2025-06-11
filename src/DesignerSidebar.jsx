import SidebarBase from './components/SidebarBase';

const tabs = [
  { label: 'Notifications', path: '/designer/notifications' },
  { label: 'Ad Groups', path: '/dashboard/designer' },
  { label: 'Account Settings', path: '/designer/account-settings' },
];

const DesignerSidebar = () => <SidebarBase tabs={tabs} />;

export default DesignerSidebar;
