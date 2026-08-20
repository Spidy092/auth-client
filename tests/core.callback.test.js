import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
globalThis.document = { cookie: '' };
globalThis.window = {
  location: new URL('https://app.example/callback?access_token=access-1&refresh_token=refresh-secret'),
  history: { replaceState() {} },
};

const { setConfig } = await import('../config.js');
const { getRefreshToken } = await import('../token.js');
const { handleCallback, resetCallbackState } = await import('../core.js');

test('callback never stores a refresh token supplied in the URL', () => {
  setConfig({
    clientKey: 'test-client',
    authBaseUrl: 'https://auth.example/auth',
    persistRefreshToken: true,
  });
  resetCallbackState();

  const token = handleCallback();

  assert.equal(token, 'access-1');
  assert.equal(getRefreshToken(), null);
  assert.equal(localStorage.getItem('auth_refresh_token'), null);
});
