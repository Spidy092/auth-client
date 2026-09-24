import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTH_ERROR_CATEGORIES,
  authErrorToMessage,
  getAuthErrorMetadata,
} from '../core.js';

test('classifies rate-limit responses from status or server code', () => {
  assert.deepEqual(
    getAuthErrorMetadata({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 7 }),
    {
      category: AUTH_ERROR_CATEGORIES.RATE_LIMITED,
      status: 429,
      code: 'RATE_LIMITED',
      retryAfterSeconds: 7,
    },
  );
  assert.equal(
    authErrorToMessage({ response: { data: { error: 'BRUTE_FORCE_DETECTED' } } }),
    'Too many sign-in attempts were detected. Please wait a moment and try again.',
  );
});

test('parses Retry-After HTTP dates into remaining seconds', () => {
  const retryAt = new Date(Date.now() + 60_000).toUTCString();
  const metadata = getAuthErrorMetadata({
    status: 429,
    response: { headers: { get: (name) => name === 'retry-after' ? retryAt : null } },
  });

  assert.ok(metadata.retryAfterSeconds >= 59);
  assert.ok(metadata.retryAfterSeconds <= 60);
});

test('classifies expired provider attempts without exposing provider-specific parsing to clients', () => {
  const metadata = getAuthErrorMetadata({ message: 'Your login attempt timed out.' });
  assert.equal(metadata.category, AUTH_ERROR_CATEGORIES.SESSION_EXPIRED);
  assert.equal(
    authErrorToMessage({ message: 'Your login attempt timed out.' }),
    'This sign-in attempt expired before it finished. Start sign-in again to continue.',
  );
});

test('keeps temporary transport failures retryable and preserves caller fallback', () => {
  assert.equal(
    getAuthErrorMetadata({ status: 503 }).category,
    AUTH_ERROR_CATEGORIES.TRANSIENT,
  );
  assert.equal(
    getAuthErrorMetadata(new TypeError('Failed to fetch')).category,
    AUTH_ERROR_CATEGORIES.TRANSIENT,
  );
  assert.equal(
    getAuthErrorMetadata(new Error('unexpected auth failure')).category,
    AUTH_ERROR_CATEGORIES.UNKNOWN,
  );
  assert.equal(
    authErrorToMessage(new Error('unexpected auth failure'), 'Try again from this app.'),
    'Try again from this app.',
  );
});
