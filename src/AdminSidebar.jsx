import React from 'react';
import SidebarBase from './components/SidebarBase';

const tabs = [
  { label: 'Dashboard', path: '/dashboard/admin' },
  { label: 'Ad Groups', path: '/dashboard/admin' },
  { label: 'Users', path: '/admin/accounts' },
  { label: 'Brands', path: '/admin/brands' },
  { label: 'Site Settings', path: '/admin/site-settings' },
  { label: 'MFA Setup', path: '/enroll-mfa' },
];

const AdminSidebar = () => <SidebarBase tabs={tabs} />;

export default AdminSidebar;

