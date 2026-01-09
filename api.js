// auth-client/api.js
import axios from 'axios';
import { getConfig } from './config';
import { getToken, setToken, clearToken } from './token';
import { refreshToken as performRefresh } from './core';

const api = axios.create({
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const runtimeConfig = getConfig();

  if (!config.baseURL) {

    config.baseURL = runtimeConfig?.authBaseUrl || 'http://auth.local.test:4000/auth';
  }

  if (!config.headers) {
    config.headers = {};
  }

  if (runtimeConfig?.clientKey && !config.headers['X-Client-Key']) {
    config.headers['X-Client-Key'] = runtimeConfig.clientKey;
  }

  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

let refreshPromise = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error || {};

    if (!response || !config) {
      return Promise.reject(error);
    }

    if (response.status !== 401 || config._retry) {
      return Promise.reject(error);
    }

    config._retry = true;

    if (!refreshPromise) {
      refreshPromise = performRefresh()
        .then((newToken) => {
          refreshPromise = null;
          if (newToken) {
            setToken(newToken);
          }
          return newToken;
        })
        .catch((refreshError) => {
          refreshPromise = null;
          clearToken();
          throw refreshError;
        });
    }

    try {
      const refreshedToken = await refreshPromise;

      if (refreshedToken) {
        config.headers.Authorization = `Bearer ${refreshedToken}`;
        return api(config);
      }
    } catch (refreshErr) {
      return Promise.reject(refreshErr);
    }

    return Promise.reject(error);
  }
);

api.validateSession = async () => {
  try {
    const response = await api.get('/account/validate-session');
    return response.data.valid;
  } catch (err) {
    if (err.response?.status === 401) {
      return false;
    }
    throw err;
  }
};

export default api;
