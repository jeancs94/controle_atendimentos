import { createContext, useContext, useState, useEffect } from 'react';
import { API_URL } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('auth_token'));
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('auth_user');
    return saved ? JSON.parse(saved) : null;
  });

  const login = async (phone, password) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Credenciais inválidas');
    }
    const data = await res.json();
    localStorage.setItem('auth_token', data.access_token);
    
    const userData = {
      id: data.user_id,
      clinic_id: data.clinic_id,
      full_name: data.full_name,
      role: data.role,
      must_change_password: data.must_change_password,
      mfa_required: data.mfa_required,
      phone,
    };
    
    localStorage.setItem('auth_user', JSON.stringify(userData));
    setToken(data.access_token);
    setUser(userData);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setToken(null);
    setUser(null);
  };

  const clearMustChangePassword = () => {
    if (user) {
      const updated = { ...user, must_change_password: false };
      localStorage.setItem('auth_user', JSON.stringify(updated));
      setUser(updated);
    }
  };

  const isSuperAdmin = user?.role === 'superadmin';
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'; // Technically a superadmin has admin privileges
  const isEmployee = user?.role === 'employee';

  return (
    <AuthContext.Provider value={{ token, user, login, logout, isSuperAdmin, isAdmin, isEmployee, clearMustChangePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
