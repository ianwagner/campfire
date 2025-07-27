// © 2025 Studio Tak. All rights reserved.
// This file is part of a proprietary software project. Do not distribute.
import React from "react";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
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
import AdminAdGroups from "./AdminAdGroups";
import EditorAdGroups from "./EditorAdGroups";
import AdminRequests from "./AdminRequests";
import EditorRequests from "./EditorRequests";
import AdminDashboard from "./AdminDashboard";
import AgencyDashboard from "./AgencyDashboard";
import Request from "./Request";
import BrandProfile from "./BrandProfile.jsx";
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
import EditorBrands from "./EditorBrands";
import AdminAgencies from "./AdminAgencies";
import AdminRecipeSetup from "./AdminRecipeSetup";
import AdminCopyRecipes from "./AdminCopyRecipes";
import AdminNotifications from "./AdminNotifications";
import ManageMfa from "./ManageMfa";
import RequireMfa from "./RequireMfa";
import SiteSettings from "./SiteSettings";
import RoleSidebar from "./RoleSidebar";
import AgencyThemeSettings from "./AgencyThemeSettings";
import AgencyBrands from "./AgencyBrands";
import AgencyAdGroups from "./AgencyAdGroups";
import PmAdGroups from "./PmAdGroups";
import PmDashboard from "./PmDashboard";
import useTheme from "./useTheme";
import debugLog from "./utils/debugLog";
import useSiteSettings from "./useSiteSettings";
import useAgencyTheme from "./useAgencyTheme";
import FullScreenSpinner from "./FullScreenSpinner";
import { DEFAULT_LOGO_URL } from "./constants";
import useFcmToken from "./useFcmToken";
import useTaggerJobWatcher from "./useTaggerJobWatcher";
import AdminClaimDebug from "./AdminClaimDebug";

const ThemeWatcher = () => {
  useTheme();
  return null;
};

const App = () => {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    debugLog('Auth listener mounted');
    const tokenRefreshed = { current: false };
    const unsub = onAuthStateChanged(auth, (u) => {
      debugLog('Auth state changed', u);
      if (u && !tokenRefreshed.current) {
        tokenRefreshed.current = true;
        u.getIdToken(true).catch((err) => {
          console.error('Failed to refresh ID token', err);
        });
      }
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
  useTaggerJobWatcher();

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

  const location = useLocation();

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
      : role === 'admin'
        ? '/admin/ad-groups'
        : role === 'manager'
          ? '/admin/tickets'
          : role === 'project-manager'
            ? '/pm/dashboard'
            : role === 'editor'
              ? '/editor/tickets'
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
    <>
      <ThemeWatcher />
      {/* <AdminClaimDebug /> Uncomment to check admin claim */}
      <RequireMfa user={user} role={role}>
        <div className="min-h-screen flex">
          {signedIn && (
            <RoleSidebar role={role} isAdmin={isAdmin} agencyId={agencyId} />
          )}
          <div
            className={`flex flex-col flex-grow box-border min-w-0 max-w-full transition-[padding-left] duration-300 ${
              signedIn ? 'md:pl-[var(--sidebar-width)]' : ''
            }`}
          >
            <div className="flex-grow page-transition" key={location.pathname}>
              <Routes location={location}>
            <Route
              path="/login"
              element={
                signedIn ? (
                  <Navigate to={defaultPath} replace />
                ) : (
                  <Login onLogin={() => setUser(auth.currentUser)} />
                )
              }
            />
            <Route
              path="/signup"
              element={
                signedIn ? (
                  <Navigate to={defaultPath} replace />
                ) : (
                  <SignUpStepper />
                )
              }
            />
            <Route
              path="/signup/designer"
              element={
                signedIn ? (
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
                    <DesignerNotifications brandCodes={brandCodes} />
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
                    requiredRole={["admin", "manager"]}
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
                    requiredRole={["admin", "manager"]}
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
              path="/admin/dashboard"
              element={
                user ? (
                  <RoleGuard
                    requiredRole={["admin", "manager"]}
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
              path="/pm/dashboard"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="project-manager"
                    userRole={role} isAdmin={isAdmin}
                    loading={roleLoading}
                  >
                    <PmDashboard />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/admin/tickets"
              element={
                user ? (
                  <RoleGuard
                    requiredRole={["admin", "manager"]}
                    userRole={role} isAdmin={isAdmin}
                    loading={roleLoading}
                  >
                    <AdminRequests />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/editor/tickets"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="editor"
                    userRole={role} isAdmin={isAdmin}
                    loading={roleLoading}
                  >
                    <EditorRequests />
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
                    requiredRole={["admin", "manager"]}
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
              path="/editor/ad-groups"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="editor"
                    userRole={role} isAdmin={isAdmin}
                    loading={roleLoading}
                  >
                    <EditorAdGroups />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/admin/agencies"
              element={
                user ? (
                  <RoleGuard
                    requiredRole={["admin", "manager"]}
                    userRole={role} isAdmin={isAdmin}
                    loading={roleLoading}
                  >
                    <AdminAgencies />
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
              path="/pm/ad-groups"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="project-manager"
                    userRole={role} isAdmin={isAdmin}
                    loading={roleLoading}
                  >
                    <PmAdGroups />
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
              path="/brand-profile"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="client"
                    userRole={role} isAdmin={isAdmin}
                    loading={roleLoading}
                  >
                    <BrandProfile />
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
                    requiredRole={["client", "manager", "project-manager", "editor"]}
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
                    requiredRole={["admin", "client", "agency", "designer", "manager"]}
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
                    requiredRole={["designer", "admin", "agency", "client", "manager", "editor"]}
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
                    requiredRole={["admin", "manager"]}
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
              path="/editor/brands"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="editor"
                    userRole={role} isAdmin={isAdmin}
                    loading={roleLoading}
                  >
                    <EditorBrands />
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
                    requiredRole={["admin", "manager"]}
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
              path="/admin/copy-recipes"
              element={
                user ? (
                  <RoleGuard
                    requiredRole={["admin", "manager"]}
                    userRole={role} isAdmin={isAdmin}
                    loading={roleLoading}
                  >
                    <AdminCopyRecipes />
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
                    requiredRole={["admin", "manager"]}
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
                    requiredRole={["admin", "manager"]}
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
            <Route
              path="/admin/brands/:id"
              element={
                user ? (
                  <RoleGuard
                    requiredRole={["admin", "manager"]}
                    userRole={role} isAdmin={isAdmin}
                    loading={roleLoading}
                  >
                    <BrandProfile />
                  </RoleGuard>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/editor/brands/:id"
              element={
                user ? (
                  <RoleGuard
                    requiredRole="editor"
                    userRole={role} isAdmin={isAdmin}
                    loading={roleLoading}
                  >
                    <BrandProfile />
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
    </>
  );
};

export default App;
