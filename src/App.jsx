// © 2025 Studio Tak. All rights reserved.
// This file is part of a proprietary software project. Do not distribute.
import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase/config";
import Login from "./Login";
import SignUpStepper from "./SignUpStepper.tsx";
import DesignerSignUp from "./DesignerSignUp.tsx";
import ReviewRoute from "./ReviewRoute";
import AdGroupDetail from "./AdGroupDetail";
import DesignerDashboard from "./DesignerDashboard";
import ClientDashboard from "./ClientDashboard";
import AdminDashboard from "./AdminDashboard";
import AdminAdGroups from "./AdminAdGroups";
import AgencyDashboard from "./AgencyDashboard";
import Request from "./Request";
import BrandSetup from "./BrandSetup";
import AccountSettings from "./AccountSettings";
import DesignerNotifications from "./DesignerNotifications";
import DesignerAccountSettings from "./DesignerAccountSettings";
import AdminAccountSettings from "./AdminAccountSettings";
import AgencyAccountSettings from "./AgencyAccountSettings";
import AdminAccountForm from "./AdminAccountForm";
import AdminAccounts from "./AdminAccounts";
import RoleGuard from "./RoleGuard";
import useUserRole from "./useUserRole";
import useAdminClaim from "./useAdminClaim";
import AdminBrandForm from "./AdminBrandForm";
import AdminBrands from "./AdminBrands";
import AdminRecipeSetup from "./AdminRecipeSetup";
import AdminNotifications from "./AdminNotifications";
import ManageMfa from "./ManageMfa";
import RequireMfa from "./RequireMfa";
import SiteSettings from "./SiteSettings";
import RoleSidebar from "./RoleSidebar";
import AgencyThemeSettings from "./AgencyThemeSettings";
import AgencyBrands from "./AgencyBrands";
import AgencyAdGroups from "./AgencyAdGroups";
import useTheme from "./useTheme";
import debugLog from "./utils/debugLog";
import useSiteSettings from "./useSiteSettings";
import useAgencyTheme from "./useAgencyTheme";
import FullScreenSpinner from "./FullScreenSpinner";
import { DEFAULT_LOGO_URL } from "./constants";
import useFcmToken from "./useFcmToken";

const ThemeWatcher = () => {
  useTheme();
  return null;
};

const App = () => {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    debugLog('Auth listener mounted');
    const unsub = onAuthStateChanged(auth, (u) => {
      debugLog('Auth state changed', u);
      setUser(u);
      setLoading(false);
    });
    return () => {
      debugLog('Auth listener removed');
      unsub();
    };
  }, []);

  const {
    role: dbRole,
    brandCodes,
    agencyId,
    loading: roleLoading,
  } = useUserRole(user?.uid);
  const { isAdmin, loading: adminLoading } = useAdminClaim();
  const { settings, loading: settingsLoading } = useSiteSettings(!agencyId);
  const { agency, loading: agencyLoading } = useAgencyTheme(agencyId);
  const [logoLoaded, setLogoLoaded] = React.useState(false);
  useFcmToken(user);

  React.useEffect(() => {
    const url = agencyId ? agency.logoUrl || DEFAULT_LOGO_URL : settings.logoUrl || DEFAULT_LOGO_URL;
    if (!url) {
      setLogoLoaded(true);
      return;
    }
    setLogoLoaded(false);
    const img = new Image();
    img.onload = () => setLogoLoaded(true);
    img.onerror = () => setLogoLoaded(true);
    img.src = url;
  }, [agency.logoUrl, settings.logoUrl, agencyId]);

  const ready =
    !loading &&
    !roleLoading &&
    !adminLoading &&
    !settingsLoading &&
    !agencyLoading &&
    logoLoaded;

  React.useEffect(() => {
    if (ready) {
      document.body.classList.remove('pre-theme');
    }
  }, [ready]);


  if (!ready) {
    return <FullScreenSpinner />;
  }

  const signedIn = user && !user.isAnonymous;
  const role = isAdmin ? 'admin' : dbRole;
  const defaultPath = signedIn
    ? role === 'agency'
      ? `/agency/dashboard?agencyId=${agencyId}`
      : `/dashboard/${role}`
    : '/login';
  if (signedIn && !role) {
    return (
      <div className="flex items-center justify-center min-h-screen text-center">
        No role assigned to this account. Please contact support.
      </div>
    );
  }

  return (
    <Router>
      <ThemeWatcher />
      <RequireMfa user={user} role={role}>
        <div className="min-h-screen flex">
          {signedIn && (
            <RoleSidebar role={role} isAdmin={isAdmin} agencyId={agencyId} />
          )}
          <div
            className={`flex flex-col flex-grow box-border min-w-0 max-w-full ${
              signedIn ? 'md:pl-[250px]' : ''
            }`}
          >
            <div className="flex-grow">
              <Routes>
            <Route
              path="/login"
              element={
                user ? (
                  <Navigate to={defaultPath} replace />
                ) : (
                  <Login onLogin={() => setUser(auth.currentUser)} />
                )
              }
            />
            <Route
              path="/signup"
              element={
                user ? (
                  <Navigate to={defaultPath} replace />
                ) : (
                  <SignUpStepper />
                )
              }
            />
            <Route
              path="/signup/designer"
              element={
                user ? (
                  <Navigate to={defaultPath} replace />
                ) : (
                  <DesignerSignUp />
                )
              }
            />
            <Route
              path="/"
              element={
                user ? (
                  <Navigate to={defaultPath} replace />
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
                    userRole={role} isAdmin={isAdmin}
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
                    userRole={role} isAdmin={isAdmin}
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
                    userRole={role} isAdmin={isAdmin}
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
                    userRole={role} isAdmin={isAdmin}
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
                    userRole={role} isAdmin={isAdmin}
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
                    userRole={role} isAdmin={isAdmin}
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
                    userRole={role} isAdmin={isAdmin}
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
              path="/admin/ad-groups"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="admin"
                    userRole={role} isAdmin={isAdmin}
                    loading={roleLoading}
                  >
                    <AdminAdGroups />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/agency/dashboard"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="agency"
                    userRole={role} isAdmin={isAdmin}
                    loading={roleLoading}
                  >
                    <AgencyDashboard />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/agency/theme"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="agency"
                    userRole={role} isAdmin={isAdmin}
                    loading={roleLoading}
                  >
                    <AgencyThemeSettings />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/agency/brands"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="agency"
                    userRole={role} isAdmin={isAdmin}
                    loading={roleLoading}
                  >
                    <AgencyBrands />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/agency/account-settings"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="agency"
                    userRole={role} isAdmin={isAdmin}
                    loading={roleLoading}
                  >
                    <AgencyAccountSettings />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/agency/ad-groups"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="agency"
                    userRole={role} isAdmin={isAdmin}
                    loading={roleLoading}
                  >
                    <AgencyAdGroups />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/review/:groupId"
              element={
                <ReviewRoute />
              }
            />
            <Route
              path="/request"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="client"
                    userRole={role} isAdmin={isAdmin}
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
                    userRole={role} isAdmin={isAdmin}
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
                    userRole={role} isAdmin={isAdmin}
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
              path="/mfa-settings"
              element={
                user ? (
                  <RoleGuard
                    requiredRole={["admin", "client", "agency", "designer"]}
                    userRole={role} isAdmin={isAdmin}
                    loading={roleLoading}
                  >
                    <ManageMfa user={user} role={role} />
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
                    requiredRole={["designer", "admin", "agency", "client"]}
                    userRole={role} isAdmin={isAdmin}
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
                    userRole={role} isAdmin={isAdmin}
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
              path="/admin/ad-recipes"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="admin"
                    userRole={role} isAdmin={isAdmin}
                    loading={roleLoading}
                  >
                    <AdminRecipeSetup />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/admin/notifications"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="admin"
                    userRole={role} isAdmin={isAdmin}
                    loading={roleLoading}
                  >
                    <AdminNotifications />
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
                    userRole={role} isAdmin={isAdmin}
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
              path="/admin/account-settings"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="admin"
                    userRole={role} isAdmin={isAdmin}
                    loading={roleLoading}
                  >
                    <AdminAccountSettings />
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
                    userRole={role} isAdmin={isAdmin}
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
          </div>
        </div>
      </RequireMfa>
      </Router>
  );
};

export default App;
