# auth-client SDK

A lightweight, framework-agnostic authentication client SDK designed for scalable React (and non-React) apps using centralized login via Keycloak + Auth Service.

---

## 📦 Installation

```bash
npm install @spidy092/auth-client
```

> **Note:** This package supports both **ES Modules (`import`)** and **CommonJS (`require`)**.
> 
> **CommonJS Usage:**
> ```js
> const { auth } = require('auth-client');
> const api = require('auth-client/api').default; // Note: .default is required for api
> const { decodeToken } = require('auth-client/utils/jwt');
> ```

---

## 🔧 Setup

```js
import { auth } from 'auth-client';

auth.setConfig({
  clientKey: 'admin-ui',
  authBaseUrl: 'http://auth.localhost:4000/auth',
});
```

---

## 🚀 Usage

### Login
```js
auth.login();
```

For applications that coordinate login across same-origin tabs, prefer the
promise-based entry point. It uses the Web Locks API when available and falls
back to the storage lease for older or restricted browsers:

```js
await auth.loginAsync();
```

The login lease expires after 5 minutes as a crash-recovery upper bound. It is
not a user-facing wait: a waiting tab should offer an immediate takeover
action that calls `auth.clearLoginLease()` before starting a new login.

### Handle Callback
```js
auth.handleCallback(); // Call this on /callback page
```

### Logout
```js
auth.logout();
```

### Cross-tab auth events
```js
const unsubscribe = auth.subscribeToAuthEvents((event) => {
  if (event.type === 'LOGIN_COMPLETED') {
    // Re-establish this tab's session with auth.restoreSession().
  }
});

// Call when the component or application is disposed.
unsubscribe();
```

Login start/completion and logout events use the configured `logoutChannelName`
and carry metadata only. Applications must restore their own session; tokens
are never sent through the cross-tab transport.

When the application must decide whether to show a retry state or start a new
login transaction, it can ask the SDK to surface only temporary failures:

```js
try {
  const restored = await auth.restoreSession({ throwOnTransient: true });
  if (!restored) {
    // The refresh credential is definitively invalid; show the login boundary.
  }
} catch {
  // Network/control-plane failure; keep the session recoverable and offer retry.
}
```

The default `auth.restoreSession()` behavior remains a boolean for backwards
compatibility. The SDK owns the distinction between definitive `401`/`403` or
`invalid_grant` failures and retryable failures; applications must not parse
refresh error messages themselves.

During memory-only bootstrap, the SDK also coalesces the short-lived settled
restore result. This prevents a provider and a login boundary on the same page
from issuing duplicate cookie-refresh requests when no session exists. A
`LOGIN_COMPLETED` event invalidates that result so a sibling tab can restore the
new HttpOnly-cookie session immediately.

### Get Token
```js
const token = auth.getToken();
```

---

## 🧠 React Integration

### Provider
```jsx
import { AuthProvider } from 'auth-client/react/AuthProvider';

<AuthProvider>
  <App />
</AuthProvider>
```

### Hook
```jsx
import { useAuth } from 'auth-client/react/useAuth';

const { user, token, login, logout } = useAuth();
```

---

## 📡 Authenticated API
```js
import api from 'auth-client/api';

api.get('/me'); // sends Authorization header
```

---

## 🧪 Utilities
```js
import { decodeToken, isTokenExpired } from 'auth-client/utils/jwt';
```

---

## ✅ Built-in Features
- Token handling (in-memory + localStorage)
- CSRF-safe login with state param
- Auto API auth header via Axios
- React support via context and hooks

---

## 🔐 Security
- No HttpOnly cookies — safe from XSS if you sandbox `localStorage`
- Handles CSRF via `state`
- Designed for refresh via backend `/refresh`

---

## 📦 To Publish Locally
```bash
npm pack
npm install ../auth-client-1.0.0.tgz
```

---

## 🏁 License
MIT
