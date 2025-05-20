// © 2025 Studio Tak. All rights reserved.
// This file is part of a proprietary software project. Do not distribute.
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase/config';
import Login from './Login';
import Review from './Review';
import CreateAdGroup from './CreateAdGroup';
import AdGroupDetail from './AdGroupDetail';

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

  if (loading) {
    return <div className="text-center mt-10">Loading...</div>;
  }

  return (
    <Router>
      <div className="min-h-screen flex flex-col">
        <header className="p-2 bg-gray-100 text-sm">
          {user && (
            <nav className="space-x-4">
              <Link to="/">Review</Link>
              <Link to="/create-group">Create Group</Link>
            </nav>
          )}
        </header>
        <div className="flex-grow">
          <Routes>
            <Route path="/login" element={<Login onLogin={() => setUser(auth.currentUser)} />} />
            <Route
              path="/"
              element={user ? <Review user={user} /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/create-group"
              element={user ? <CreateAdGroup /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/ad-group/:id"
              element={user ? <AdGroupDetail /> : <Navigate to="/login" replace />}
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
