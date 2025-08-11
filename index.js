// auth-client/index.js
import { setConfig, getConfig, isRouterMode } from './config';
import { login, logout, handleCallback, refreshToken } from './core';
import { getToken, setToken, clearToken } from './token';
import api from './api';
import { decodeToken, isTokenExpired } from './utils/jwt';

export const auth = {
  // 🔧 Config
  setConfig,
  getConfig,
  isRouterMode, // ✅ Expose router mode check

  // 🔐 Core flows
  login,
  logout,
  handleCallback,
  refreshToken,

  // 🔑 Token management
  getToken,
  setToken,
  clearToken,

  // 🌐 Authenticated API client
  api,

  // 🧪 Utilities
  decodeToken,
  isTokenExpired,

  // 🔄 Auto-refresh setup
  startTokenRefresh: () => {
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
