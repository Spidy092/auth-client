// auth-client/index.js
import { setConfig, getConfig, isRouterMode } from './config';
import {
  login,
  logout,
  handleCallback,
  refreshToken,
  resetCallbackState,
  validateCurrentSession,
  // Session Security Functions
  startProactiveRefresh,
  stopProactiveRefresh,
  startSessionMonitor,
  stopSessionMonitor,
  startSessionSecurity,
  stopSessionSecurity,
  onSessionInvalid
} from './core';
import {
  getToken,
  setToken,
  clearToken,
  setRefreshToken,
  getRefreshToken,
  clearRefreshToken,
  addTokenListener,
  removeTokenListener,
  getListenerCount,
  // Token Expiry Utilities
  getTokenExpiryTime,
  getTimeUntilExpiry,
  willExpireSoon
} from './token';
import api from './api';
import { decodeToken, isTokenExpired, isAuthenticated } from './utils/jwt';

export const auth = {
  // 🔧 Config
  setConfig,
  getConfig,
  isRouterMode,

  // 🔐 Core flows
  login,
  logout,
  handleCallback,
  refreshToken,
  resetCallbackState,
  validateCurrentSession,

  // 🔑 Token management
  getToken,
  setToken,
  clearToken,
  setRefreshToken,     // ✅ Refresh token for HTTP dev
  getRefreshToken,
  clearRefreshToken,
  addTokenListener,    // ✅ Export new functions
  removeTokenListener,
  getListenerCount,    // ✅ Debug function

  // 🌐 Authenticated API client
  api,

  // 🧪 Utilities
  decodeToken,
  isTokenExpired,
  isAuthenticated,

  // ⏱️ Token Expiry Utilities (NEW)
  getTokenExpiryTime,    // Get token expiry as Date object
  getTimeUntilExpiry,    // Get seconds until token expires
  willExpireSoon,        // Check if token expires within N seconds

  // 🔐 Session Security (NEW - Short-lived tokens + Periodic validation)
  startProactiveRefresh,   // Start proactive token refresh before expiry
  stopProactiveRefresh,    // Stop proactive refresh
  startSessionMonitor,     // Start periodic session validation
  stopSessionMonitor,      // Stop session validation
  startSessionSecurity,    // Start both proactive refresh AND session monitoring
  stopSessionSecurity,     // Stop all session security
  onSessionInvalid,        // Register callback for session invalidation

  // 🔄 Legacy auto-refresh (DEPRECATED - use startSessionSecurity instead)
  startTokenRefresh: () => {
    console.warn('⚠️ startTokenRefresh is deprecated. Use startSessionSecurity() instead for better session management.');
    const interval = setInterval(async () => {
      const token = getToken();
      if (token && isTokenExpired(token, 300)) {
        try {
          await refreshToken();
          console.log('🔄 Auto-refresh successful');
        } catch (err) {
          console.error('Auto-refresh failed:', err);
          clearInterval(interval);
        }
      }
    }, 60000);
    return interval;
  }
};

export { AuthProvider } from './react/AuthProvider';
export { useAuth } from './react/useAuth';
export { useSessionMonitor } from './react/useSessionMonitor';

