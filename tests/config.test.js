import test from 'node:test';
import assert from 'node:assert/strict';
import { setConfig } from '../config.js';
import { clearRefreshToken, getRefreshToken, setRefreshToken } from '../token.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.window = {
  location: { origin: 'https://app.example', protocol: 'https:' },
};

test('setConfig can disable refresh-token persistence after it was enabled', () => {
  setConfig({
    clientKey: 'test-client',
    authBaseUrl: 'https://auth.example/auth',
    persistRefreshToken: true,
  });
  setRefreshToken('stored-while-enabled');
  assert.equal(getRefreshToken(), 'stored-while-enabled');

  setConfig({
    clientKey: 'test-client',
    authBaseUrl: 'https://auth.example/auth',
    persistRefreshToken: false,
  });
  assert.equal(getRefreshToken(), null);

  setRefreshToken('must-not-enter-local-storage');
  assert.equal(localStorage.getItem('auth_refresh_token'), 'stored-while-enabled');

  clearRefreshToken();
});
