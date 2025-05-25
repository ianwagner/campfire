import Sidebar from './Sidebar';
import AdminSidebar from './AdminSidebar';
import DesignerSidebar from './DesignerSidebar';
import AgencySidebar from './AgencySidebar';

const RoleSidebar = ({ role }) => {
  if (role === 'admin') return <AdminSidebar />;
  if (role === 'designer') return <DesignerSidebar />;
  if (role === 'agency') return <AgencySidebar />;
  return <Sidebar />;
};

export default RoleSidebar;
