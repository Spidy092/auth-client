// auth-client/core.js - MINIMAL WORKING VERSION

import {
  setToken,
  clearToken,
  getToken,
  setRefreshToken,
  getRefreshToken,
  clearRefreshToken,
} from './token';
import { getConfig, isRouterMode } from './config';

let callbackProcessed = false;

export function login(clientKeyArg, redirectUriArg) {
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

  sessionStorage.setItem('originalApp', clientKey);
  sessionStorage.setItem('returnUrl', redirectUri);

  if (isRouterMode()) {
    return routerLogin(clientKey, redirectUri);
  } else {
    return clientLogin(clientKey, redirectUri);
  }
}

function routerLogin(clientKey, redirectUri) {
  const { authBaseUrl } = getConfig();
  const backendLoginUrl = `${authBaseUrl}/login/${clientKey}?redirect_uri=${encodeURIComponent(redirectUri)}`;
  
  console.log('🏭 Router Login:', backendLoginUrl);
  window.location.href = backendLoginUrl;
}

function clientLogin(clientKey, redirectUri) {
  const { accountUiUrl } = getConfig();
  const centralizedLoginUrl = `${accountUiUrl}/login?client=${clientKey}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  
  console.log('🔄 Client Login:', centralizedLoginUrl);
  window.location.href = centralizedLoginUrl;
}

export function logout() {
  resetCallbackState();
  
  const { clientKey, authBaseUrl, accountUiUrl } = getConfig();
  const token = getToken();

  console.log('🚪 Smart Logout initiated');

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

async function routerLogout(clientKey, authBaseUrl, accountUiUrl, token) {
  console.log('🏭 Router Logout');

  const refreshToken = getRefreshToken();

  try {
    const response = await fetch(`${authBaseUrl}/logout/${clientKey}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        refreshToken: refreshToken
      })
    });

    const data = await response.json();
    console.log('✅ Logout response:', data);

    clearRefreshToken();
    clearToken();

    await new Promise(resolve => setTimeout(resolve, 5000));

    if (data.success && data.keycloakLogoutUrl) {
      window.location.href = data.keycloakLogoutUrl;
      return;
    }

  } catch (error) {
    console.warn('⚠️ Logout failed:', error);
    clearRefreshToken();
    clearToken();
  }

  await new Promise(resolve => setTimeout(resolve, 5000));
  window.location.href = '/login';
}

function clientLogout(clientKey, accountUiUrl) {
  console.log('🔄 Client Logout');
  const logoutUrl = `${accountUiUrl}/login?client=${clientKey}&logout=true`;
  window.location.href = logoutUrl;
}

export function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const error = params.get('error');

  console.log('🔄 Callback handling:', {
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

    if (refreshToken) {
      setRefreshToken(refreshToken);
      console.log('✅ Refresh token persisted');
    }
    
    const url = new URL(window.location);
    url.searchParams.delete('access_token');
    url.searchParams.delete('refresh_token');
    url.searchParams.delete('state');
    window.history.replaceState({}, '', url);
    
    return accessToken;
  }

  throw new Error('No access token found in callback URL');
}

export function resetCallbackState() {
  callbackProcessed = false;
}

export async function refreshToken() {
  const { clientKey, authBaseUrl } = getConfig();
  const refreshTokenValue = getRefreshToken();

  console.log('🔄 Refreshing token');

  if (!refreshTokenValue) {
    console.warn('⚠️ No refresh token available');
    clearToken();
    throw new Error('No refresh token available');
  }

  try {
    const response = await fetch(`${authBaseUrl}/refresh/${clientKey}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Refresh-Token': refreshTokenValue
      },
      body: JSON.stringify({
        refreshToken: refreshTokenValue
      })
    });

    if (!response.ok) {
      throw new Error('Refresh failed');
    }

    const { access_token, refresh_token: new_refresh_token } = await response.json();

    setToken(access_token);
    
    if (new_refresh_token) {
      setRefreshToken(new_refresh_token);
    }

    console.log('✅ Token refresh successful');
    return access_token;
  } catch (err) {
    console.error('❌ Token refresh failed:', err);
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
