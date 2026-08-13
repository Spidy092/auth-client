import api from './api.js';

export const PREFERENCE_DEFAULTS = Object.freeze({
  theme: 'system',
  colorScheme: 'blue',
  density: 'comfortable',
  reducedMotion: false,
  language: 'en',
  timezone: 'Etc/UTC',
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h',
  highContrast: false,
  largeText: false,
});

const ALLOWED = {
  theme: new Set(['light', 'dark', 'system']),
  density: new Set(['compact', 'comfortable', 'spacious']),
  timeFormat: new Set(['12h', '24h']),
};

const listeners = new Set();
let cachedPreferences = null;
let pendingRequest = null;
let syncCleanup = null;

export function extractResponseData(response) {
  return response?.data?.data ?? response?.data ?? response ?? {};
}

export function normalizePreferences(value = {}) {
  const next = { ...PREFERENCE_DEFAULTS };
  for (const key of Object.keys(PREFERENCE_DEFAULTS)) {
    if (!Object.hasOwn(value, key)) continue;
    const candidate = value[key];
    if (ALLOWED[key] && !ALLOWED[key].has(candidate)) continue;
    if (typeof PREFERENCE_DEFAULTS[key] !== typeof candidate) continue;
    next[key] = candidate;
  }
  return next;
}

export function resolveTheme(theme, matchMedia = globalThis.matchMedia) {
  if (theme === 'dark' || theme === 'light') return theme;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function announce(preferences) {
  cachedPreferences = normalizePreferences(preferences);
  listeners.forEach((listener) => listener(cachedPreferences));
  return cachedPreferences;
}

export async function getPreferences({ force = false } = {}) {
  if (cachedPreferences && !force) return cachedPreferences;
  if (pendingRequest) return pendingRequest;

  pendingRequest = api.get('/account/preferences')
    .then((response) => announce(extractResponseData(response)))
    .finally(() => { pendingRequest = null; });
  return pendingRequest;
}

export async function updatePreferences(patch) {
  const allowedPatch = {};
  for (const key of Object.keys(PREFERENCE_DEFAULTS)) {
    if (Object.hasOwn(patch, key)) allowedPatch[key] = patch[key];
  }
  const candidate = normalizePreferences({ ...(cachedPreferences || PREFERENCE_DEFAULTS), ...allowedPatch });
  const response = await api.put('/account/preferences', allowedPatch);
  const saved = extractResponseData(response);
  return announce(Object.keys(saved).length ? saved : candidate);
}

export function subscribePreferences(listener) {
  listeners.add(listener);
  if (cachedPreferences) listener(cachedPreferences);
  return () => listeners.delete(listener);
}

export function clearPreferenceCache() {
  cachedPreferences = null;
  pendingRequest = null;
}

export function applyPreferences(preferences, documentRef = globalThis.document) {
  if (!documentRef?.documentElement) return;
  const value = normalizePreferences(preferences);
  const root = documentRef.documentElement;
  const resolvedTheme = resolveTheme(value.theme, documentRef.defaultView?.matchMedia?.bind(documentRef.defaultView));

  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = value.theme;
  root.dataset.colorScheme = value.colorScheme;
  root.dataset.density = value.density;
  root.lang = value.language;
  root.style.colorScheme = resolvedTheme;
  root.style.setProperty('--user-accent-color', {
    blue: '#1976d2',
    green: '#2e7d32',
    purple: '#7b1fa2',
    orange: '#c65d00',
    red: '#c62828',
  }[value.colorScheme] || '#1976d2');
  root.classList.toggle('user-reduced-motion', value.reducedMotion);
  root.classList.toggle('user-high-contrast', value.highContrast);
  root.classList.toggle('user-large-text', value.largeText);

  const styleId = 'sso-user-preference-styles';
  if (!documentRef.getElementById(styleId)) {
    const style = documentRef.createElement('style');
    style.id = styleId;
    style.textContent = `
      html.user-large-text { font-size: 112.5%; }
      html.user-high-contrast { filter: contrast(1.15); }
      html[data-density="compact"] { --user-density-padding: 6px; }
      html[data-density="comfortable"] { --user-density-padding: 10px; }
      html[data-density="spacious"] { --user-density-padding: 14px; }
      html[data-density] .MuiListItem-root { padding-top: var(--user-density-padding); padding-bottom: var(--user-density-padding); }
      html.user-reduced-motion *, html.user-reduced-motion *::before, html.user-reduced-motion *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition-duration: 0.01ms !important;
      }
    `;
    documentRef.head?.appendChild(style);
  }
}

export function startPreferenceSync({ refreshOnFocus = true } = {}) {
  if (syncCleanup || typeof globalThis.addEventListener !== 'function') return syncCleanup || (() => {});
  const refresh = () => {
    if (!globalThis.document || globalThis.document.visibilityState === 'visible') {
      getPreferences({ force: true }).catch(() => {});
    }
  };
  const onVisibility = () => refresh();
  globalThis.document?.addEventListener?.('visibilitychange', onVisibility);
  if (refreshOnFocus) globalThis.addEventListener('focus', refresh);
  syncCleanup = () => {
    globalThis.document?.removeEventListener?.('visibilitychange', onVisibility);
    if (refreshOnFocus) globalThis.removeEventListener('focus', refresh);
    syncCleanup = null;
  };
  return syncCleanup;
}

function localeFor(language) {
  const supported = Intl.DateTimeFormat.supportedLocalesOf([language]);
  return supported[0] || 'en';
}

function fixedOffset(value) {
  const match = /^UTC([+-])(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return null;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return (match[1] === '-' ? -1 : 1) * minutes;
}

export function formatUserDate(input, preferences = cachedPreferences || PREFERENCE_DEFAULTS, options = {}) {
  const value = normalizePreferences(preferences);
  const date = input instanceof Date ? input : new Date(input);
  const offset = fixedOffset(value.timezone);
  const adjusted = offset === null ? date : new Date(date.getTime() + offset * 60_000);
  const timeZone = offset === null ? value.timezone : 'UTC';
  const hasExplicitParts = ['year', 'month', 'day', 'weekday', 'hour', 'minute', 'second', 'dateStyle', 'timeStyle']
    .some((key) => options[key] !== undefined);
  const dateOptions = hasExplicitParts
    ? options
    : { year: 'numeric', month: '2-digit', day: '2-digit' };
  const formatter = new Intl.DateTimeFormat(localeFor(value.language), {
    ...dateOptions,
    timeZone,
    ...(dateOptions.hour || dateOptions.timeStyle ? { hour12: value.timeFormat === '12h' } : {}),
  });
  if (!hasExplicitParts) {
    const parts = Object.fromEntries(formatter.formatToParts(adjusted).map((part) => [part.type, part.value]));
    if (value.dateFormat === 'DD/MM/YYYY') return `${parts.day}/${parts.month}/${parts.year}`;
    if (value.dateFormat === 'YYYY-MM-DD') return `${parts.year}-${parts.month}-${parts.day}`;
    return `${parts.month}/${parts.day}/${parts.year}`;
  }
  return formatter.format(adjusted);
}

export function formatUserNumber(input, preferences = cachedPreferences || PREFERENCE_DEFAULTS, options = {}) {
  const value = normalizePreferences(preferences);
  return new Intl.NumberFormat(localeFor(value.language), options).format(input);
}

export function formatUserRelativeTime(input, preferences = cachedPreferences || PREFERENCE_DEFAULTS, now = new Date()) {
  const value = normalizePreferences(preferences);
  const deltaSeconds = (new Date(input).getTime() - now.getTime()) / 1000;
  const units = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
    ['second', 1],
  ];
  const [unit, seconds] = units.find(([, size]) => Math.abs(deltaSeconds) >= size) || units.at(-1);
  return new Intl.RelativeTimeFormat(localeFor(value.language), { numeric: 'auto' })
    .format(Math.round(deltaSeconds / seconds), unit);
}

export const preferences = {
  defaults: PREFERENCE_DEFAULTS,
  get: getPreferences,
  update: updatePreferences,
  subscribe: subscribePreferences,
  clearCache: clearPreferenceCache,
  apply: applyPreferences,
  startSync: startPreferenceSync,
  formatDate: formatUserDate,
  formatNumber: formatUserNumber,
  formatRelativeTime: formatUserRelativeTime,
  normalize: normalizePreferences,
  resolveTheme,
};
