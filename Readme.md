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
