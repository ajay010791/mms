import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import useAuth from './hooks/useAuth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import AdminLayout from './pages/admin/AdminLayout';
import AdminAzure from './pages/admin/AdminAzure';
import AdminMetabase from './pages/admin/AdminMetabase';
import AdminSmtp from './pages/admin/AdminSmtp';
import AdminWebhooks from './pages/admin/AdminWebhooks';
import AdminAlertRules from './pages/admin/AdminAlertRules';
import AdminHealth from './pages/admin/AdminHealth';
import AdminPassword from './pages/admin/AdminPassword';
import SmtpOAuthCallback from './pages/admin/SmtpOAuthCallback';

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{ textAlign: 'center' }}>
        <i className="ti ti-loader" style={{
          fontSize: '24px', color: '#185FA5',
          display: 'block', marginBottom: '8px'
        }} />
        <div style={{ fontSize: '13px', color: '#6b7280' }}>Loading...</div>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading)          return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { isAuthenticated, user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const isAdmin = user?.role === 'ms-admin' || user?.role === 'dev-admin';
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

// Separate component so useAuth() is called inside AuthProvider
function AppRoutes() {
  const { isAuthenticated, loading } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={
        loading ? <LoadingScreen /> :
        isAuthenticated ? <Navigate to="/dashboard" replace /> :
        <Login />
      } />

      <Route path="/dashboard" element={
        <ProtectedRoute><Dashboard /></ProtectedRoute>
      } />

      <Route path="/settings" element={
        <ProtectedRoute><Settings /></ProtectedRoute>
      } />

      {/* OAuth2 callback — must be BEFORE the /admin parent route */}
      <Route path="/admin/smtp/callback" element={
        <AdminRoute><SmtpOAuthCallback /></AdminRoute>
      } />

      <Route path="/admin" element={
        <AdminRoute><AdminLayout /></AdminRoute>
      }>
        <Route index element={<Navigate to="/admin/projects" replace />} />
        <Route path="projects"   element={<AdminWebhooks />} />
        <Route path="azure"      element={<AdminAzure />} />
        <Route path="metabase"   element={<AdminMetabase />} />
        <Route path="smtp"       element={<AdminSmtp />} />
        <Route path="alertrules" element={<AdminAlertRules />} />
        <Route path="health"     element={<AdminHealth />} />
        <Route path="password"   element={<AdminPassword />} />
      </Route>

      <Route path="/" element={
        <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />
      } />
      <Route path="*" element={
        <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />
      } />
    </Routes>
  );
}

// App is the root — owns BrowserRouter, AuthProvider, and Toaster.
// No MSAL code lives here at all.
export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <AppRoutes />
        <Toaster position="top-right" toastOptions={{
          duration: 4000,
          style: { borderRadius: '8px', fontSize: '14px' }
        }} />
      </AuthProvider>
    </BrowserRouter>
  );
}
