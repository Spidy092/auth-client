import { setConfig, getConfig } from './config';
import { login, logout, handleCallback, refreshToken } from './core';
import { getToken, setToken, clearToken } from './token';
import api from './api';
import { decodeToken, isTokenExpired } from './utils/jwt';

export const auth = {
  // 🔧 Config
  setConfig,
  getConfig,

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
      if (token && isTokenExpired(token, 300)) { // Refresh 5 min before expiry
        try {
          await refreshToken();
        } catch (err) {
          console.error('Auto-refresh failed:', err);
          clearInterval(interval);
        }
      }
    }, 60000); // Check every minute
    return interval;
  }
};

export { AuthProvider } from './react/AuthProvider';
export { useAuth } from './react/useAuth';