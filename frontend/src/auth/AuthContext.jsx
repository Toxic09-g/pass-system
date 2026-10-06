import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, AUTH_REQUIRED_EVENT } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // status: 'loading' | 'login' | 'ready'
  const [state, setState] = useState({ status: 'loading', user: null, institutionName: '', adminConfigured: true });

  const refresh = useCallback(async () => {
    try {
      const me = await api.auth.me();
      setState({
        status: me.user ? 'ready' : 'login',
        user: me.user,
        institutionName: me.institution_name,
        adminConfigured: me.admin_configured,
      });
    } catch {
      setState((s) => ({ ...s, status: 'login', user: null }));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Любой запрос получил 401 — сессия закончилась, показываем вход
  useEffect(() => {
    const onAuthRequired = () => setState((s) => ({ ...s, status: 'login', user: null }));
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout().catch(() => {});
    setState((s) => ({ ...s, status: 'login', user: null }));
  }, []);

  return <AuthContext.Provider value={{ ...state, refresh, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
