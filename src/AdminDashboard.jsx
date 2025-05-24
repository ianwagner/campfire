import React from 'react';
import AdminSidebar from './AdminSidebar';
import DesignerDashboard from './DesignerDashboard';

const AdminDashboard = () => (
  <div className="flex min-h-screen">
    <AdminSidebar />
    <div className="flex-grow">
      <DesignerDashboard showSidebar={false} />
    </div>
  </div>
);

export default AdminDashboard;
