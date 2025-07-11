import Sidebar from './Sidebar';
import AdminSidebar from './AdminSidebar';
import DesignerSidebar from './DesignerSidebar';
import AgencySidebar from './AgencySidebar';

const RoleSidebar = ({ role, agencyId, isAdmin }) => {
  if (isAdmin) return <AdminSidebar />;
  if (role === 'admin' || role === 'manager') return <AdminSidebar />;
  if (role === 'designer') return <DesignerSidebar />;
  if (role === 'agency') return <AgencySidebar agencyId={agencyId} />;
  return <Sidebar agencyId={agencyId} />;
};

export default RoleSidebar;
