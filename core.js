// auth-client/core.js
import {
  setToken,
  clearToken,
  getToken,
  setRefreshToken,
  getRefreshToken,
  clearRefreshToken,
} from './token';
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
  clearRefreshToken();
  sessionStorage.removeItem('originalApp');
  sessionStorage.removeItem('returnUrl');

  if (isRouterMode()) {
    return routerLogout(clientKey, authBaseUrl, accountUiUrl, token);
  } else {
    return clientLogout(clientKey, accountUiUrl);
  }
}

// ✅ Router logout
async function routerLogout(clientKey, authBaseUrl, accountUiUrl, token) {
  console.log('🏭 Enhanced Router Logout with sessionStorage');

  const refreshToken = getRefreshToken();
  console.log('Refresh token available:', refreshToken ? 'FOUND' : 'MISSING');

  try {
    const response = await fetch(`${authBaseUrl}/logout/${clientKey}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        refreshToken: refreshToken // Send in body
      })
    });

    const data = await response.json();
    console.log('✅ Logout response:', data);

    // Clear stored tokens
    clearRefreshToken();
    clearToken();

    // Delay before redirect
    await new Promise(resolve => setTimeout(resolve, 5000)); // ⏳ wait 5 sec

    if (data.success && data.keycloakLogoutUrl) {
      window.location.href = data.keycloakLogoutUrl;
      return;
    }

  } catch (error) {
    console.warn('⚠️ Logout failed:', error);
    clearRefreshToken();
    clearToken();
  }

  // Delay before fallback redirect
  await new Promise(resolve => setTimeout(resolve, 5000)); // ⏳ wait 5 sec
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
  const refreshToken = params.get('refresh_token'); // CAPTURE THIS
  const error = params.get('error');

  console.log('🔄 Enhanced callback handling:', {
    hasAccessToken: !!accessToken,
    hasRefreshToken: !!refreshToken,
    error
  });

  if (callbackProcessed) {
    const existingToken = getToken();
    if (existingToken) return existingToken;
  }

  callbackProcessed = true;
  sessionStorage.removeItem('originalApp');
  sessionStorage.removeItem('returnUrl');

  if (error) {
    throw new Error(`Authentication failed: ${error}`);
  }

  if (accessToken) {
    setToken(accessToken);

    // Store refresh token for future refresh calls
    if (refreshToken) {
      setRefreshToken(refreshToken);
      console.log('✅ Refresh token persisted');
    }
    
    // Clean URL parameters
    const url = new URL(window.location);
    url.searchParams.delete('access_token');
    url.searchParams.delete('refresh_token'); // Remove this too
    url.searchParams.delete('state');
    window.history.replaceState({}, '', url);
    
    return accessToken;
  }

  throw new Error('No access token found in callback URL');
}



// ✅ Reset callback state
export function resetCallbackState() {
  callbackProcessed = false;
  console.log('🔄 Callback state reset');
}

// auth-client/core.js
export async function refreshToken() {
  const { clientKey, authBaseUrl } = getConfig();
  const refreshTokenValue = getRefreshToken(); // ✅ Now checks both cookie & localStorage

  console.log('🔄 Refreshing token:', {
    clientKey,
    mode: isRouterMode() ? 'ROUTER' : 'CLIENT',
    hasRefreshToken: !!refreshTokenValue
  });

  if (!refreshTokenValue) {
    console.warn('⚠️ No refresh token available for refresh');
    clearToken();
    throw new Error('No refresh token available');
  }

  try {
    const response = await fetch(`${authBaseUrl}/refresh/${clientKey}`, {
      method: 'POST',
      credentials: 'include', // ✅ Sends cookie if available
      headers: {
        'Content-Type': 'application/json',
        'X-Refresh-Token': refreshTokenValue // ✅ Also send in header as fallback
      },
      body: JSON.stringify({
        refreshToken: refreshTokenValue // ✅ Also send in body
      })
    });

    if (!response.ok) {
      throw new Error('Refresh failed');
    }

    const { access_token, refresh_token: new_refresh_token } = await response.json();

    // ✅ Update access token (triggers listeners)
    setToken(access_token);

    // ✅ Update refresh token in BOTH storages if backend returned new one
    if (new_refresh_token) {
      setRefreshToken(new_refresh_token);
    }

    console.log('✅ Token refresh successful, listeners notified');
    return access_token;
  } catch (err) {
    console.error('❌ Token refresh failed:', err);
    // ✅ Clear everything on refresh failure
    clearToken();
    clearRefreshToken();
    throw err;
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




// export async function refreshToken() {
//   const { clientKey, authBaseUrl } = getConfig();
  
//   console.log('🔄 Refreshing token:', { clientKey, mode: isRouterMode() ? 'ROUTER' : 'CLIENT' });
  
//   try {
//     const response = await fetch(`${authBaseUrl}/refresh/${clientKey}`, {
//       method: 'POST',
//       credentials: 'include',
//     });

//     if (!response.ok) {
//       throw new Error('Refresh failed');
//     }

//     const { access_token } = await response.json();
//     setToken(access_token);
//     return access_token;
//   } catch (err) {
//     clearToken();
//     throw err;
//   }
// }
