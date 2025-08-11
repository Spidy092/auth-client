import { setToken, clearToken, getToken } from './token';
import { getConfig } from './config';

export function login(clientKeyArg, redirectUriArg) {  // Removed stateArg
  const {
    clientKey: defaultClientKey, 
    authBaseUrl, 
    redirectUri: defaultRedirectUri, 
    accountUiUrl 
  } = getConfig();

  const clientKey = clientKeyArg || defaultClientKey;
  const redirectUri = redirectUriArg || defaultRedirectUri;
  // Removed state generation

  console.log('Initiating login with parameters:', {
    clientKey,
    redirectUri
    // Removed state from logging
  });
  
  if (!clientKey || !redirectUri) {
    throw new Error('Missing clientKey or redirectUri');
  }

  // Store only app info, no state
  sessionStorage.setItem('originalApp', clientKey);
  sessionStorage.setItem('returnUrl', redirectUri);

  // --- ENTERPRISE LOGIC ---
  // If we are already in Account-UI, go straight to the backend
  if (window.location.origin === accountUiUrl && clientKey === 'account-ui') {
    // Direct SSO kick-off for Account-UI (no state parameter)
    const backendLoginUrl = `${authBaseUrl}/login/${clientKey}?redirect_uri=${encodeURIComponent(redirectUri)}`;
    console.log('Redirecting directly to auth backend:', backendLoginUrl);
    window.location.href = backendLoginUrl;
    return;
  }

  // Otherwise, centralized login flow (for other apps, no state)
  const accountLoginUrl = `${accountUiUrl}/login?` + new URLSearchParams({
    client: clientKey,
    redirect_uri: redirectUri
    // Removed state
  });
  console.log('Redirecting to centralized Account UI:', accountLoginUrl);
  window.location.href = accountLoginUrl;
}

export function logout() {
  const { clientKey, authBaseUrl, accountUiUrl } = getConfig();
  const token = getToken();
  
  console.log('Initiating logout for client:', clientKey);

  // Clear local storage immediately
  clearToken();
  sessionStorage.clear();
  // Don't clear localStorage completely - might break other stuff
  // localStorage.clear(); // Remove this line

  // Call backend logout if we have a token
  if (token) {
    fetch(`${authBaseUrl}/logout/${clientKey}`, {
      method: 'POST',
      credentials: 'include', // ✅ CRITICAL: This sends cookies
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    .then(response => response.json())
    .then(data => {
      console.log('Backend logout response:', data);
      
      // If we get a Keycloak logout URL, redirect there
      if (data.keycloakLogoutUrl) {
        window.location.href = data.keycloakLogoutUrl;
        return;
      }
      
      // Otherwise redirect to login
      window.location.href = `${accountUiUrl}/login`;
    })
    .catch(error => {
      console.error('Logout error:', error);
      // Always redirect to login even on error
      window.location.href = `${accountUiUrl}/login`;
    });
  } else {
    // No token, just redirect to login
    window.location.href = `${accountUiUrl}/login`;
  }
}


export function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const accessToken = params.get('access_token');
  const error = params.get('error');
  // Removed state handling completely

  console.log('Handling authentication callback:', {
    accessToken,
    error
    // Removed state from logging
  });
  
  // Removed all state validation

  sessionStorage.removeItem('originalApp');
  sessionStorage.removeItem('returnUrl');

  if (error) {
    throw new Error(`Authentication failed: ${error}`);
  }

  if (accessToken) {
    setToken(accessToken);
    return accessToken;
  }

  throw new Error('No access token found in callback URL');
}

export async function refreshToken() {
  const { clientKey, authBaseUrl } = getConfig();
  
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
