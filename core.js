// auth-client/core.js
import { setToken, clearToken, getToken } from './token';
import { getConfig, isRouterMode } from './config';

// ✅ Track callback state with listeners
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

  // Store app info
  sessionStorage.setItem('originalApp', clientKey);
  sessionStorage.setItem('returnUrl', redirectUri);

  // ✅ Smart Router Logic
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
  const backendLoginUrl = `${authBaseUrl}/login/${clientKey}?redirect_uri=${encodeURIComponent(redirectUri)}`;
  
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
  const centralizedLoginUrl = `${accountUiUrl}/login?client=${clientKey}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  
  console.log('🔄 Client Login: Redirecting to centralized login', {
    clientKey,
    redirectUri,
    centralizedUrl: centralizedLoginUrl
  });

  window.location.href = centralizedLoginUrl;
}

export function logout() {
  // ✅ Reset callback state on logout
  resetCallbackState();
  
  const { clientKey, authBaseUrl, accountUiUrl } = getConfig();
  const token = getToken();

  console.log('🚪 Smart Logout initiated:', {
    mode: isRouterMode() ? 'ROUTER' : 'CLIENT',
    clientKey,
    hasToken: !!token
  });

  // Clear local storage immediately (this will trigger listeners)
  clearToken();
  sessionStorage.clear();

  if (isRouterMode()) {
    return routerLogout(clientKey, authBaseUrl, accountUiUrl, token);
  } else {
    return clientLogout(clientKey, accountUiUrl);
  }
}

// ✅ Router logout
async function routerLogout(clientKey, authBaseUrl, accountUiUrl, token) {
  console.log('🏭 Router Logout: Backend logout for all sessions');
  
  if (token) {
    try {
      const response = await fetch(`${authBaseUrl}/logout/${clientKey}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('Backend logout response:', data);

      if (data.keycloakLogoutUrl) {
        window.location.href = data.keycloakLogoutUrl;
        return;
      }
    } catch (error) {
      console.warn('Backend logout failed:', error);
    }
  }

  window.location.href = '/login';
}

// ✅ Client logout
function clientLogout(clientKey, accountUiUrl) {
  console.log('🔄 Client Logout: Redirecting to centralized login');
  const logoutUrl = `${accountUiUrl}/login?client=${clientKey}&logout=true`;
  window.location.href = logoutUrl;
}

export function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const accessToken = params.get('access_token');
  const error = params.get('error');

  console.log('🔄 Handling authentication callback:', {
    mode: isRouterMode() ? 'ROUTER' : 'CLIENT',
    hasAccessToken: !!accessToken,
    error,
    alreadyProcessed: callbackProcessed
  });

  // ✅ If already processed and we have a token, return it
  if (callbackProcessed) {
    const existingToken = getToken();
    if (existingToken) {
      console.log('🔄 Callback already processed, returning existing token');
      return existingToken;
    }
  }

  // ✅ Mark as processed first
  callbackProcessed = true;

  // Clean up session storage (only once)
  sessionStorage.removeItem('originalApp');
  sessionStorage.removeItem('returnUrl');

  if (error) {
    throw new Error(`Authentication failed: ${error}`);
  }

  if (accessToken) {
    // ✅ This will trigger token listeners
    setToken(accessToken);
    console.log('✅ Token set successfully, listeners notified');
    return accessToken;
  }

  throw new Error('No access token found in callback URL');
}

// ✅ Reset callback state
export function resetCallbackState() {
  callbackProcessed = false;
  console.log('🔄 Callback state reset');
}

export async function refreshToken() {
  const { clientKey, authBaseUrl } = getConfig();
  
  console.log('🔄 Refreshing token:', { 
    clientKey, 
    mode: isRouterMode() ? 'ROUTER' : 'CLIENT' 
  });
  
  try {
    const response = await fetch(`${authBaseUrl}/refresh/${clientKey}`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Refresh failed');
    }

    const { access_token } = await response.json();
    // ✅ This will trigger token listeners
    setToken(access_token);
    console.log('✅ Token refresh successful, listeners notified');
    return access_token;
  } catch (err) {
    // ✅ This will trigger token listeners
    clearToken();
    throw err;
  }
}



export async function refreshToken() {
  const { clientKey, authBaseUrl } = getConfig();
  
  console.log('🔄 Refreshing token:', { clientKey, mode: isRouterMode() ? 'ROUTER' : 'CLIENT' });
  
  try {
    const response = await fetch(`${authBaseUrl}/refresh/${clientKey}`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Refresh failed');
    }

    const { access_token } = await response.json();
    setToken(access_token);
    return access_token;
  } catch (err) {
    clearToken();
    throw err;
  }
}
