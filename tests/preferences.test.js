import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PREFERENCE_DEFAULTS,
  extractResponseData,
  formatUserDate,
  formatUserRelativeTime,
  normalizePreferences,
  resolveTheme,
} from '../preferences.js';

test('preference response extraction supports the standard API envelope', () => {
  assert.deepEqual(extractResponseData({ data: { data: { theme: 'dark' } } }), { theme: 'dark' });
});

test('normalization fills defaults and rejects invalid enum and type values', () => {
  const normalized = normalizePreferences({ theme: 'invalid', density: 'compact', largeText: 'yes' });
  assert.equal(normalized.theme, PREFERENCE_DEFAULTS.theme);
  assert.equal(normalized.density, 'compact');
  assert.equal(normalized.largeText, false);
  assert.equal('screenReader' in normalized, false);
  assert.equal('keyboardNavigation' in normalized, false);
});

test('system theme follows the browser media query', () => {
  assert.equal(resolveTheme('system', () => ({ matches: true })), 'dark');
  assert.equal(resolveTheme('system', () => ({ matches: false })), 'light');
  assert.equal(resolveTheme('light', () => ({ matches: true })), 'light');
});

test('date formatting supports existing fixed UTC-offset preferences', () => {
  const value = formatUserDate('2026-01-01T00:00:00.000Z', {
    ...PREFERENCE_DEFAULTS,
    timezone: 'UTC+05:30',
    timeFormat: '24h',
  }, { dateStyle: undefined, timeStyle: 'short' });

  assert.match(value, /05:30/);
});

test('date formatting honors the explicit user date format', () => {
  const source = '2026-08-13T00:00:00.000Z';
  assert.equal(formatUserDate(source, { ...PREFERENCE_DEFAULTS, dateFormat: 'YYYY-MM-DD' }), '2026-08-13');
  assert.equal(formatUserDate(source, { ...PREFERENCE_DEFAULTS, dateFormat: 'DD/MM/YYYY' }), '13/08/2026');
  assert.equal(formatUserDate(source, { ...PREFERENCE_DEFAULTS, dateFormat: 'MM/DD/YYYY' }), '08/13/2026');
});

test('relative time formatting follows the selected language', () => {
  const now = new Date('2026-08-13T12:00:00.000Z');
  assert.equal(formatUserRelativeTime('2026-08-12T12:00:00.000Z', { ...PREFERENCE_DEFAULTS, language: 'en' }, now), 'yesterday');
  assert.equal(formatUserRelativeTime('2026-08-12T12:00:00.000Z', { ...PREFERENCE_DEFAULTS, language: 'fr' }, now), 'hier');
});
