// auth-client/react/AuthProvider.jsx
import React, { createContext, useState, useEffect, useRef } from 'react';
import { getToken, setToken, clearToken, addTokenListener } from '../token';
import { getConfig } from '../config';
import { emitAuthDiagnostic } from '../diagnostics';
import { 
  login as coreLogin, 
  logout as coreLogout,
  startSessionSecurity,
  stopSessionSecurity,
  onSessionInvalid
} from '../core';

export const AuthContext = createContext();

export function AuthProvider({ children, onSessionExpired, manageSessionSecurity = true }) {
  const [token, setTokenState] = useState(getToken());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!token); // Loading if we have a token to validate
  const [sessionValid, setSessionValid] = useState(true);
  const sessionSecurityRef = useRef(null);
  const onSessionExpiredRef = useRef(onSessionExpired);
  const recoveryInFlightRef = useRef(null);
  const profileRecoveryTokensRef = useRef(new Set());

  useEffect(() => {
    onSessionExpiredRef.current = onSessionExpired;
  }, [onSessionExpired]);

  // Keep React synchronized with the canonical token singleton. Refresh
  // wrappers and sibling tabs can update the singleton without calling the
  // provider's setToken helper.
  useEffect(() => {
    const unsubscribe = addTokenListener((nextToken, previousToken) => {
      if (nextToken === previousToken) return;

      setTokenState(nextToken);
      if (nextToken) {
        setSessionValid(true);
        setLoading(true);
      } else {
        setSessionValid(false);
        setUser(null);
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const invalidateLocalSession = () => {
    clearToken();
    setTokenState(null);
    setUser(null);
    setSessionValid(false);
    setLoading(false);
  };

  // Handle session invalidation (from Keycloak admin deletion or expiry)
  const handleSessionInvalid = (reason) => {
    console.log('🚨 AuthProvider: Session invalidated -', reason);

    if (recoveryInFlightRef.current) return recoveryInFlightRef.current;

    const recover = async () => {
      const callback = onSessionExpiredRef.current;
      if (typeof callback === 'function') {
        try {
          await callback(reason);
          const recoveredToken = getToken();
          if (recoveredToken) {
            setTokenState(recoveredToken);
            setSessionValid(true);
            setLoading(true);
            return true;
          }
        } catch (error) {
          await emitAuthDiagnostic('SESSION_RECOVERY_FAILED', 'FAILURE', reason, {
            status: error?.status || null,
            errorCode: error?.code || null,
          });
        }
      }

      invalidateLocalSession();
      return false;
    };

    recoveryInFlightRef.current = recover().finally(() => {
      recoveryInFlightRef.current = null;
    });

    return recoveryInFlightRef.current;
  };

  // Start session security on mount (when we have a token)
  useEffect(() => {
    if (manageSessionSecurity && token && !sessionSecurityRef.current) {
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
    if ((!manageSessionSecurity || !token) && sessionSecurityRef.current) {
      sessionSecurityRef.current.stopAll();
      sessionSecurityRef.current = null;
    }
  }, [manageSessionSecurity, token]);

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

    let cancelled = false;

    const fetchProfile = async (accessToken) => {
      const response = await fetch(`${authBaseUrl}/account/profile`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      });
      console.log('📥 Profile response status:', response.status);
      if (!response.ok) {
        const error = new Error(`Profile request failed: ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response.json();
    };

    const loadProfile = async () => {
      try {
        const responseBody = await fetchProfile(token);
        if (cancelled) return;
        const userData = responseBody?.data ?? responseBody;
        console.log('✅ Profile fetched successfully:', userData.email);
        setUser(userData);
        setSessionValid(true);
        setLoading(false);
      } catch (error) {
        if (cancelled) return;

        const status = Number(error?.status || 0);
        const isUnauthorized = status === 401;
        const callback = onSessionExpiredRef.current;

        await emitAuthDiagnostic(
          'PROFILE_REQUEST_FAILED',
          isUnauthorized ? 'FAILURE' : 'WARNING',
          isUnauthorized ? 'PROFILE_UNAUTHORIZED' : (status ? `PROFILE_HTTP_${status}` : 'PROFILE_NETWORK_ERROR'),
          { status, errorName: error?.name, errorCode: error?.code },
        );

        // Temporary profile/API failures must not destroy a valid session.
        if (!isUnauthorized) {
          console.warn('⚠️ Profile unavailable; retaining the current auth session', error);
          setLoading(false);
          return;
        }

        // Give the application one chance to refresh a rejected access token.
        // The token set prevents an infinite 401 -> refresh -> 401 loop.
        if (typeof callback === 'function' && !profileRecoveryTokensRef.current.has(token)) {
          profileRecoveryTokensRef.current.add(token);
          try {
            await callback('profile_unauthorized');
            const recoveredToken = getToken();
            if (recoveredToken && recoveredToken !== token) {
              setTokenState(recoveredToken);
              setSessionValid(true);
              setLoading(true);
              return;
            }
            if (recoveredToken) {
              const responseBody = await fetchProfile(recoveredToken);
              if (cancelled) return;
              const userData = responseBody?.data ?? responseBody;
              setUser(userData);
              setSessionValid(true);
              setLoading(false);
              return;
            }
          } catch (recoveryError) {
            await emitAuthDiagnostic('PROFILE_RECOVERY_FAILED', 'FAILURE', 'PROFILE_REFRESH_FAILED', {
              status: recoveryError?.status || null,
              errorCode: recoveryError?.code || null,
            });
          }
        }

        invalidateLocalSession();
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = (clientKey, redirectUri, state) => {
    coreLogin(clientKey, redirectUri, state);
  };

  const logout = async (options) => {
    // Stop session security before logout
    stopSessionSecurity();
    sessionSecurityRef.current = null;
    
    try {
      await coreLogout(options);
    } finally {
      setUser(null);
      setTokenState(null);
      setSessionValid(true);
    }
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
      if (newToken) setLoading(true);
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
