// auth-client/api.js
import axios from 'axios';
import { getConfig } from './config.js';
import { getToken, setToken, clearToken } from './token.js';
import { refreshToken as performRefresh } from './core.js';
import { diagnosticHeaders, emitAuthDiagnostic } from './diagnostics.js';

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
  Object.assign(config.headers, diagnosticHeaders());

  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

let refreshPromise = null;

// Event dispatched when the server refuses a request because the client is in
// single-organization mode. Consumers (e.g. an organization context) can listen
// and re-resolve to the user's primary organization.
//   - 403 TENANT_ACCESS_DENIED: the selected/sent organization is not accessible
//     under single-org mode (a non-primary org).
//   - 409 SINGLE_ORGANIZATION_MODE: a join/create was refused because the user
//     may only belong to one organization.
export const SINGLE_ORG_DENIED_EVENT = 'auth:single-org-denied';

function responseErrorCode(response) {
  const data = response?.data;
  return data?.errors?.code || data?.code || null;
}

export function isTenantAccessDenied(response) {
  return response?.status === 403 && responseErrorCode(response) === 'TENANT_ACCESS_DENIED';
}

export function isSingleOrganizationMode(response) {
  return response?.status === 409 && responseErrorCode(response) === 'SINGLE_ORGANIZATION_MODE';
}

function dispatchSingleOrgDenied(response) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(SINGLE_ORG_DENIED_EVENT, {
    detail: {
      code: responseErrorCode(response),
      status: response?.status || null,
      currentOrgId: response?.data?.errors?.current_org_id || null,
    },
  }));
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error || {};

    if (!response || !config) {
      return Promise.reject(error);
    }

    // Single-org refusals: surface a framework-agnostic event so the app can
    // drop a stale non-primary selection and re-resolve to the primary org.
    // The error still rejects so the immediate caller can handle it too.
    if (isTenantAccessDenied(response) || isSingleOrganizationMode(response)) {
      dispatchSingleOrgDenied(response);
      return Promise.reject(error);
    }

    if (response.status !== 401 || config._retry) {
      return Promise.reject(error);
    }

    config._retry = true;
    emitAuthDiagnostic('API_401_REFRESH_STARTED', 'PENDING', 'HTTP_401', {
      clientKey: getConfig().clientKey,
      status: 401,
    });

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
          // ❌ REMOVED: clearToken() here caused cascading logouts.
          // The calling code (AuthContext) handles token clearing
          // based on the specific error context (401 vs network error).
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
      // Refresh failed — propagate the ORIGINAL 401 error so the caller
      // knows the request was unauthorized (not a refresh-specific error).
      return Promise.reject(error);
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
