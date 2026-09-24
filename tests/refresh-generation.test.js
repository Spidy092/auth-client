import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const localStorage = new MemoryStorage();
const sessionStorage = new MemoryStorage();
const broadcastChannels = [];
const storageListeners = new Set();
const location = {
  href: 'https://app.example/',
  origin: 'https://app.example',
  protocol: 'https:',
  search: '',
  toString() { return `${this.origin}${this.search}`; },
};

globalThis.localStorage = localStorage;
globalThis.sessionStorage = sessionStorage;
globalThis.document = { cookie: '' };
globalThis.window = {
  location,
  addEventListener(type, listener) {
    if (type === 'storage') storageListeners.add(listener);
  },
  removeEventListener(type, listener) {
    if (type === 'storage') storageListeners.delete(listener);
  },
};
globalThis.BroadcastChannel = class {
  constructor(name) {
    this.name = name;
    this.onmessage = null;
    broadcastChannels.push(this);
  }
  close() {}
  postMessage() {}
};
Object.defineProperty(globalThis, 'navigator', {
  value: undefined,
  writable: true,
  configurable: true,
});

const { setConfig } = await import('../config.js');
const token = await import('../token.js');
const core = await import('../core.js');

test('stale definitive refresh failure cannot clear a replacement session', async () => {
  localStorage.clear();
  sessionStorage.clear();
  token.clearToken();
  broadcastChannels.length = 0;
  setConfig({
    clientKey: 'pms',
    authBaseUrl: 'https://auth.example/auth',
    accountUiUrl: 'https://account.example',
    redirectUri: 'https://app.example/callback',
    isRouter: false,
    logoutChannelName: 'auth_platform_sso_channel',
    legacyTokenTransport: false,
    persistRefreshToken: false,
  });

  const unsubscribe = core.subscribeToAuthEvents(() => {});
  let releaseRefresh;
  globalThis.fetch = async (url) => {
    if (!url.includes('/refresh/')) return { ok: true, json: async () => ({}) };
    return new Promise((resolve) => {
      releaseRefresh = () => resolve({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: 'refresh_token_reuse_detected' }),
      });
    });
  };

  try {
    const staleRefresh = core.refreshToken();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(typeof releaseRefresh, 'function');

    const channel = broadcastChannels[0];
    assert.ok(channel, 'expected the refresh path to create an auth event channel');
    channel.onmessage({
      data: { type: 'LOGIN_COMPLETED', clientKey: 'pms', eventId: 'event-replacement-session' },
    });
    token.setToken('access-after-login');

    releaseRefresh();
    assert.equal(await staleRefresh, null);
    assert.equal(token.getToken(), 'access-after-login');
  } finally {
    unsubscribe();
  }
});
