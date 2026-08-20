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
  globalThis.fetch = undefined;
}

function configure(overrides = {}) {
  setConfig({
    clientKey: 'pms',
    authBaseUrl: 'https://auth.example/auth',
    accountUiUrl: 'https://account.example',
    redirectUri: 'https://app.example/callback',
    isRouter: false,
    persistRefreshToken: false,
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
  assert.deepEqual(JSON.parse(request.options.body), { refreshToken: null, scope: 'sso' });
  assert.equal(token.getToken(), null);
  assert.equal(location.replaced, 'https://keycloak.example/logout?sid=s-1');
});

test('client-only logout uses client scope and falls back when backend logout fails', async () => {
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
