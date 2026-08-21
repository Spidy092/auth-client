// auth-client/config.js
import { enableRefreshTokenPersistence } from './token.js';

// ========== SESSION SECURITY CONFIGURATION ==========
// These settings control how the auth-client handles token refresh and session validation
// to ensure deleted sessions in Keycloak are detected quickly.

let config = {
  clientKey: null,
  authBaseUrl: null,
  redirectUri: null,
  accountUiUrl: null,
  isRouter: false, // ✅ Add router flag

  // ========== SESSION SECURITY SETTINGS ==========
  // Buffer time (in seconds) before token expiry to trigger proactive refresh
  // With 5-minute access tokens, refreshing 60s before expiry ensures seamless UX
  tokenRefreshBuffer: 60,

  // Interval (in milliseconds) for periodic session validation
  // Validates that the session still exists in Keycloak (not deleted by admin)
  // Default: 15 minutes (900000ms) - Increased from 2m to avoid frequent checks
  sessionValidationInterval: 15 * 60 * 1000,

  // Enable/disable periodic session validation
  // When enabled, the client will ping the server to verify session is still active
  enableSessionValidation: true,

  // Enable/disable proactive token refresh
  // When enabled, tokens are refreshed before they expire (using tokenRefreshBuffer)
  enableProactiveRefresh: true,

  // Validate session when browser tab becomes visible again
  // Catches session deletions that happened while the tab was inactive
  validateOnVisibility: true,

  // ========== REFRESH TOKEN PERSISTENCE ==========
  // When true, stores refresh token in localStorage even on HTTPS
  // Required for local dev with mkcert/self-signed certs where httpOnly cookies
  // may not work reliably across origins
  // ⚠️ In true production, set to false and rely on httpOnly cookies
  persistRefreshToken: false,
};

const RUNTIME_POLICY_DEFAULTS = {
  tokenRefreshBuffer: 60,
  sessionValidationInterval: 15 * 60 * 1000,
  enableSessionValidation: true,
  enableProactiveRefresh: true,
  validateOnVisibility: true,
};

function validateRuntimePolicy(policy = {}) {
  const numberInRange = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  const result = { ...RUNTIME_POLICY_DEFAULTS };
  if (numberInRange(policy.tokenRefreshBuffer, 10, 300)) result.tokenRefreshBuffer = policy.tokenRefreshBuffer;
  if (numberInRange(policy.sessionValidationInterval, 60000, 86400000)) result.sessionValidationInterval = policy.sessionValidationInterval;
  for (const key of ['enableSessionValidation', 'enableProactiveRefresh', 'validateOnVisibility']) {
    if (typeof policy[key] === 'boolean') result[key] = policy[key];
  }
  return result;
}

export function applyRuntimePolicy(policy = {}) {
  config = { ...config, ...validateRuntimePolicy(policy) };
  return getConfig();
}

export async function loadRuntimePolicy() {
  const { authBaseUrl, clientKey } = config;
  if (!authBaseUrl || !clientKey || typeof fetch !== 'function') return getConfig();
  try {
    const response = await fetch(`${authBaseUrl.replace(/\/+$/, '')}/clients/${encodeURIComponent(clientKey)}/config`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`runtime policy HTTP ${response.status}`);
    const payload = await response.json();
    return applyRuntimePolicy(payload.authentication_policy || {});
  } catch (error) {
    // Runtime config is an enhancement. Safe bounded defaults keep login
    // available during a control-plane outage.
    console.warn('[auth-client] Runtime policy unavailable; using safe defaults', error.message);
    return applyRuntimePolicy({});
  }
}

export function setConfig(customConfig = {}) {
  if (!customConfig.clientKey || !customConfig.authBaseUrl) {
    throw new Error('Missing required config: clientKey and authBaseUrl are required');
  }

  config = {
    ...config,
    ...customConfig,
    redirectUri: customConfig.redirectUri || window.location.origin + '/callback',
    // ✅ Auto-detect router mode
    isRouter: customConfig.isRouter || customConfig.clientKey === 'account-ui'
  };

  // Keep token storage synchronized when consumers reconfigure the singleton.
  enableRefreshTokenPersistence(config.persistRefreshToken);
  if (config.persistRefreshToken) {
    console.log('📦 Refresh token persistence ENABLED (localStorage on HTTPS)');
  }

  console.log(`🔧 Auth Client Mode: ${config.isRouter ? 'ROUTER' : 'CLIENT'}`, {
    clientKey: config.clientKey,
    isRouter: config.isRouter,
    persistRefreshToken: config.persistRefreshToken
  });
}

export function getConfig() {
  return { ...config };
}

// ✅ Helper function
export function isRouterMode() {
  return config.isRouter;
}
