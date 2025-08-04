
import { setToken, clearToken, getToken } from './token';
import { getConfig } from './config';

export function login(clientKeyArg, redirectUriArg, stateArg) {
  const { 
    clientKey: defaultClientKey, 
    authBaseUrl, 
    redirectUri: defaultRedirectUri,
    accountUiUrl 
  } = getConfig();

  const clientKey = clientKeyArg || defaultClientKey;
  const redirectUri = redirectUriArg || defaultRedirectUri;
  const state = stateArg || crypto.randomUUID();

  if (!clientKey || !redirectUri) {
    throw new Error('Missing clientKey or redirectUri');
  }

  // Store original app info for return after auth
  sessionStorage.setItem('authState', state);
  sessionStorage.setItem('originalApp', clientKey);
  sessionStorage.setItem('returnUrl', redirectUri);

  // Redirect to centralized Account UI instead of direct auth service
  const accountLoginUrl = `${accountUiUrl}/login?` + new URLSearchParams({
    client: clientKey,
    redirect_uri: redirectUri,
    state: state
  });

  console.log('Redirecting to Account UI:', accountLoginUrl);
  window.location.href = accountLoginUrl;
}

export function logout() {
  const { clientKey, authBaseUrl, accountUiUrl } = getConfig();
  const token = getToken();
  
  if (!token) {
    window.location.href = `${accountUiUrl}/login`;
    return;
  }

  clearToken();
  
  // Call logout endpoint
  fetch(`${authBaseUrl}/logout/${clientKey}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }).catch(console.error);

  // Redirect to Account UI logout page
  window.location.href = `${accountUiUrl}/logout?client=${clientKey}`;
}

export function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const accessToken = params.get('access_token');
  const error = params.get('error');
  const state = params.get('state');
  const storedState = sessionStorage.getItem('authState');

  // Validate state
  if (state && storedState && state !== storedState) {
    throw new Error('Invalid state. Possible CSRF attack.');
  }

  sessionStorage.removeItem('authState');
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
