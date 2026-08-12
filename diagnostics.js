const STORAGE_KEY = 'auth_diagnostic_context';
const LOGIN_LOCK_KEY = 'auth_login_lock';

const randomId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `auth-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const fingerprint = async (value) => {
  if (!value || !globalThis.crypto?.subtle) return null;
  const bytes = new TextEncoder().encode(String(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].slice(0, 6)
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export function getDiagnosticContext() {
  try {
    const existing = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    if (existing?.correlationId) return existing;
  } catch {}
  const context = { correlationId: randomId(), startedAt: Date.now() };
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context)); } catch {}
  return context;
}

export function resetDiagnosticContext() {
  const context = { correlationId: randomId(), startedAt: Date.now() };
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context)); } catch {}
  return context;
}

export function diagnosticHeaders() {
  const { correlationId } = getDiagnosticContext();
  return { 'X-Correlation-ID': correlationId, 'X-Request-ID': correlationId };
}

export function acquireLoginLock(clientKey, redirectUri, ttlMs = 5000) {
  const now = Date.now();
  const signature = `${clientKey}|${redirectUri}`;
  try {
    const current = JSON.parse(sessionStorage.getItem(LOGIN_LOCK_KEY) || 'null');
    if (current?.signature === signature && now - current.createdAt < ttlMs) return false;
    sessionStorage.setItem(LOGIN_LOCK_KEY, JSON.stringify({ signature, createdAt: now }));
  } catch {}
  return true;
}

export function clearLoginLock() {
  try { sessionStorage.removeItem(LOGIN_LOCK_KEY); } catch {}
}

export async function emitAuthDiagnostic(event, outcome, reasonCode, details = {}) {
  const context = getDiagnosticContext();
  const safe = {
    eventType: 'auth_client_diagnostic',
    event,
    outcome,
    reasonCode,
    correlationId: context.correlationId,
    elapsedMs: Date.now() - context.startedAt,
    clientKey: details.clientKey || null,
    status: details.status || null,
    stateFingerprint: await fingerprint(details.state),
    online: typeof navigator === 'undefined' ? null : navigator.onLine,
  };
  const method = outcome === 'FAILURE' ? 'error' : outcome === 'WARNING' ? 'warn' : 'info';
  console[method]('[auth-client]', safe);
  return safe;
}
