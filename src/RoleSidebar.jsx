import React from 'react';
import Sidebar from './Sidebar';
import AdminSidebar from './AdminSidebar';
import DesignerSidebar from './DesignerSidebar';

const RoleSidebar = ({ role }) => {
  if (role === 'admin') return <AdminSidebar />;
  if (role === 'designer') return <DesignerSidebar />;
  return <Sidebar />;
};

export default RoleSidebar;
