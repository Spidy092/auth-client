# auth-client SDK

A lightweight, framework-agnostic authentication client SDK designed for scalable React (and non-React) apps using centralized login via Keycloak + Auth Service.

---

## 📦 Installation

```bash
npm install auth-client
```

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
