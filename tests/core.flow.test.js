import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const storage = {
  local: new MemoryStorage(),
  session: new MemoryStorage(),
};

const location = {
  href: 'https://app.example/',
  origin: 'https://app.example',
  protocol: 'https:',
  search: '',
  replaced: null,
  replace(value) {
    this.replaced = String(value);
    this.href = this.replaced;
  },
  toString() { return `${this.origin}${this.search}`; },
};

// Captures every message posted to any BroadcastChannel during a test.
const broadcastMessages = [];
const broadcastChannels = [];
const storageListeners = new Set();

globalThis.localStorage = storage.local;
globalThis.sessionStorage = storage.session;
globalThis.document = { cookie: '' };
globalThis.window = {
  location,
  history: {
    replaceState(_state, _title, nextUrl) {
      if (!nextUrl) return;
      const parsed = new URL(nextUrl, location.origin);
      location.href = parsed.toString();
      location.origin = parsed.origin;
      location.protocol = parsed.protocol;
      location.search = parsed.search;
    },
  },
  addEventListener(type, listener) {
    if (type === 'storage') storageListeners.add(listener);
  },
  removeEventListener(type, listener) {
    if (type === 'storage') storageListeners.delete(listener);
  },
  dispatchEvent(event) {
    if (event?.type === 'storage') storageListeners.forEach((listener) => listener(event));
  },
};

const { setConfig } = await import('../config.js');
const token = await import('../token.js');
const core = await import('../core.js');

function resetBrowser(url = 'https://app.example/') {
  storage.local.clear();
  storage.session.clear();
  document.cookie = '';
  location.href = url;
  const parsed = new URL(url);
  location.origin = parsed.origin;
  location.protocol = parsed.protocol;
  location.search = parsed.search;
  location.replaced = null;
  core.resetCallbackState();
  // Reset the SDK's in-memory token state between tests. A real browser reload
  // starts with a fresh module (accessToken=null); the test harness reuses the
  // module, so clear it explicitly to simulate that.
  token.clearToken();
  globalThis.fetch = undefined;
  Object.defineProperty(globalThis, 'navigator', {
    value: undefined,
    writable: true,
    configurable: true,
  });
  broadcastMessages.length = 0;
  broadcastChannels.length = 0;
  globalThis.BroadcastChannel = class {
    constructor(name) {
      this.name = name;
      this.onmessage = null;
      broadcastChannels.push(this);
    }
    postMessage(message) { broadcastMessages.push({ name: this.name, message }); }
    close() {}
  };
}

function configure(overrides = {}) {
  setConfig({
    clientKey: 'pms',
    authBaseUrl: 'https://auth.example/auth',
    accountUiUrl: 'https://account.example',
    redirectUri: 'https://app.example/callback',
    isRouter: false,
    persistRefreshToken: false,
    legacyTokenTransport: true,
    ...overrides,
  });
}

function response(body, { status = 200, ok = status >= 200 && status < 300 } = {}) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Unauthorized',
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

test('client-mode login stores intent and redirects through centralized login', () => {
  resetBrowser();
  configure();

  core.login();

  assert.equal(
    location.href,
    'https://account.example/login?client=pms&redirect_uri=https%3A%2F%2Fapp.example%2Fcallback'
  );
  assert.equal(sessionStorage.getItem('originalApp'), 'pms');
  assert.equal(sessionStorage.getItem('returnUrl'), 'https://app.example/callback');
});

test('router-mode login redirects directly to the auth service with correlation data', () => {
  resetBrowser();
  configure({ clientKey: 'account-ui', isRouter: true });

  core.login();

  const redirect = new URL(location.href);
  assert.equal(redirect.origin, 'https://auth.example');
  assert.equal(redirect.pathname, '/auth/login/account-ui');
  assert.equal(redirect.searchParams.get('redirect_uri'), 'https://app.example/callback');
  assert.match(redirect.searchParams.get('correlation_id'), /^[A-Za-z0-9-]+$/);
});

test('login broadcasts a metadata-only LOGIN_STARTED event', () => {
  resetBrowser();
  configure({ legacyTokenTransport: false });

  core.login();

  const loginStarted = broadcastMessages.find((m) => m.message?.type === 'LOGIN_STARTED');
  assert.ok(loginStarted, 'expected a LOGIN_STARTED broadcast');
  assert.equal(loginStarted.name, 'auth_platform_sso_channel');
  assert.equal(loginStarted.message.clientKey, 'pms');
  assert.equal('accessToken' in loginStarted.message, false);
  assert.equal('refreshToken' in loginStarted.message, false);
  assert.equal('idToken' in loginStarted.message, false);
  assert.equal(storage.local.getItem('authToken'), null);
});

test('explicit account switch requests a fresh Keycloak credential prompt', () => {
  resetBrowser();
  configure();

  core.login('pms', 'https://app.example/callback', { switchAccount: true });

  const redirect = new URL(location.href);
  assert.equal(redirect.searchParams.get('switch_account'), 'true');
});

test('callback stores only the access token, removes URL credentials, and ignores refresh_token', () => {
  resetBrowser('https://app.example/callback?access_token=access-1&refresh_token=secret&state=state-1');
  configure({ persistRefreshToken: true });

  const accessToken = core.handleCallback();

  assert.equal(accessToken, 'access-1');
  assert.equal(token.getToken(), 'access-1');
  assert.equal(token.getRefreshToken(), null);
  assert.equal(location.search, '');
  assert.equal(sessionStorage.getItem('originalApp'), null);
});

test('callback stores id_token in tab-scoped storage and removes it from the URL', () => {
  resetBrowser('https://app.example/callback?access_token=access-1&id_token=id-token-1&state=state-1');
  configure();

  core.handleCallback();

  assert.equal(token.getIdToken(), 'id-token-1');
  assert.equal(sessionStorage.getItem('auth_id_token'), 'id-token-1');
  assert.equal(location.search, '');
});

test('callback broadcasts a metadata-only LOGIN_COMPLETED event', () => {
  resetBrowser('https://app.example/callback?access_token=access-1&state=state-1');
  configure({ legacyTokenTransport: false });

  core.handleCallback();

  const loginCompleted = broadcastMessages.find((m) => m.message?.type === 'LOGIN_COMPLETED');
  assert.ok(loginCompleted, 'expected a LOGIN_COMPLETED broadcast');
  assert.equal(loginCompleted.name, 'auth_platform_sso_channel');
  assert.equal(loginCompleted.message.clientKey, 'pms');
  assert.equal('accessToken' in loginCompleted.message, false);
  assert.equal('refreshToken' in loginCompleted.message, false);
  assert.equal('idToken' in loginCompleted.message, false);
  assert.equal(storage.local.getItem('authToken'), null);
});

test('subscribers receive each cross-tab event once across BroadcastChannel and storage fallback', () => {
  resetBrowser();
  configure();
  const received = [];
  const unsubscribe = core.subscribeToAuthEvents((event) => received.push(event));

  core.publishAuthEvent('LOGIN_COMPLETED', { clientKey: 'pms' });
  const event = broadcastMessages.at(-1).message;
  broadcastChannels.at(-1).onmessage({ data: event });
  window.dispatchEvent({
    type: 'storage',
    key: 'auth_platform_sso_event',
    newValue: JSON.stringify(event),
  });

  assert.equal(received.length, 1);
  assert.deepEqual(received[0], event);
  unsubscribe();
});

test('subscribers receive storage events when BroadcastChannel is unavailable', () => {
  resetBrowser();
  configure();
  globalThis.BroadcastChannel = undefined;
  const received = [];
  const unsubscribe = core.subscribeToAuthEvents((event) => received.push(event));
  const event = {
    type: 'LOGIN_COMPLETED',
    clientKey: 'pms',
    eventId: 'storage-event-1',
    issuedAt: Date.now(),
  };

  window.dispatchEvent({
    type: 'storage',
    key: 'auth_platform_sso_event',
    newValue: JSON.stringify(event),
  });

  assert.deepEqual(received, [event]);
  unsubscribe();
});

test('callback rejects provider errors with a stable error code', () => {
  resetBrowser('https://app.example/callback?error=access_denied&error_description=User%20cancelled');
  configure();

  assert.throws(
    () => core.handleCallback(),
    (error) => error.code === 'access_denied' && error.message.includes('User cancelled')
  );
});

test('refresh rotates the refresh token and sends the stored token in the request body', async () => {
  resetBrowser('http://app.example/');
  configure({ persistRefreshToken: true });
  token.setRefreshToken('refresh-old');

  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return response({ access_token: 'access-new', refresh_token: 'refresh-new' });
  };

  const accessToken = await core.refreshToken();

  assert.equal(accessToken, 'access-new');
  assert.equal(token.getToken(), 'access-new');
  assert.equal(token.getRefreshToken(), 'refresh-new');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://auth.example/auth/refresh/pms');
  assert.deepEqual(JSON.parse(calls[0].options.body), { refreshToken: 'refresh-old' });
  assert.equal(calls[0].options.credentials, 'include');
});

test('concurrent refresh calls share one in-flight request', async () => {
  resetBrowser('http://app.example/');
  configure({ persistRefreshToken: true });
  token.setRefreshToken('refresh-concurrent');

  let resolveResponse;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    await new Promise((resolve) => { resolveResponse = resolve; });
    return response({ access_token: 'access-concurrent' });
  };

  const first = core.refreshToken();
  const second = core.refreshToken();
  resolveResponse();

  assert.deepEqual(await Promise.all([first, second]), ['access-concurrent', 'access-concurrent']);
  assert.equal(requestCount, 1);
});

test('cross-tab refresh lock reuses a token rotated by another tab', async () => {
  resetBrowser('https://app.example/');
  configure();
  token.setToken('access-before');

  let lockCalls = 0;
  let networkCalls = 0;
  Object.defineProperty(globalThis, 'navigator', {
    value: {
    locks: {
      request: async (name, callback) => {
        lockCalls += 1;
        assert.equal(name, 'auth-refresh-pms');
        storage.local.setItem('authToken', 'access-from-other-tab');
        return callback();
      },
    },
    },
    writable: true,
    configurable: true,
  });
  globalThis.fetch = async () => {
    networkCalls += 1;
    return response({ access_token: 'unexpected-network-token' });
  };

  const refreshed = await core.refreshToken();

  assert.equal(refreshed, 'access-from-other-tab');
  assert.equal(token.getToken(), 'access-from-other-tab');
  assert.equal(lockCalls, 1);
  assert.equal(networkCalls, 0);
});

test('cross-tab lock never reuses stale storage when no current session exists', async () => {
  resetBrowser('https://app.example/');
  configure();
  token.clearToken();
  storage.local.setItem('authToken', 'stale-user-token');

  Object.defineProperty(globalThis, 'navigator', {
    value: {
      locks: {
        request: async (_name, callback) => callback(),
      },
    },
    writable: true,
    configurable: true,
  });
  globalThis.fetch = async () => response({ access_token: 'fresh-user-token' });

  const refreshed = await core.refreshToken();

  assert.equal(refreshed, 'fresh-user-token');
  assert.equal(token.getToken(), 'fresh-user-token');
});

test('refresh clears credentials only for an authentication rejection', async () => {
  resetBrowser('http://app.example/');
  configure({ persistRefreshToken: true });
  token.setToken('access-expired');
  token.setRefreshToken('refresh-expired');
  globalThis.fetch = async () => response({ error: 'invalid_grant' }, { status: 401, ok: false });

  await assert.rejects(() => core.refreshToken(), /Refresh failed: 401/);

  assert.equal(token.getToken(), null);
  assert.equal(token.getRefreshToken(), null);
});

test('SSO logout revokes local state, sends scope, and follows Keycloak logout', async () => {
  resetBrowser();
  configure();
  token.setToken('access-logout');

  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return response({ keycloakLogoutUrl: 'https://keycloak.example/logout?sid=s-1' });
  };

  await core.logout();

  assert.equal(request.url, 'https://auth.example/auth/logout/pms');
  assert.equal(request.options.credentials, 'include');
  assert.equal(request.options.headers.Authorization, 'Bearer access-logout');
  assert.deepEqual(JSON.parse(request.options.body), { idToken: null, refreshToken: null, scope: 'sso' });
  assert.equal(token.getToken(), null);
  assert.equal(location.replaced, 'https://keycloak.example/logout?sid=s-1');
});

test('SSO logout uses the auth-service front-channel fallback when the POST fails', async () => {
  resetBrowser();
  configure();
  token.setToken('access-sso-logout');
  globalThis.fetch = async () => { throw new Error('network down'); };

  await core.logout();

  assert.equal(token.getToken(), null);
  const fallback = new URL(location.replaced);
  assert.equal(fallback.origin, 'https://auth.example');
  assert.equal(fallback.pathname, '/auth/logout/pms');
  assert.equal(fallback.search, '');
});

test('client-only logout uses client scope and keeps its fallback local when backend logout fails', async () => {
  resetBrowser();
  configure();
  token.setToken('access-client-logout');
  globalThis.fetch = async () => { throw new Error('network down'); };

  await core.logout({ scope: 'client' });

  assert.equal(token.getToken(), null);
  const fallback = new URL(location.replaced);
  assert.equal(fallback.origin, 'https://account.example');
  assert.equal(fallback.pathname, '/login');
  assert.equal(fallback.searchParams.get('logged_out'), 'true');
  assert.equal(fallback.searchParams.get('scope'), 'client');
});

test('logout broadcasts a LOGOUT message to sibling tabs on the configured channel', async () => {
  resetBrowser();
  configure({ logoutChannelName: 'auth_platform_sso_channel' });
  token.setToken('access-broadcast');
  globalThis.fetch = async () => response({ keycloakLogoutUrl: 'https://keycloak.example/logout?sid=s-1' });

  await core.logout();

  const logoutMsg = broadcastMessages.find((m) => m.message?.type === 'LOGOUT');
  assert.ok(logoutMsg, 'expected a LOGOUT broadcast');
  assert.equal(logoutMsg.name, 'auth_platform_sso_channel');
  assert.equal(logoutMsg.message.reason, 'user_logout');
  assert.equal(logoutMsg.message.clientKey, 'pms');
});

test('logout still broadcasts even when the backend POST fails', async () => {
  resetBrowser();
  configure({ logoutChannelName: 'auth_platform_sso_channel' });
  token.setToken('access-broadcast-2');
  globalThis.fetch = async () => { throw new Error('network down'); };

  await core.logout();

  const logoutMsg = broadcastMessages.find((m) => m.message?.type === 'LOGOUT');
  assert.ok(logoutMsg, 'expected a LOGOUT broadcast even on POST failure');
  assert.equal(logoutMsg.name, 'auth_platform_sso_channel');
});

test('logout does not throw when BroadcastChannel is unavailable', async () => {
  resetBrowser();
  configure();
  globalThis.BroadcastChannel = undefined;
  token.setToken('access-no-bc');
  globalThis.fetch = async () => response({ keycloakLogoutUrl: 'https://keycloak.example/logout?sid=s-1' });

  await core.logout();

  assert.equal(location.replaced, 'https://keycloak.example/logout?sid=s-1');
});

test('legacyTokenTransport:true (default) persists the access token to localStorage', () => {
  resetBrowser();
  configure(); // default legacyTokenTransport true
  token.setToken('access-legacy');

  assert.equal(storage.local.getItem('authToken'), 'access-legacy');
  assert.equal(token.getToken(), 'access-legacy');
});

test('legacyTokenTransport:false keeps the access token in memory only (nothing in localStorage)', () => {
  resetBrowser();
  configure({ legacyTokenTransport: false });
  token.setToken('access-memory');

  // In memory the token is available to this tab...
  assert.equal(token.getToken(), 'access-memory');
  // ...but it is never written to localStorage.
  assert.equal(storage.local.getItem('authToken'), null);
});

test('memory-only: getToken does not read a stale legacy localStorage value', () => {
  resetBrowser();
  configure({ legacyTokenTransport: false });
  // Simulate a stale value left by an old legacy build.
  storage.local.setItem('authToken', 'stale-legacy-token');

  // In-memory is empty and memory-only mode must not read localStorage.
  assert.equal(token.getToken(), null);
});

test('restoreSession returns true without a network call when a valid token is already in memory', async () => {
  resetBrowser();
  configure({ legacyTokenTransport: false });
  // A non-expired JWT (exp far in the future).
  const future = Math.floor(Date.now() / 1000) + 3600;
  const payload = Buffer.from(JSON.stringify({ exp: future })).toString('base64url');
  token.setToken(`h.${payload}.s`);

  let fetchCalled = false;
  globalThis.fetch = async () => { fetchCalled = true; return response({}); };

  const ok = await core.restoreSession();

  assert.equal(ok, true);
  assert.equal(fetchCalled, false);
});

test('restoreSession silently refreshes via the cookie when no token is in memory', async () => {
  resetBrowser();
  configure({ legacyTokenTransport: false });

  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return response({ access_token: 'access-from-cookie' });
  };

  const ok = await core.restoreSession();

  assert.equal(ok, true);
  assert.equal(token.getToken(), 'access-from-cookie');
  assert.equal(request.url, 'https://auth.example/auth/refresh/pms');
  assert.equal(request.options.credentials, 'include');
});

test('restoreSession resolves false (no throw) when the cookie refresh is rejected', async () => {
  resetBrowser();
  configure({ legacyTokenTransport: false });
  globalThis.fetch = async () => response({ error: 'invalid_grant' }, { status: 401, ok: false });

  const ok = await core.restoreSession();

  assert.equal(ok, false);
  assert.equal(token.getToken(), null);
});

test('restoreSession treats a coded missing session as a definitive logout', async () => {
  resetBrowser();
  configure({ legacyTokenTransport: false });
  globalThis.fetch = async () => response({ error: 'MISSING_TOKEN' }, { status: 400, ok: false });

  const ok = await core.restoreSession({ throwOnTransient: true });

  assert.equal(ok, false);
  assert.equal(token.getToken(), null);
});

test('restoreSession treats a coded refresh rejection as a definitive logout', async () => {
  resetBrowser();
  configure({ legacyTokenTransport: false });
  globalThis.fetch = async () => response({ code: 'TOKEN_REFRESH_FAILED' }, { status: 400, ok: false });

  const ok = await core.restoreSession({ throwOnTransient: true });

  assert.equal(ok, false);
  assert.equal(token.getToken(), null);
});

test('restoreSession can surface temporary refresh failures without exposing policy parsing to clients', async () => {
  resetBrowser();
  configure({ legacyTokenTransport: false });
  globalThis.fetch = async () => response({ error: 'temporarily unavailable' }, { status: 503, ok: false });

  await assert.rejects(
    () => core.restoreSession({ throwOnTransient: true }),
    (error) => error.status === 503
  );
  assert.equal(token.getToken(), null);
});

test('restoreSession treats a refresh-lock timeout as retryable even with TOKEN_REFRESH_FAILED code', async () => {
  resetBrowser();
  configure({ legacyTokenTransport: false });
  globalThis.fetch = async () => response({ error: 'TOKEN_REFRESH_FAILED' }, { status: 408, ok: false });

  await assert.rejects(
    () => core.restoreSession({ throwOnTransient: true }),
    (error) => error.status === 408 && error.code === 'TOKEN_REFRESH_FAILED'
  );
  assert.equal(token.getToken(), null);
});
