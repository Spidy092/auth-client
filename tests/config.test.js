import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRuntimePolicy, loadRuntimePolicy, setConfig } from '../config.js';
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

test('runtime policy is bounded and loaded from the auth-service client config', async () => {
  setConfig({ clientKey: 'test-client', authBaseUrl: 'https://auth.example/auth' });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(url, 'https://auth.example/auth/clients/test-client/config');
    return new Response(JSON.stringify({ authentication_policy: {
      tokenRefreshBuffer: 120,
      sessionValidationInterval: 120000,
      enableSessionValidation: false,
      enableProactiveRefresh: true,
      validateOnVisibility: false,
      // Must be ignored because it is outside the server contract.
      unknownFlag: true,
    }}), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await loadRuntimePolicy();
    assert.equal(result.tokenRefreshBuffer, 120);
    assert.equal(result.sessionValidationInterval, 120000);
    assert.equal(result.enableSessionValidation, false);
    assert.equal(result.unknownFlag, undefined);
    assert.equal(applyRuntimePolicy({ tokenRefreshBuffer: 1 }).tokenRefreshBuffer, 60);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
