import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  clear() { this.values.clear(); }
}

const localStorage = new MemoryStorage();
const sessionStorage = new MemoryStorage();
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
  close() {}
  postMessage() {}
};

const { setConfig } = await import('../config.js');
const core = await import('../core.js');

test('storage polling ignores the pre-existing record but delivers a later record change', async () => {
  localStorage.clear();
  sessionStorage.clear();
  setConfig({
    clientKey: 'pms',
    authBaseUrl: 'https://auth.example/auth',
    accountUiUrl: 'https://account.example',
    redirectUri: 'https://app.example/callback',
    isRouter: false,
    logoutChannelName: 'auth_platform_sso_channel',
    legacyTokenTransport: false,
  });

  localStorage.setItem('auth_platform_sso_event', JSON.stringify({
    type: 'LOGIN_COMPLETED',
    clientKey: 'pms',
    eventId: 'old-login-completed-1',
    issuedAt: Date.now() - 60_000,
  }));

  const received = [];
  const unsubscribe = core.subscribeToAuthEvents((event) => received.push(event));
  try {
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.deepEqual(received, []);

    const newEvent = {
      type: 'LOGIN_COMPLETED',
      clientKey: 'pms',
      eventId: 'new-login-completed-1',
      issuedAt: Date.now(),
    };
    localStorage.setItem('auth_platform_sso_event', JSON.stringify(newEvent));
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.deepEqual(received, [newEvent]);
  } finally {
    unsubscribe();
  }
});
