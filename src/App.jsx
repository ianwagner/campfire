// © 2025 Studio Tak. All rights reserved.
// This file is part of a proprietary software project. Do not distribute.
import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase/config";
import Login from "./Login";
import Review from "./Review";
import ClientReview from "./ClientReview";
import CreateAdGroup from "./CreateAdGroup";
import AdGroupDetail from "./AdGroupDetail";
import DesignerDashboard from "./DesignerDashboard";
import ClientDashboard from "./ClientDashboard";
import AdminDashboard from "./AdminDashboard";
import Request from "./Request";
import BrandSetup from "./BrandSetup";
import AccountSettings from "./AccountSettings";
import DesignerNotifications from "./DesignerNotifications";
import DesignerAccountSettings from "./DesignerAccountSettings";
import AdminAccountForm from "./AdminAccountForm";
import AdminAccounts from "./AdminAccounts";
import RoleGuard from "./RoleGuard";
import useUserRole from "./useUserRole";
import AdminBrandForm from "./AdminBrandForm";
import AdminBrands from "./AdminBrands";
import EnrollMfa from "./EnrollMfa";
import RequireMfa from "./RequireMfa";
import SiteSettings from "./SiteSettings";
import RoleSidebar from "./RoleSidebar";

const App = () => {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const { role, brandCodes, loading: roleLoading } = useUserRole(user?.uid);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Failed to sign out", err);
    }
  };

  if (loading || roleLoading) {
    return <div className="text-center mt-10">Loading...</div>;
  }

  if (user && !role) {
    return (
      <div className="flex items-center justify-center min-h-screen text-center">
        No role assigned to this account. Please contact support.
      </div>
    );
  }

  return (
    <Router>
      <RequireMfa user={user} role={role}>
        <div className="min-h-screen flex">
          {user && <RoleSidebar role={role} />}
          <div className="flex flex-col flex-grow" style={{ marginLeft: user ? 250 : 0 }}>
            <div className="flex-grow">
              <Routes>
            <Route
              path="/login"
              element={
                user ? (
                  <Navigate to={`/dashboard/${role}`} replace />
                ) : (
                  <Login onLogin={() => setUser(auth.currentUser)} />
                )
              }
            />
            <Route
              path="/"
              element={
                user ? (
                  <Navigate to={`/dashboard/${role}`} replace />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/dashboard/designer"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="designer"
                    userRole={role}
                    loading={roleLoading}
                  >
                    <DesignerDashboard />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/designer/notifications"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="designer"
                    userRole={role}
                    loading={roleLoading}
                  >
                    <DesignerNotifications />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/designer/account-settings"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="designer"
                    userRole={role}
                    loading={roleLoading}
                  >
                    <DesignerAccountSettings />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/admin/accounts"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="admin"
                    userRole={role}
                    loading={roleLoading}
                  >
                    <AdminAccounts />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/admin/accounts/new"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="admin"
                    userRole={role}
                    loading={roleLoading}
                  >
                    <AdminAccountForm />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/dashboard/client"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="client"
                    userRole={role}
                    loading={roleLoading}
                  >
                    <ClientDashboard user={user} brandCodes={brandCodes} />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/dashboard/admin"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="admin"
                    userRole={role}
                    loading={roleLoading}
                  >
                    <AdminDashboard />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/review/:groupId"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="client"
                    userRole={role}
                    loading={roleLoading}
                  >
                    <ClientReview user={user} brandCodes={brandCodes} />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/request"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="client"
                    userRole={role}
                    loading={roleLoading}
                  >
                    <Request />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/brand-setup"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="client"
                    userRole={role}
                    loading={roleLoading}
                  >
                    <BrandSetup />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/account-settings"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="client"
                    userRole={role}
                    loading={roleLoading}
                  >
                    <AccountSettings />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/enroll-mfa"
              element={
                user ? (
                  <RoleGuard
                    requiredRole={["admin", "client"]}
                    userRole={role}
                    loading={roleLoading}
                  >
                    <EnrollMfa user={user} role={role} />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/create-group"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="designer"
                    userRole={role}
                    loading={roleLoading}
                  >
                    <CreateAdGroup />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/ad-group/:id"
              element={
                user ? (
                  <RoleGuard
                    requiredRole={["designer", "admin"]}
                    userRole={role}
                    loading={roleLoading}
                  >
                    <AdGroupDetail />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/admin/brands"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="admin"
                    userRole={role}
                    loading={roleLoading}
                  >
                    <AdminBrands />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/admin/site-settings"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="admin"
                    userRole={role}
                    loading={roleLoading}
                  >
                    <SiteSettings />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/admin/brands/new"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="admin"
                    userRole={role}
                    loading={roleLoading}
                  >
                    <AdminBrandForm />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
            <footer className="text-sm text-gray-400 text-center mt-4">
              © 2025 Studio Tak. All rights reserved.
            </footer>
          </div>
        </div>
      </RequireMfa>
      </Router>
  );
};

export default App;
