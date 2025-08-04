// auth-client/react/AuthProvider.jsx
import React, { createContext, useState, useEffect } from 'react';
import { getToken, setToken, clearToken } from '../token';
import { getConfig } from '../config';
import { login as coreLogin, logout as coreLogout } from '../core';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(getToken());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!token); // Loading if we have a token to validate

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    
    const { authBaseUrl } = getConfig();
    if (!authBaseUrl) {
      console.warn('AuthProvider: No authBaseUrl configured');
      setLoading(false);
      return;
    }

    fetch(`${authBaseUrl}/me`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch user');
        return res.json();
      })
      .then(userData => {
        setUser(userData);
        setLoading(false);
      })
      .catch(err => {
        console.error('Fetch user error:', err);
        clearToken();
        setTokenState(null);
        setUser(null);
        setLoading(false);
      });
  }, [token]);

  const login = (clientKey, redirectUri, state) => {
    coreLogin(clientKey, redirectUri, state);
  };

  const logout = () => {
    coreLogout();
    setUser(null);
    setTokenState(null);
  };

  const value = {
    token,
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!token && !!user,
    setUser,
    setToken: (newToken) => {
      setToken(newToken);
      setTokenState(newToken);
    },
    clearToken: () => {
      clearToken();
      setTokenState(null);
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

