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
  const { codeChallenge, codeChallengeMethod, state } = options;

  console.log('🔄 Smart Login initiated:', {
    mode: isRouterMode() ? 'ROUTER' : 'CLIENT',
    clientKey,
    redirectUri,
    hasPKCE: !!codeChallenge,
    hasState: !!state
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
    return routerLogin(clientKey, redirectUri, { codeChallenge, codeChallengeMethod, state });
  } else {
    // Client mode: Redirect to centralized login
    return clientLogin(clientKey, redirectUri, { codeChallenge, codeChallengeMethod, state });
  }
}

// ✅ Router mode: Direct backend call
function routerLogin(clientKey, redirectUri, options = {}) {
  const { authBaseUrl } = getConfig();
  const { codeChallenge, codeChallengeMethod, state } = options;
  
  // Build URL with PKCE and state parameters
  const params = new URLSearchParams({
    redirect_uri: redirectUri
  });
  
  if (codeChallenge) {
    params.append('code_challenge', codeChallenge);
    params.append('code_challenge_method', codeChallengeMethod || 'S256');
  }
  
  if (state) {
    params.append('state', state);
  }
  
  const backendLoginUrl = `${authBaseUrl}/login/${clientKey}?${params.toString()}`;
  
  console.log('🏭 Router Login: Direct backend authentication', {
    clientKey,
    redirectUri,
    hasPKCE: !!codeChallenge,
    hasState: !!state,
    backendUrl: backendLoginUrl
  });

  window.location.href = backendLoginUrl;
}

// ✅ Client mode: Centralized login
function clientLogin(clientKey, redirectUri, options = {}) {
  const { accountUiUrl } = getConfig();
  const { codeChallenge, codeChallengeMethod, state } = options;
  
  // Build URL with PKCE and state parameters
  const params = new URLSearchParams({
    client: clientKey,
    redirect_uri: redirectUri
  });
  
  if (codeChallenge) {
    params.append('code_challenge', codeChallenge);
    params.append('code_challenge_method', codeChallengeMethod || 'S256');
  }
  
  if (state) {
    params.append('state', state);
  }
  
  const centralizedLoginUrl = `${accountUiUrl}/login?${params.toString()}`;
  
  console.log('🔄 Client Login: Redirecting to centralized login', {
    clientKey,
    redirectUri,
    hasPKCE: !!codeChallenge,
    hasState: !!state,
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
      method: 'GET',
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
  const error = params.get('error');
  const state = params.get('state');

  console.log('🔄 Enhanced callback handling:', {
    hasAccessToken: !!accessToken,
    error,
    hasState: !!state
  });

  // ✅ Validate state parameter
  if (state) {
    const storedState = sessionStorage.getItem('oauth_state');
    if (storedState && storedState !== state) {
      console.error('❌ State mismatch - possible CSRF attack', {
        received: state.substring(0, 10),
        expected: storedState.substring(0, 10)
      });
      throw new Error('Invalid state parameter - authentication may have been compromised');
    }
    
    // Check state age (prevent replay attacks)
    const stateTimestamp = parseInt(sessionStorage.getItem('pkce_timestamp') || '0', 10);
    const stateAge = Date.now() - stateTimestamp;
    const MAX_STATE_AGE = 10 * 60 * 1000; // 10 minutes
    
    if (stateAge > MAX_STATE_AGE) {
      console.error('❌ State expired', { stateAge });
      throw new Error('Authentication state expired - please try again');
    }
    
    // Clear state after validation
    sessionStorage.removeItem('oauth_state');
    sessionStorage.removeItem('pkce_timestamp');
  }

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
  sessionStorage.removeItem('originalApp');
  sessionStorage.removeItem('returnUrl');
  sessionStorage.removeItem('pkce_code_verifier'); // Clear PKCE verifier after use

  if (error) {
    const errorDescription = params.get('error_description') || error;
    throw new Error(`Authentication failed: ${errorDescription}`);
  }

  if (accessToken) {
    setToken(accessToken);
    
    // ✅ Refresh token should NOT be in URL - it's in httpOnly cookie
    // If refresh token is in URL, log warning but don't store it client-side
    const refreshTokenInUrl = params.get('refresh_token');
    if (refreshTokenInUrl) {
      console.warn('⚠️ SECURITY WARNING: Refresh token found in URL - this should not happen!');
      // DO NOT store refresh token from URL - it should only be in httpOnly cookie
    }
    
    // Clean URL parameters
    const url = new URL(window.location);
    url.searchParams.delete('access_token');
    url.searchParams.delete('refresh_token');
    url.searchParams.delete('state');
    url.searchParams.delete('error');
    url.searchParams.delete('error_description');
    window.history.replaceState({}, '', url);
    
    console.log('✅ Callback processed successfully, token stored');
    return accessToken;
  }

  throw new Error('No access token found in callback URL');
}



// ✅ Reset callback state
export function resetCallbackState() {
  callbackProcessed = false;
  console.log('🔄 Callback state reset');
}

// ✅ Add refresh lock to prevent concurrent refresh calls
let refreshInProgress = false;
let refreshPromise = null;

export async function refreshToken() {
  const { clientKey, authBaseUrl } = getConfig();
  
  // ✅ Prevent concurrent refresh calls
  if (refreshInProgress && refreshPromise) {
    console.log('🔄 Token refresh already in progress, waiting...');
    return refreshPromise;
  }
  
  refreshInProgress = true;
  refreshPromise = (async () => {
    try {
      console.log('🔄 Refreshing token:', { 
        clientKey, 
        mode: isRouterMode() ? 'ROUTER' : 'CLIENT' 
      });
      
      const response = await fetch(`${authBaseUrl}/refresh/${clientKey}`, {
        method: 'POST',
        credentials: 'include', // ✅ Include httpOnly cookies
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Token refresh failed:', response.status, errorText);
        throw new Error(`Refresh failed: ${response.status}`);
      }

      const { access_token } = await response.json();
      
      if (!access_token) {
        throw new Error('No access token in refresh response');
      }
      
      // ✅ This will trigger token listeners
      setToken(access_token);
      console.log('✅ Token refresh successful, listeners notified');
      return access_token;
    } catch (err) {
      console.error('❌ Token refresh error:', err);
      // ✅ This will trigger token listeners
      clearToken();
      clearRefreshToken();
      throw err;
    } finally {
      refreshInProgress = false;
      refreshPromise = null;
    }
  })();
  
  return refreshPromise;
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
