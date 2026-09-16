// auth-client/core.js - MINIMAL WORKING VERSION

import {
  setToken,
  clearToken,
  getIdToken,
  setIdToken,
  clearIdToken,
  getToken,
  getRefreshToken,
  setRefreshToken,
  clearRefreshToken,
  getTimeUntilExpiry,
} from './token.js';
import { getConfig, isRouterMode } from './config.js';
import {
  acquireLoginLock,
  clearLoginLock,
  diagnosticHeaders,
  emitAuthDiagnostic,
  getDiagnosticContext,
  resetDiagnosticContext,
} from './diagnostics.js';

let callbackProcessed = false;

// Upper bound for the logout POST. A hung request aborts and falls through to
// the front-channel (sso) or local (client) fallback, so logout never hangs.
const LOGOUT_REQUEST_TIMEOUT_MS = 8000;

// Post a same-origin cross-tab logout signal. Best-effort: never throws, so a
// missing BroadcastChannel API or a closed channel can't block logout. The
// message shape {type:'LOGOUT', reason} matches what consuming apps already
// listen for; 'user_logout' marks an explicit user action so receivers can
// land on a "signed out" page rather than a "session expired" one.
function broadcastLogoutToTabs(clientKey, reason = 'user_logout') {
  try {
    if (typeof BroadcastChannel === 'undefined') return;
    const { logoutChannelName } = getConfig();
    if (!logoutChannelName) return;
    const channel = new BroadcastChannel(logoutChannelName);
    channel.postMessage({ type: 'LOGOUT', reason, clientKey });
    channel.close();
  } catch (err) {
    // Cross-tab notification is an enhancement, not a requirement for logout.
    console.warn('⚠️ Cross-tab logout broadcast failed (non-fatal):', err?.message || err);
  }
}

export function login(clientKeyArg, redirectUriArg, options = {}) {
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

  if (!clientKey || !redirectUri) {
    emitAuthDiagnostic('LOGIN_REJECTED', 'FAILURE', 'CLIENT_CONFIG_MISSING', { clientKey });
    throw new Error('Missing clientKey or redirectUri');
  }

  if (!acquireLoginLock(clientKey, redirectUri)) {
    emitAuthDiagnostic('LOGIN_DUPLICATE_SUPPRESSED', 'WARNING', 'LOGIN_ALREADY_IN_PROGRESS', { clientKey });
    return false;
  }
  resetDiagnosticContext();
  emitAuthDiagnostic('LOGIN_INITIATED', 'PENDING', 'NONE', { clientKey });

  sessionStorage.setItem('originalApp', clientKey);
  sessionStorage.setItem('returnUrl', redirectUri);

  if (isRouterMode()) {
    // Router mode: Direct backend authentication
    return routerLogin(clientKey, redirectUri, options);
  } else {
    // Client mode: Redirect to centralized login
    return clientLogin(clientKey, redirectUri, options);
  }
}

// ✅ Router mode: Direct backend call
function routerLogin(clientKey, redirectUri, options = {}) {
  const { authBaseUrl } = getConfig();

  const params = new URLSearchParams();
  if (redirectUri) {
    params.append('redirect_uri', redirectUri);
  }
  if (options.switchAccount || options.switch_account) params.append('switch_account', 'true');
  params.append('correlation_id', getDiagnosticContext().correlationId);
  const query = params.toString();
  const backendLoginUrl = `${authBaseUrl}/login/${clientKey}${query ? `?${query}` : ''}`;

  window.location.href = backendLoginUrl;
}

// ✅ Client mode: Centralized login
function clientLogin(clientKey, redirectUri, options = {}) {
  const { accountUiUrl } = getConfig();

  const params = new URLSearchParams({
    client: clientKey
  });
  if (redirectUri) {
    params.append('redirect_uri', redirectUri);
  }
  if (options.switchAccount || options.switch_account) params.append('switch_account', 'true');
  const centralizedLoginUrl = `${accountUiUrl}/login?${params.toString()}`;

  window.location.href = centralizedLoginUrl;
}

export async function logout(options = {}) {
  resetCallbackState();

  const { clientKey, authBaseUrl, accountUiUrl } = getConfig();
  const scope = options.scope === 'client' ? 'client' : 'sso';
  const token = getToken();
  const idToken = getIdToken();
  const refreshToken = getRefreshToken();

  console.log('🚪 Smart Logout initiated', {
    mode: isRouterMode() ? 'ROUTER' : 'CLIENT',
    clientKey,
    scope,
  });
  emitAuthDiagnostic('LOGOUT_INITIATED', 'PENDING', 'NONE', { clientKey });

  clearToken();
  clearIdToken();
  clearRefreshToken();
  sessionStorage.removeItem('originalApp');
  sessionStorage.removeItem('returnUrl');

  // Tell sibling tabs of this same-origin app to sign out too, natively via
  // BroadcastChannel (the industry-standard multi-tab logout mechanism; see
  // Auth0's SPA SDK). This fires before the network call so other tabs react
  // immediately regardless of the POST outcome. It is best-effort: any failure
  // (unsupported API, closed channel) must never block the logout itself. Note
  // this is same-origin ONLY — cross-application logout is handled by the IdP
  // (Keycloak back-channel logout), not by this channel.
  broadcastLogoutToTabs(clientKey);

  // Every client — router or not — must hit the backend so it can:
  //  1. revoke the refresh token record, and
  //  2. hand back a Keycloak end-session URL so the IdP's SSO cookie is
  //     actually killed. Without step 2 the browser stays signed in at
  //     Keycloak and silently re-authenticates on the next login attempt.
  try {
    // Bound the POST so a hung network (no response, no error) cannot leave a
    // caller awaiting forever. On timeout the fetch rejects with an AbortError
    // and we fall through to the front-channel/local fallback below, so logout
    // always makes progress. AbortSignal.timeout is supported by every browser
    // this SDK targets; guard for older/native runtimes just in case.
    const logoutSignal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(LOGOUT_REQUEST_TIMEOUT_MS)
      : undefined;
    const response = await fetch(`${authBaseUrl}/logout/${clientKey}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...diagnosticHeaders(),
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refreshToken, idToken, scope }),
      ...(logoutSignal ? { signal: logoutSignal } : {})
    });

    if (!response.ok) {
      throw new Error(`Logout failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Logout response:', data);
    emitAuthDiagnostic('LOGOUT_COMPLETED', 'SUCCESS', 'NONE', {
      clientKey,
      status: response.status,
    });

    if (data?.keycloakLogoutUrl) {
      window.location.replace(data.keycloakLogoutUrl);
      return;
    }

    if (data?.logoutRedirectUrl) {
      window.location.replace(data.logoutRedirectUrl);
      return;
    }
  } catch (error) {
    console.warn('⚠️ Logout backend call failed:', error);
    emitAuthDiagnostic('LOGOUT_BACKEND_FAILED', 'FAILURE', 'LOGOUT_REQUEST_FAILED', {
      clientKey,
    });
  }

  // The JSON request can fail after the browser has already cleared local
  // state. For SSO logout, finish through the auth service's top-level GET
  // endpoint rather than redirecting straight to an app login page; that
  // endpoint performs RP-initiated Keycloak logout and clears the shared SSO
  // browser session. Do not put an access token in the URL: the httpOnly
  // refresh cookie is sent with this navigation when it is available.
  if (scope === 'sso' && authBaseUrl && clientKey) {
    const frontChannelLogoutUrl = new URL(
      `${authBaseUrl.replace(/\/+$/, '')}/logout/${encodeURIComponent(clientKey)}`
    );
    window.location.replace(frontChannelLogoutUrl.toString());
    return;
  }

  // A client-only logout intentionally preserves the shared Keycloak SSO
  // session, so its fallback must stay local to the application.
  const fallbackUrl = isRouterMode()
    ? new URL('/login', window.location.origin)
    : new URL('/login', accountUiUrl);
  fallbackUrl.searchParams.set('logged_out', 'true');
  fallbackUrl.searchParams.set('client', clientKey);
  fallbackUrl.searchParams.set('scope', scope);
  window.location.replace(fallbackUrl.toString());
}

export function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const accessToken = params.get('access_token');
  const idToken = params.get('id_token');
  const error = params.get('error');

  console.log('🔄 Callback handling:', {
    hasAccessToken: !!accessToken,
    hasIdToken: !!idToken,
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
  clearLoginLock();
  sessionStorage.removeItem('originalApp');
  sessionStorage.removeItem('returnUrl');

  if (error) {
    const errorDescription = params.get('error_description') || error;
    const authError = new Error(`Authentication failed: ${errorDescription}`);
    authError.code = error;
    authError.correlationId = getDiagnosticContext().correlationId;
    emitAuthDiagnostic('CALLBACK_REJECTED', 'FAILURE', error.toUpperCase(), {
      clientKey: getConfig().clientKey,
      state: params.get('state'),
    });
    throw authError;
  }

  if (accessToken) {
    setToken(accessToken);
    if (idToken) setIdToken(idToken);

    // Refresh tokens must never be accepted from a callback URL. The auth
    // service transports them through the httpOnly client cookie; accepting a
    // URL value would put a credential in browser history, referrers, and
    // diagnostics. Keep deleting the legacy parameter below for clean URLs.
    const refreshTokenInUrl = params.get('refresh_token');
    if (refreshTokenInUrl) {
      emitAuthDiagnostic('CALLBACK_REFRESH_TOKEN_IGNORED', 'WARNING', 'REFRESH_TOKEN_IN_URL', {
        clientKey: getConfig().clientKey,
      });
    }

    const url = new URL(window.location);
    url.searchParams.delete('access_token');
    url.searchParams.delete('id_token');
    url.searchParams.delete('refresh_token');
    url.searchParams.delete('state');
    url.searchParams.delete('error');
    url.searchParams.delete('error_description');
    window.history.replaceState({}, '', url);

    console.log('✅ Callback processed successfully, token stored');
    emitAuthDiagnostic('CALLBACK_COMPLETED', 'SUCCESS', 'NONE', {
      clientKey: getConfig().clientKey,
      state: params.get('state'),
    });
    return accessToken;
  }

  emitAuthDiagnostic('CALLBACK_REJECTED', 'FAILURE', 'ACCESS_TOKEN_MISSING', {
    clientKey: getConfig().clientKey,
    state: params.get('state'),
  });
  const missingTokenError = new Error('No access token found in callback URL');
  missingTokenError.code = 'ACCESS_TOKEN_MISSING';
  throw missingTokenError;
}

export function resetCallbackState() {
  callbackProcessed = false;
}

// ✅ Add refresh lock to prevent concurrent refresh calls
let refreshInProgress = false;
let refreshPromise = null;

// Coordinate refreshes across tabs of the same application. The in-memory
// promise above protects one tab; navigator.locks protects multiple tabs on
// the same origin. Auth-service still remains the final authority and its
// replay grace handles browsers that do not implement Web Locks.
async function withCrossTabRefreshLock(clientKey, tokenBeforeRefresh, refreshRequest) {
  const lockName = `auth-refresh-${clientKey}`;
  const run = async () => {
    // Another tab may have completed the rotation while this tab was waiting
    // for the lock. Reuse its access token instead of submitting the consumed
    // refresh cookie a second time.
    try {
      const persistedToken = localStorage.getItem('authToken');
      if (tokenBeforeRefresh && persistedToken && persistedToken !== tokenBeforeRefresh) {
        setToken(persistedToken);
        emitAuthDiagnostic('TOKEN_REFRESH_REUSED_CROSS_TAB', 'SUCCESS', 'CROSS_TAB_ROTATION', {
          clientKey,
        });
        return persistedToken;
      }
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }

    return refreshRequest();
  };

  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request(lockName, run);
  }

  return run();
}

export async function refreshToken() {
  const { clientKey, authBaseUrl } = getConfig();

  // ✅ Prevent concurrent refresh calls
  if (refreshInProgress && refreshPromise) {
    console.log('🔄 Token refresh already in progress, waiting...');
    return refreshPromise;
  }

  refreshInProgress = true;
  refreshPromise = (async () => {
    const tokenBeforeRefresh = getToken();
    const refreshRequest = async () => {
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
            ...diagnosticHeaders(),
            'Content-Type': 'application/json'
          }
        };

        // For HTTP development, send refresh token in body ONLY (header removed per user request)
        if (storedRefreshToken) {
          // requestOptions.headers['X-Refresh-Token'] = storedRefreshToken;
          requestOptions.body = JSON.stringify({ refreshToken: storedRefreshToken });
          console.log('📦 Sending refresh token in body only (Header skipped) v3.0.2');
        }

        const response = await fetch(`${authBaseUrl}/refresh/${clientKey}`, requestOptions);

        if (!response.ok) {
          const errorText = await response.text();
          let serverCode = null;
          try { serverCode = JSON.parse(errorText)?.error || JSON.parse(errorText)?.code; } catch {}
          emitAuthDiagnostic('TOKEN_REFRESH_REJECTED', 'FAILURE', serverCode || `HTTP_${response.status}`, {
            clientKey,
            status: response.status,
          });
          const refreshError = new Error(`Refresh failed: ${response.status}`);
          refreshError.code = serverCode || `HTTP_${response.status}`;
          refreshError.status = response.status;
          throw refreshError;
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
        emitAuthDiagnostic('TOKEN_REFRESH_COMPLETED', 'SUCCESS', 'NONE', { clientKey });
        return access_token;
      } catch (err) {
        console.error('❌ Token refresh error:', err);
        // Only clear tokens on definitive auth failure (server explicitly rejected).
        // Network errors / timeouts should NOT clear tokens — the session may still
        // be valid and the next attempt may succeed.
        const isAuthRejection = err.message?.includes('401') ||
          err.message?.includes('403') ||
          err.message?.includes('invalid_grant') ||
          err.message?.includes('Refresh failed: 4');
        if (isAuthRejection) {
          clearToken();
          clearRefreshToken();
        }
        throw err;
      }
    };

    return withCrossTabRefreshLock(clientKey, tokenBeforeRefresh, refreshRequest);
  })().finally(() => {
    refreshInProgress = false;
    refreshPromise = null;
  });

  return refreshPromise;
}

// Re-establish the session at application startup (or when a signed-out tab is
// told another tab logged in). In memory-only mode (legacyTokenTransport:
// false) a page reload starts with no access token, so the app must ask the
// server for one using the HttpOnly refresh cookie before deciding the user is
// logged out. This is the standard SPA "silent authentication on load" step.
//
// Contract:
//   - If a valid (unexpired) access token is already in memory, resolve true
//     without a network call.
//   - Otherwise attempt exactly one refresh (cookie-borne) and resolve true on
//     success, false on a definitive auth rejection.
//   - Never throw: bootstrap must not crash the app. A network/5xx error
//     resolves false but does NOT clear any session (the caller can retry),
//     matching refreshToken()'s own "don't logout on transient failure" rule.
export async function restoreSession() {
  const current = getToken();
  // Treat a token with >10s of life left as usable, matching isAuthenticated().
  if (current && getTimeUntilExpiry(current) > 10) {
    return true;
  }

  try {
    const token = await refreshToken();
    return !!token;
  } catch (err) {
    // refreshToken() already cleared local state on a definitive auth
    // rejection and left it intact on transient errors. Either way, report
    // "not currently authenticated" without throwing.
    emitAuthDiagnostic('SESSION_RESTORE_FAILED', 'FAILURE', err?.code || 'RESTORE_FAILED', {
      clientKey: getConfig().clientKey,
    });
    return false;
  }
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
        ...diagnosticHeaders(),
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

    const json = await response.json();
    // Support both wrapped { success, data: { valid } } and flat { valid } formats
    const payload = json.data || json;
    return payload.valid === true;
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

  // Track when the tab was last hidden — used to decide if a full
  // server-side validation is warranted after the tab becomes visible.
  let hiddenAt = null;

  // ── Periodic validation (catches admin-deleted sessions) ──
  sessionValidationTimer = setInterval(async () => {
    try {
      const currentToken = getToken();
      if (!currentToken) {
        console.log('⏸️ No token, stopping session validation');
        stopSessionMonitor();
        return;
      }

      // If token is expired, refresh first so the validation call succeeds
      const ttl = getTimeUntilExpiry(currentToken);
      if (ttl <= 0) {
        console.log('Token expired before periodic check - refreshing');
        try {
          await refreshToken();
        } catch (refreshErr) {
          console.log('Periodic refresh failed - notifying consumer');
          notifySessionInvalid('session_expired');
          return;
        }
      }

      console.log('Validating session...');
      const isValid = await validateCurrentSession();

      if (!isValid) {
        console.log('❌ Session no longer valid on server');
        notifySessionInvalid('session_deleted');
      } else {
        console.log('✅ Session still valid');
      }
    } catch (error) {
      console.warn('⚠️ Session validation check failed:', error.message);
      // Don't invalidate on network errors - wait for next check
    }
  }, sessionValidationInterval);

  // ── Visibility-based validation (smart, enterprise-grade) ──
  if (validateOnVisibility && typeof document !== 'undefined') {
    visibilityHandler = async () => {
      // ── Tab hidden: record timestamp ──
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }

      // ── Tab visible: decide what to do ──
      if (document.visibilityState === 'visible') {
        const currentToken = getToken();
        if (!currentToken) return;

        const ttl = getTimeUntilExpiry(currentToken);
        const hiddenDuration = hiddenAt ? Date.now() - hiddenAt : 0;
        hiddenAt = null;

        // ── Case 1: Token still valid & tab was hidden briefly ──
        // No network call needed — everything is fine.
        if (ttl > 0 && hiddenDuration < sessionValidationInterval) {
          console.log(`👁️ Tab visible — token valid (${Math.round(ttl)}s left), hidden for ${Math.round(hiddenDuration / 1000)}s — skipping validation`);
          return;
        }

        // ── Case 2: Token still valid BUT tab was hidden longer than validation interval ──
        // Validate with server to catch admin-deleted sessions.
        if (ttl > 0 && hiddenDuration >= sessionValidationInterval) {
          console.log(`👁️ Tab visible — token valid but hidden for ${Math.round(hiddenDuration / 1000)}s — server-validating`);
          try {
            const isValid = await validateCurrentSession();
            if (isValid) {
              console.log('✅ Session confirmed valid on server');
              return;
            }
            // Server says invalid despite valid token — admin deleted session
            console.log('❌ Session deleted by admin while tab was hidden');
            stopSessionMonitor();
            stopProactiveRefresh();
            clearToken();
            clearRefreshToken();
            notifySessionInvalid('session_deleted_while_hidden');
            return;
          } catch (error) {
            // Network error — give benefit of the doubt, token is valid
            console.warn('⚠️ Server validation failed (network), token still valid — continuing');
            return;
          }
        }

        // ── Case 3: Token expired (browser throttled the refresh timer) ──
        // Try silent refresh — this is the most common case.
        console.log('⚠️ Token expired while tab was hidden — attempting silent refresh');
        try {
          await refreshToken();
          console.log('✅ Token silently refreshed — session restored');

          // If hidden for a long time, also verify the session on server
          if (hiddenDuration >= sessionValidationInterval) {
            const isValid = await validateCurrentSession();
            if (!isValid) {
              console.log('❌ Token refreshed but session deleted on server');
              stopSessionMonitor();
              stopProactiveRefresh();
              clearToken();
              clearRefreshToken();
              notifySessionInvalid('session_deleted_while_hidden');
            }
          }
          return;
        } catch (refreshErr) {
          console.log('❌ Silent refresh failed — session genuinely expired:', refreshErr.message);
        }

        // Both refresh AND validation failed — session truly dead
        stopSessionMonitor();
        stopProactiveRefresh();
        clearToken();
        clearRefreshToken();
        notifySessionInvalid('session_deleted_while_hidden');
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
