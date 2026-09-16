import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const local = new MemoryStorage();
const session = new MemoryStorage();
const location = {
  href: 'https://app.example/',
  origin: 'https://app.example',
  protocol: 'https:',
  search: '',
  replace(value) { this.href = String(value); },
};

globalThis.localStorage = local;
globalThis.sessionStorage = session;
globalThis.document = { cookie: '' };
globalThis.window = {
  location,
  addEventListener() {},
  removeEventListener() {},
  history: { replaceState() {} },
};
globalThis.BroadcastChannel = undefined;

const { setConfig } = await import('../config.js');
const core = await import('../core.js');

function reset() {
  local.clear();
  session.clear();
  core.clearLoginLease();
  core.resetCallbackState();
  Object.defineProperty(globalThis, 'navigator', {
    value: undefined,
    writable: true,
    configurable: true,
  });
  setConfig({
    clientKey: 'pms',
    authBaseUrl: 'https://auth.example/auth',
    accountUiUrl: 'https://account.example',
    redirectUri: 'https://app.example/callback',
    isRouter: false,
    legacyTokenTransport: false,
  });
}

test('Web Locks serializes login lease creation and only one tab wins', async () => {
  reset();
  let lockHeld = false;
  const lockNames = [];
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      locks: {
        request(name, _options, callback) {
          lockNames.push(name);
          if (lockHeld) return Promise.resolve(callback(null));
          lockHeld = true;
          return Promise.resolve(callback({ name })).finally(() => { lockHeld = false; });
        },
      },
    },
    writable: true,
    configurable: true,
  });

  const results = await Promise.all([
    core.acquireLoginLeaseAsync('pms'),
    core.acquireLoginLeaseAsync('pms'),
  ]);

  assert.deepEqual([...results].sort(), [false, true]);
  assert.deepEqual(lockNames, ['auth-platform-login-lease:pms', 'auth-platform-login-lease:pms']);
  assert.equal(core.isLoginLeaseActive(), true);
});

test('a held Web Lock is a duplicate, not a five-minute user wait', async () => {
  reset();
  Object.defineProperty(globalThis, 'navigator', {
    value: { locks: { request: async (_name, _options, callback) => callback(null) } },
    writable: true,
    configurable: true,
  });

  assert.equal(await core.acquireLoginLeaseAsync('pms'), false);
  assert.equal(core.isLoginLeaseActive(), false);
});

test('storage restrictions fail open to the existing login path', async () => {
  reset();
  globalThis.localStorage = {
    getItem() { throw new Error('storage blocked'); },
    setItem() { throw new Error('storage blocked'); },
    removeItem() { throw new Error('storage blocked'); },
  };

  assert.equal(await core.acquireLoginLeaseAsync('pms'), true);
  globalThis.localStorage = local;
});

test('Web Locks API errors fall back to storage lease acquisition', async () => {
  reset();
  Object.defineProperty(globalThis, 'navigator', {
    value: { locks: { request: async () => { throw new Error('unsupported'); } } },
    writable: true,
    configurable: true,
  });

  assert.equal(await core.acquireLoginLeaseAsync('pms'), true);
  assert.equal(core.isLoginLeaseActive(), true);
});
