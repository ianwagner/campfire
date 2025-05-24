// © 2025 Studio Tak. All rights reserved.
// This file is part of a proprietary software project. Do not distribute.
import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Link,
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
import Request from "./Request";
import BrandSetup from "./BrandSetup";
import AccountSettings from "./AccountSettings";
import RoleGuard from "./RoleGuard";
import useUserRole from "./useUserRole";

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
      <div className="min-h-screen flex flex-col">
        <header className="p-2 bg-gray-100 text-sm">
          {user && role && (
            <div className="flex justify-between items-center">
              <nav className="space-x-4">
                {role === "client" && (
                  <Link to="/dashboard/client">Dashboard</Link>
                )}
                {role === "designer" && (
                  <>
                    <Link to="/dashboard/designer">Dashboard</Link>
                    <Link to="/create-group">Create Group</Link>
                  </>
                )}
              </nav>
              <button onClick={handleLogout} className="btn-logout">
                Log Out
              </button>
            </div>
          )}
        </header>
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
                    requiredRole="designer"
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        <footer className="text-sm text-gray-400 text-center mt-4">
          © 2025 Studio Tak. All rights reserved.
        </footer>
      </div>
    </Router>
  );
};

export default App;
