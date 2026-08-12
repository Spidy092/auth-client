import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acquireLoginLock,
  clearLoginLock,
  diagnosticHeaders,
  getDiagnosticContext,
  resetDiagnosticContext,
} from '../diagnostics.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

globalThis.sessionStorage = new MemoryStorage();

test('diagnostic context is stable until explicitly reset', () => {
  const first = getDiagnosticContext();
  const second = getDiagnosticContext();
  assert.equal(second.correlationId, first.correlationId);
  assert.notEqual(resetDiagnosticContext().correlationId, first.correlationId);
});

test('correlation headers contain no credentials', () => {
  const headers = diagnosticHeaders();
  assert.equal(headers['X-Correlation-ID'], headers['X-Request-ID']);
  assert.match(headers['X-Correlation-ID'], /^[A-Za-z0-9-]+$/);
});

test('duplicate login is suppressed briefly but different clients are independent', () => {
  clearLoginLock();
  assert.equal(acquireLoginLock('admin-ui', 'https://admin.example/callback'), true);
  assert.equal(acquireLoginLock('admin-ui', 'https://admin.example/callback'), false);
  assert.equal(acquireLoginLock('pms-ui', 'https://pms.example/callback'), true);
});
