import Sidebar from './Sidebar';
import AdminSidebar from './AdminSidebar';
import DesignerSidebar from './DesignerSidebar';
import AgencySidebar from './AgencySidebar';

const RoleSidebar = ({ role, agencyId, isAdmin }) => {
  if (isAdmin) return <AdminSidebar />;
  if (role === 'admin') return <AdminSidebar />;
  if (role === 'designer') return <DesignerSidebar />;
  if (role === 'agency') return <AgencySidebar agencyId={agencyId} />;
  if (role === 'project-manager' || role === 'ops') return <Sidebar agencyId={agencyId} role={role} />;
  return <Sidebar agencyId={['manager', 'editor'].includes(role) ? null : agencyId} role={role} />;
};

export default RoleSidebar;
