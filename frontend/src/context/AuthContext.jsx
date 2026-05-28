import { createContext, useContext, useState, useEffect, useRef } from 'react';

const AuthContext = createContext(null);
const TOKEN_KEY   = 'mm_auth_token';
const USER_KEY    = 'mm_auth_user';

export function AuthProvider({ children }) {
  const [token,   setToken]   = useState(null);
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);
  const didInit               = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    try {
      const t = sessionStorage.getItem(TOKEN_KEY);
      const u = sessionStorage.getItem(USER_KEY);

      if (t && u) {
        const parts = t.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(
            atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
          );
          if (payload.exp * 1000 > Date.now()) {
            const parsedUser = JSON.parse(u);
            setToken(t);
            setUser(parsedUser);
            window.__authToken = t;
            console.log('[Auth] Restored:', parsedUser.name, parsedUser.role);
          } else {
            sessionStorage.removeItem(TOKEN_KEY);
            sessionStorage.removeItem(USER_KEY);
          }
        }
      }
    } catch (_) {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  // Keep window.__authToken in sync (used by axios interceptor)
  useEffect(() => {
    if (token) window.__authToken = token;
  }, [token]);

  const login = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    window.__authToken = newToken;
    sessionStorage.setItem(TOKEN_KEY, newToken);
    sessionStorage.setItem(USER_KEY, JSON.stringify(newUser));
    console.log('[Auth] Login:', newUser?.name, newUser?.role);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    window.__authToken = null;
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  };

  const isAdmin         = !!(user && (user.role === 'dev-admin' || user.role === 'ms-admin'));
  const isAuthenticated = !!token && !!user;

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{
          width: '32px', height: '32px',
          border: '3px solid #E6F1FB',
          borderTop: '3px solid #185FA5',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{
      token, user, loading,
      login, logout,
      isAdmin, isAuthenticated
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}

// Backward-compat alias used by hooks/useAuth.js
export const useAuthContext = useAuth;

export default AuthContext;
