// auth-client/config.js
import { enableRefreshTokenPersistence } from './token';

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

  // ✅ Wire persistRefreshToken to token.js
  if (config.persistRefreshToken) {
    enableRefreshTokenPersistence(true);
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
