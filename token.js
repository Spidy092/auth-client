// auth-client/token.js
let memoryToken = null;
const listeners = new Set(); // ✅ Add listeners

export function setToken(token) {
  const previousToken = memoryToken;
  memoryToken = token;
  
  try {
    localStorage.setItem('authToken', token);
  } catch (err) {
    console.warn('Could not write token to localStorage:', err);
  }

  // ✅ Notify listeners when token changes
  if (previousToken !== token) {
    console.log('🔔 Token changed, notifying listeners:', { 
      listenerCount: listeners.size,
      hadToken: !!previousToken,
      hasToken: !!token 
    });
    
    listeners.forEach(listener => {
      try {
        listener(token, previousToken);
      } catch (err) {
        console.warn('Token listener error:', err);
      }
    });
  }
}

export function getToken() {
  if (memoryToken) return memoryToken;
  try {
    const stored = localStorage.getItem('authToken');
    memoryToken = stored;
    return stored;
  } catch (err) {
    console.warn('Could not read token from localStorage:', err);
    return null;
  }
}

export function clearToken() {
  const previousToken = memoryToken;
  memoryToken = null;
  
  try {
    localStorage.removeItem('authToken');
  } catch (err) {
    console.warn('Could not clear token from localStorage:', err);
  }

  // ✅ Notify listeners when token is cleared
  if (previousToken) {
    console.log('🔔 Token cleared, notifying listeners:', { 
      listenerCount: listeners.size 
    });
    
    listeners.forEach(listener => {
      try {
        listener(null, previousToken);
      } catch (err) {
        console.warn('Token listener error:', err);
      }
    });
  }
}

// ✅ Add listener management
export function addTokenListener(listener) {
  if (typeof listener !== 'function') {
    throw new Error('Token listener must be a function');
  }
  
  listeners.add(listener);
  console.log('📎 Token listener added, total listeners:', listeners.size);
  
  // Return cleanup function
  return () => {
    const removed = listeners.delete(listener);
    if (removed) {
      console.log('📎 Token listener removed, remaining listeners:', listeners.size);
    }
    return removed;
  };
}

export function removeTokenListener(listener) {
  const removed = listeners.delete(listener);
  if (removed) {
    console.log('📎 Token listener removed, remaining listeners:', listeners.size);
  }
  return removed;
}

// ✅ Debug function to see current listeners
// ✅ Decode JWT payload safely
// export function decodeToken(token) {
//   if (!token) return null;

//   try {
//     const base64Url = token.split('.')[1]; // JWT payload is 2nd part
//     if (!base64Url) return null;

//     const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
//     const jsonPayload = decodeURIComponent(
//       atob(base64)
//         .split('')
//         .map((c) => `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`)
//         .join('')
//     );

//     return JSON.parse(jsonPayload);
//   } catch (err) {
//     console.warn('Could not decode token:', err);
//     return null;
//   }
// }

// // ✅ Check if JWT is expired (with optional buffer)
// export function isTokenExpired(token, bufferSeconds = 0) {
//   if (!token) return true;

//   const decoded = decodeToken(token);
//   if (!decoded || !decoded.exp) return true; // no exp claim → treat as expired

//   const expiryTime = decoded.exp * 1000; // exp is in seconds → convert to ms
//   const currentTime = Date.now();

//   // Add buffer (e.g., 60s) to expire slightly earlier
//   return currentTime >= expiryTime - bufferSeconds * 1000;
// }

// ✅ Check if user is authenticated
export function isAuthenticated() {
  const token = getToken();
  return !!token && !isTokenExpired(token);
}

