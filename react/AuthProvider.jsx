// auth-client/react/AuthProvider.jsx
import React, { createContext, useState, useEffect, useRef } from 'react';
import { getToken, setToken, clearToken } from '../token';
import { getConfig } from '../config';
import { 
  login as coreLogin, 
  logout as coreLogout,
  startSessionSecurity,
  stopSessionSecurity,
  onSessionInvalid
} from '../core';

export const AuthContext = createContext();

export function AuthProvider({ children, onSessionExpired }) {
  const [token, setTokenState] = useState(getToken());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!token); // Loading if we have a token to validate
  const [sessionValid, setSessionValid] = useState(true);
  const sessionSecurityRef = useRef(null);

  // Handle session invalidation (from Keycloak admin deletion or expiry)
  const handleSessionInvalid = (reason) => {
    console.log('🚨 AuthProvider: Session invalidated -', reason);
    setSessionValid(false);
    setUser(null);
    setTokenState(null);
    
    // Call custom callback if provided
    if (onSessionExpired && typeof onSessionExpired === 'function') {
      onSessionExpired(reason);
    }
  };

  // Start session security on mount (when we have a token)
  useEffect(() => {
    if (token && !sessionSecurityRef.current) {
      console.log('🔐 AuthProvider: Starting session security');
      
      // Register session invalid handler
      const unsubscribe = onSessionInvalid(handleSessionInvalid);
      
      // Start proactive refresh + session monitoring
      sessionSecurityRef.current = startSessionSecurity(handleSessionInvalid);
      
      return () => {
        unsubscribe();
        if (sessionSecurityRef.current) {
          sessionSecurityRef.current.stopAll();
          sessionSecurityRef.current = null;
        }
      };
    }
    
    // Cleanup when token is removed
    if (!token && sessionSecurityRef.current) {
      sessionSecurityRef.current.stopAll();
      sessionSecurityRef.current = null;
    }
  }, [token]);

  useEffect(() => {
    console.log('🔍 AuthProvider useEffect triggered:', { 
      hasToken: !!token, 
      tokenLength: token?.length 
    });
    
    if (!token) {
      console.log('⚠️ AuthProvider: No token, setting loading=false');
      setLoading(false);
      return;
    }
    
    const { authBaseUrl } = getConfig();
    if (!authBaseUrl) {
      console.warn('AuthProvider: No authBaseUrl configured');
      setLoading(false);
      return;
    }

    console.log('🌐 AuthProvider: Fetching profile with token...', {
      authBaseUrl,
      tokenPreview: token.slice(0, 50) + '...'
    });

    fetch(`${authBaseUrl}/account/profile`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    })
      .then(res => {
        console.log('📥 Profile response status:', res.status);
        if (!res.ok) throw new Error('Failed to fetch user');
        return res.json();
      })
      .then(userData => {
        console.log('✅ Profile fetched successfully:', userData.email);
        setUser(userData);
        setSessionValid(true);
        setLoading(false);
      })
      .catch(err => {
        console.error('❌ Fetch user error:', err);
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
    // Stop session security before logout
    stopSessionSecurity();
    sessionSecurityRef.current = null;
    
    coreLogout();
    setUser(null);
    setTokenState(null);
    setSessionValid(true);
  };

  const value = {
    token,
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!token && !!user && sessionValid,
    sessionValid,
    setUser,
    setToken: (newToken) => {
      setToken(newToken);
      setTokenState(newToken);
      setSessionValid(true);
    },
    clearToken: () => {
      stopSessionSecurity();
      sessionSecurityRef.current = null;
      clearToken();
      setTokenState(null);
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

