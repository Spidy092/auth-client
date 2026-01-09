// auth-client/core.js - MINIMAL WORKING VERSION

import {
  setToken,
  clearToken,
  getToken,
  setRefreshToken,
  getRefreshToken,
  clearRefreshToken,
} from './token';
import { getConfig, isRouterMode } from './config';

let callbackProcessed = false;

export function login(clientKeyArg, redirectUriArg) {
  // ✅ Reset callback state when starting new login
  resetCallbackState();

  const {
    clientKey: defaultClientKey,
    authBaseUrl,
    redirectUri: defaultRedirectUri,
    accountUiUrl
  } = getConfig();

  const clientKey = clientKeyArg || defaultClientKey;
  const redirectUri = redirectUriArg || defaultRedirectUri;

  console.log('🔄 Smart Login initiated:', {
    mode: isRouterMode() ? 'ROUTER' : 'CLIENT',
    clientKey,
    redirectUri
  });

  if (!clientKey || !redirectUri) {
    throw new Error('Missing clientKey or redirectUri');
  }

  sessionStorage.setItem('originalApp', clientKey);
  sessionStorage.setItem('returnUrl', redirectUri);

  if (isRouterMode()) {
    // Router mode: Direct backend authentication
    return routerLogin(clientKey, redirectUri);
  } else {
    // Client mode: Redirect to centralized login
    return clientLogin(clientKey, redirectUri);
  }
}

// ✅ Router mode: Direct backend call
function routerLogin(clientKey, redirectUri) {
  const { authBaseUrl } = getConfig();

  const params = new URLSearchParams();
  if (redirectUri) {
    params.append('redirect_uri', redirectUri);
  }
  const query = params.toString();
  const backendLoginUrl = `${authBaseUrl}/login/${clientKey}${query ? `?${query}` : ''}`;

  console.log('🏭 Router Login: Direct backend authentication', {
    clientKey,
    redirectUri,
    backendUrl: backendLoginUrl
  });

  window.location.href = backendLoginUrl;
}

// ✅ Client mode: Centralized login
function clientLogin(clientKey, redirectUri) {
  const { accountUiUrl } = getConfig();

  const params = new URLSearchParams({
    client: clientKey
  });
  if (redirectUri) {
    params.append('redirect_uri', redirectUri);
  }
  const centralizedLoginUrl = `${accountUiUrl}/login?${params.toString()}`;

  console.log('🔄 Client Login: Redirecting to centralized login', {
    clientKey,
    redirectUri,
    centralizedUrl: centralizedLoginUrl
  });

  window.location.href = centralizedLoginUrl;
}

export function logout() {
  resetCallbackState();

  const { clientKey, authBaseUrl, accountUiUrl } = getConfig();
  const token = getToken();

  console.log('🚪 Smart Logout initiated');

  clearToken();
  clearRefreshToken();
  sessionStorage.removeItem('originalApp');
  sessionStorage.removeItem('returnUrl');

  if (isRouterMode()) {
    return routerLogout(clientKey, authBaseUrl, accountUiUrl, token);
  } else {
    return clientLogout(clientKey, accountUiUrl);
  }
}

async function routerLogout(clientKey, authBaseUrl, accountUiUrl, token) {
  console.log('🏭 Router Logout');

  const refreshToken = getRefreshToken();

  try {
    const response = await fetch(`${authBaseUrl}/logout/${clientKey}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        refreshToken: refreshToken
      })
    });

    const data = await response.json();
    console.log('✅ Logout response:', data);

    clearRefreshToken();
    clearToken();

    // Skip Keycloak confirmation page - redirect directly to login
    // Backend has already revoked the session/tokens
    console.log('🔄 Redirecting to login (skipping Keycloak confirmation)');
    window.location.href = '/login';

  } catch (error) {
    console.warn('⚠️ Logout failed:', error);
    clearRefreshToken();
    clearToken();
    // Still redirect to login even on error
    window.location.href = '/login';
  }
}

function clientLogout(clientKey, accountUiUrl) {
  console.log('🔄 Client Logout');
  const logoutUrl = `${accountUiUrl}/login?client=${clientKey}&logout=true`;
  window.location.href = logoutUrl;
}

export function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const accessToken = params.get('access_token');
  const error = params.get('error');

  console.log('🔄 Callback handling:', {
    hasAccessToken: !!accessToken,
    error
  });

  // ✅ Prevent duplicate callback processing
  if (callbackProcessed) {
    const existingToken = getToken();
    if (existingToken) {
      console.log('✅ Callback already processed, returning existing token');
      return existingToken;
    }
    // Reset if no token found (might be a retry)
    callbackProcessed = false;
  }

  callbackProcessed = true;
  sessionStorage.removeItem('originalApp');
  sessionStorage.removeItem('returnUrl');

  if (error) {
    const errorDescription = params.get('error_description') || error;
    throw new Error(`Authentication failed: ${errorDescription}`);
  }

  if (accessToken) {
    setToken(accessToken);

    // ✅ For HTTP development, store refresh token from URL
    // In HTTPS production, refresh token is in httpOnly cookie (more secure)
    const refreshTokenInUrl = params.get('refresh_token');
    if (refreshTokenInUrl) {
      const isHttpDev = typeof window !== 'undefined' && window.location?.protocol === 'http:';
      if (isHttpDev) {
        console.log('📦 HTTP dev mode: Storing refresh token from callback URL');
        setRefreshToken(refreshTokenInUrl);
      } else {
        console.log('🔒 HTTPS mode: Refresh token is in httpOnly cookie (ignoring URL param)');
      }
    }

    const url = new URL(window.location);
    url.searchParams.delete('access_token');
    url.searchParams.delete('refresh_token');
    url.searchParams.delete('state');
    url.searchParams.delete('error');
    url.searchParams.delete('error_description');
    window.history.replaceState({}, '', url);

    console.log('✅ Callback processed successfully, token stored');
    return accessToken;
  }

  throw new Error('No access token found in callback URL');
}

export function resetCallbackState() {
  callbackProcessed = false;
}

// ✅ Add refresh lock to prevent concurrent refresh calls
let refreshInProgress = false;
let refreshPromise = null;

export async function refreshToken() {
  const { clientKey, authBaseUrl } = getConfig();

  // ✅ Prevent concurrent refresh calls
  if (refreshInProgress && refreshPromise) {
    console.log('🔄 Token refresh already in progress, waiting...');
    return refreshPromise;
  }

  refreshInProgress = true;
  refreshPromise = (async () => {
    try {
      // Get stored refresh token (for HTTP development)
      const storedRefreshToken = getRefreshToken();

      console.log('🔄 Refreshing token:', {
        clientKey,
        mode: isRouterMode() ? 'ROUTER' : 'CLIENT',
        hasStoredRefreshToken: !!storedRefreshToken
      });

      // Build request options - send refresh token in body and header for HTTP dev
      const requestOptions = {
        method: 'POST',
        credentials: 'include', // ✅ Include httpOnly cookies (for HTTPS)
        headers: {
          'Content-Type': 'application/json'
        }
      };

      // For HTTP development, send refresh token in body and header
      if (storedRefreshToken) {
        requestOptions.headers['X-Refresh-Token'] = storedRefreshToken;
        requestOptions.body = JSON.stringify({ refreshToken: storedRefreshToken });
      }

      const response = await fetch(`${authBaseUrl}/refresh/${clientKey}`, requestOptions);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Token refresh failed:', response.status, errorText);
        throw new Error(`Refresh failed: ${response.status}`);
      }

      const data = await response.json();
      const { access_token, refresh_token: new_refresh_token } = data;

      if (!access_token) {
        throw new Error('No access token in refresh response');
      }

      // ✅ This will trigger token listeners
      setToken(access_token);

      // ✅ Store new refresh token if provided (token rotation)
      if (new_refresh_token) {
        setRefreshToken(new_refresh_token);
        console.log('🔄 New refresh token stored from rotation');
      }

      console.log('✅ Token refresh successful, listeners notified');
      return access_token;
    } catch (err) {
      console.error('❌ Token refresh error:', err);
      // ✅ This will trigger token listeners
      clearToken();
      clearRefreshToken();
      throw err;
    } finally {
      refreshInProgress = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function validateCurrentSession() {
  try {
    const { authBaseUrl } = getConfig();
    const token = getToken();

    if (!token || !authBaseUrl) {
      return false;
    }

    const response = await fetch(`${authBaseUrl}/account/validate-session`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });

    if (!response.ok) {
      if (response.status === 401) {
        return false;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.valid === true;
  } catch (error) {
    console.warn('Session validation failed:', error.message);
    if (error.message.includes('401')) {
      return false;
    }
    throw error;
  }
}

// ========== SESSION SECURITY: PROACTIVE REFRESH & VALIDATION ==========
// These functions ensure that:
// 1. Tokens are refreshed before they expire (proactive refresh)
// 2. Sessions deleted in Keycloak Admin UI are detected quickly (periodic validation)

let proactiveRefreshTimer = null;
let sessionValidationTimer = null;
let visibilityHandler = null;
let sessionInvalidCallbacks = new Set();

// Register a callback to be called when session is invalidated
export function onSessionInvalid(callback) {
  if (typeof callback === 'function') {
    sessionInvalidCallbacks.add(callback);
  }
  return () => sessionInvalidCallbacks.delete(callback);
}

// Notify all registered callbacks that session is invalid
function notifySessionInvalid(reason = 'session_deleted') {
  console.log('🚨 Session invalidated:', reason);
  sessionInvalidCallbacks.forEach(callback => {
    try {
      callback(reason);
    } catch (err) {
      console.error('Session invalid callback error:', err);
    }
  });
}

// ========== PROACTIVE TOKEN REFRESH ==========
// Schedules token refresh before expiry to ensure seamless UX

export function startProactiveRefresh() {
  const { enableProactiveRefresh, tokenRefreshBuffer } = getConfig();

  if (!enableProactiveRefresh) {
    console.log('⏸️ Proactive refresh disabled by config');
    return null;
  }

  // Clear any existing timer
  stopProactiveRefresh();

  const token = getToken();
  if (!token) {
    console.log('⏸️ No token, skipping proactive refresh setup');
    return null;
  }

  const { getTimeUntilExpiry } = require('./token');
  const timeUntilExpiry = getTimeUntilExpiry(token);

  if (timeUntilExpiry <= 0) {
    console.log('⚠️ Token already expired, attempting immediate refresh');
    refreshToken().catch(err => {
      console.error('❌ Immediate refresh failed:', err);
      notifySessionInvalid('token_expired');
    });
    return null;
  }

  // Schedule refresh for (expiry - buffer) seconds from now
  const refreshIn = Math.max(0, (timeUntilExpiry - tokenRefreshBuffer)) * 1000;

  console.log(`🔄 Scheduling proactive refresh in ${Math.round(refreshIn / 1000)}s (token expires in ${timeUntilExpiry}s)`);

  proactiveRefreshTimer = setTimeout(async () => {
    try {
      console.log('🔄 Proactive token refresh triggered');
      await refreshToken();
      console.log('✅ Proactive refresh successful, scheduling next refresh');
      // Schedule next refresh after successful refresh
      startProactiveRefresh();
    } catch (err) {
      console.error('❌ Proactive refresh failed:', err);

      // Check if this is a permanent failure (token revoked, invalid, etc.)
      const errorMessage = err.message?.toLowerCase() || '';
      const isPermanentFailure =
        errorMessage.includes('401') ||
        errorMessage.includes('revoked') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('expired') ||
        errorMessage.includes('unauthorized');

      if (isPermanentFailure) {
        console.log('🚨 Token permanently invalid, triggering session expiry');
        notifySessionInvalid('refresh_token_revoked');
      } else {
        // Temporary failure (network issue), try again in 30 seconds
        proactiveRefreshTimer = setTimeout(() => startProactiveRefresh(), 30000);
      }
    }
  }, refreshIn);

  return proactiveRefreshTimer;
}

export function stopProactiveRefresh() {
  if (proactiveRefreshTimer) {
    clearTimeout(proactiveRefreshTimer);
    proactiveRefreshTimer = null;
    console.log('⏹️ Proactive refresh stopped');
  }
}

// ========== PERIODIC SESSION VALIDATION ==========
// Validates with server that session still exists in Keycloak
// Catches session deletions from Keycloak Admin UI

export function startSessionMonitor(onInvalid) {
  const { enableSessionValidation, sessionValidationInterval, validateOnVisibility } = getConfig();

  if (!enableSessionValidation) {
    console.log('⏸️ Session validation disabled by config');
    return null;
  }

  // Register callback if provided
  if (onInvalid && typeof onInvalid === 'function') {
    sessionInvalidCallbacks.add(onInvalid);
  }

  // Clear any existing timer
  stopSessionMonitor();

  const token = getToken();
  if (!token) {
    console.log('⏸️ No token, skipping session monitor setup');
    return null;
  }

  console.log(`👁️ Starting session monitor (interval: ${sessionValidationInterval / 1000}s)`);

  // Periodic validation
  sessionValidationTimer = setInterval(async () => {
    try {
      const currentToken = getToken();
      if (!currentToken) {
        console.log('⏸️ No token, stopping session validation');
        stopSessionMonitor();
        return;
      }

      console.log('🔍 Validating session...');
      const isValid = await validateCurrentSession();

      if (!isValid) {
        console.log('❌ Session no longer valid on server');
        stopSessionMonitor();
        stopProactiveRefresh();
        clearToken();
        clearRefreshToken();
        notifySessionInvalid('session_deleted');
      } else {
        console.log('✅ Session still valid');
      }
    } catch (error) {
      console.warn('⚠️ Session validation check failed:', error.message);
      // Don't invalidate on network errors - wait for next check
    }
  }, sessionValidationInterval);

  // Visibility-based validation (when tab becomes visible again)
  if (validateOnVisibility && typeof document !== 'undefined') {
    visibilityHandler = async () => {
      if (document.visibilityState === 'visible') {
        const currentToken = getToken();
        if (!currentToken) return;

        console.log('👁️ Tab visible - validating session');
        try {
          const isValid = await validateCurrentSession();
          if (!isValid) {
            console.log('❌ Session expired while tab was hidden');
            stopSessionMonitor();
            stopProactiveRefresh();
            clearToken();
            clearRefreshToken();
            notifySessionInvalid('session_deleted_while_hidden');
          }
        } catch (error) {
          console.warn('⚠️ Visibility check failed:', error.message);
        }
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);
  }

  return sessionValidationTimer;
}

export function stopSessionMonitor() {
  if (sessionValidationTimer) {
    clearInterval(sessionValidationTimer);
    sessionValidationTimer = null;
    console.log('⏹️ Session monitor stopped');
  }

  if (visibilityHandler && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
}

// ========== COMBINED SESSION SECURITY ==========
// Start both proactive refresh and session monitoring

export function startSessionSecurity(onSessionInvalidCallback) {
  console.log('🔐 Starting session security (proactive refresh + session monitoring)');

  startProactiveRefresh();
  startSessionMonitor(onSessionInvalidCallback);

  return {
    stopAll: () => {
      stopProactiveRefresh();
      stopSessionMonitor();
    }
  };
}

export function stopSessionSecurity() {
  stopProactiveRefresh();
  stopSessionMonitor();
  sessionInvalidCallbacks.clear();
  console.log('🔐 Session security stopped');
}

