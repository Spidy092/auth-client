// auth-client/token.js - MINIMAL WORKING VERSION

import { jwtDecode } from 'jwt-decode';

let accessToken = null;
const listeners = new Set();

const REFRESH_COOKIE = 'account_refresh_token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

function secureAttribute() {
  try {
    return typeof window !== 'undefined' && window.location?.protocol === 'https:'
      ? '; Secure'
      : '';
  } catch (err) {
    return '';
  }
}

// ========== ACCESS TOKEN ==========
function writeAccessToken(token) {
  if (!token) {
    try {
      localStorage.removeItem('authToken');
    } catch (err) {
      console.warn('Could not clear token from localStorage:', err);
    }
    return;
  }

  try {
    localStorage.setItem('authToken', token);
  } catch (err) {
    console.warn('Could not persist token to localStorage:', err);
  }
}

function readAccessToken() {
  try {
    return localStorage.getItem('authToken');
  } catch (err) {
    console.warn('Could not read token from localStorage:', err);
    return null;
  }
}

// ========== REFRESH TOKEN (KEEP SIMPLE) ==========
// export function setRefreshToken(token) {
//   if (!token) {
//     clearRefreshToken();
//     return;
//   }

//   const expires = new Date(Date.now() + COOKIE_MAX_AGE * 1000);

//   try {
//     document.cookie = `${REFRESH_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=Lax${secureAttribute()}; Expires=${expires.toUTCString()}`;
//   } catch (err) {
//     console.warn('Could not set refresh token:', err);
//   }
// }

// export function getRefreshToken() {
//   try {
//     const match = document.cookie
//       ?.split('; ')
//       ?.find((row) => row.startsWith(`${REFRESH_COOKIE}=`));

//     if (match) {
//       return decodeURIComponent(match.split('=')[1]);
//     }
//   } catch (err) {
//     console.warn('Could not read refresh token:', err);
//   }

//   return null;
// }

// export function clearRefreshToken() {
//   try {
//     document.cookie = `${REFRESH_COOKIE}=; Path=/; SameSite=Lax${secureAttribute()}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
//   } catch (err) {
//     console.warn('Could not clear refresh token:', err);
//   }
// }

// ========== ACCESS TOKEN FUNCTIONS ==========
function decode(token) {
  try {
    return jwtDecode(token);
  } catch (err) {
    return null;
  }
}

function isExpired(token, bufferSeconds = 60) {
  if (!token) return true;
  const decoded = decode(token);
  if (!decoded?.exp) return true;
  const now = Date.now() / 1000;
  return decoded.exp < now + bufferSeconds;
}

export function setToken(token) {
  const previousToken = accessToken;
  accessToken = token || null;
  writeAccessToken(accessToken);

  if (previousToken !== accessToken) {
    listeners.forEach((listener) => {
      try {
        listener(accessToken, previousToken);
      } catch (err) {
        console.warn('Token listener error:', err);
      }
    });
  }
}

export function getToken() {
  if (accessToken) return accessToken;
  accessToken = readAccessToken();
  return accessToken;
}

export function clearToken() {
  if (!accessToken) {
    writeAccessToken(null);
    clearRefreshToken();
    return;
  }

  const previousToken = accessToken;
  accessToken = null;
  writeAccessToken(null);
  clearRefreshToken();

  listeners.forEach((listener) => {
    try {
      listener(null, previousToken);
    } catch (err) {
      console.warn('Token listener error:', err);
    }
  });
}

// ========== REFRESH TOKEN STORAGE FOR HTTP DEVELOPMENT ==========
// In production, refresh tokens should ONLY be in httpOnly cookies set by server
// For HTTP development (cross-origin cookies don't work), we store in localStorage
const REFRESH_TOKEN_KEY = 'auth_refresh_token';

function isHttpDevelopment() {
  try {
    return typeof window !== 'undefined' &&
      window.location?.protocol === 'http:';
  } catch (err) {
    return false;
  }
}

export function setRefreshToken(token) {
  if (!token) {
    clearRefreshToken();
    return;
  }

  // For HTTP development, store in localStorage (since httpOnly cookies don't work cross-origin)
  if (isHttpDevelopment()) {
    try {
      localStorage.setItem(REFRESH_TOKEN_KEY, token);
      console.log('📦 Refresh token stored in localStorage (HTTP dev mode)');
    } catch (err) {
      console.warn('Could not store refresh token:', err);
    }
  } else {
    // In production (HTTPS), refresh token should be in httpOnly cookie only
    console.log('🔒 Refresh token managed by server httpOnly cookie (production mode)');
  }
}

export function getRefreshToken() {
  // For HTTP development, read from localStorage
  if (isHttpDevelopment()) {
    try {
      const token = localStorage.getItem(REFRESH_TOKEN_KEY);
      return token;
    } catch (err) {
      console.warn('Could not read refresh token:', err);
      return null;
    }
  }

  // In production, refresh token is in httpOnly cookie (not accessible via JS)
  // The refresh endpoint uses credentials: 'include' to send the cookie
  return null;
}

export function clearRefreshToken() {
  // Clear localStorage (for HTTP dev)
  try {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch (err) {
    // Ignore
  }

  // Clear cookie (for production)
  try {
    document.cookie = `${REFRESH_COOKIE}=; Path=/; SameSite=Strict${secureAttribute()}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  } catch (err) {
    console.warn('Could not clear refresh token cookie:', err);
  }

  // Clear sessionStorage
  try {
    sessionStorage.removeItem(REFRESH_COOKIE);
  } catch (err) {
    // Ignore
  }
}

export function addTokenListener(listener) {
  if (typeof listener !== 'function') {
    throw new Error('Token listener must be a function');
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function removeTokenListener(listener) {
  listeners.delete(listener);
}

export function getListenerCount() {
  return listeners.size;
}

export function isAuthenticated() {
  const token = getToken();
  return !!token && !isExpired(token, 15);
}




// // auth-client/token.js
// import { jwtDecode } from 'jwt-decode';

// let accessToken = null;
// const listeners = new Set();

// const REFRESH_COOKIE = 'account_refresh_token';
// const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

// function secureAttribute() {
//   try {
//     return typeof window !== 'undefined' && window.location?.protocol === 'https:'
//       ? '; Secure'
//       : '';
//   } catch (err) {
//     return '';
//   }
// }

// function writeAccessToken(token) {
//   if (!token) {
//     try {
//       localStorage.removeItem('authToken');
//     } catch (err) {
//       console.warn('Could not clear token from localStorage:', err);
//     }
//     return;
//   }

//   try {
//     localStorage.setItem('authToken', token);
//   } catch (err) {
//     console.warn('Could not persist token to localStorage:', err);
//   }
// }

// function readAccessToken() {
//   try {
//     return localStorage.getItem('authToken');
//   } catch (err) {
//     console.warn('Could not read token from localStorage:', err);
//     return null;
//   }
// }

// function decode(token) {
//   try {
//     return jwtDecode(token);
//   } catch (err) {
//     return null;
//   }
// }

// function isExpired(token, bufferSeconds = 60) {
//   if (!token) return true;
//   const decoded = decode(token);
//   if (!decoded?.exp) return true;
//   const now = Date.now() / 1000;
//   return decoded.exp < now + bufferSeconds;
// }

// export function setToken(token) {
//   const previousToken = accessToken;
//   accessToken = token || null;
//   writeAccessToken(accessToken);

//   if (previousToken !== accessToken) {
//     listeners.forEach((listener) => {
//       try {
//         listener(accessToken, previousToken);
//       } catch (err) {
//         console.warn('Token listener error:', err);
//       }
//     });
//   }
// }

// export function getToken() {
//   if (accessToken) return accessToken;
//   accessToken = readAccessToken();
//   return accessToken;
// }

// export function clearToken() {
//   if (!accessToken) {
//     writeAccessToken(null);
//     clearRefreshToken();
//     return;
//   }

//   const previousToken = accessToken;
//   accessToken = null;
//   writeAccessToken(null);
//   clearRefreshToken();

//   listeners.forEach((listener) => {
//     try {
//       listener(null, previousToken);
//     } catch (err) {
//       console.warn('Token listener error:', err);
//     }
//   });
// }

// export function setRefreshToken(token) {
//   if (!token) {
//     clearRefreshToken();
//     return;
//   }

//   const expires = new Date(Date.now() + COOKIE_MAX_AGE * 1000);
//   try {
//     document.cookie = `${REFRESH_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=Strict${secureAttribute()}; Expires=${expires.toUTCString()}`;
//   } catch (err) {
//     console.warn('Could not persist refresh token cookie:', err);
//   }

//   try {
//     sessionStorage.setItem(REFRESH_COOKIE, token);
//   } catch (err) {
//     console.warn('Could not persist refresh token to sessionStorage:', err);
//   }
// }

// export function getRefreshToken() {
//   // Prefer cookie to align with server expectations
//   let cookieMatch = null;

//   try {
//     cookieMatch = document.cookie
//       ?.split('; ')
//       ?.find((row) => row.startsWith(`${REFRESH_COOKIE}=`));
//   } catch (err) {
//     cookieMatch = null;
//   }

//   if (cookieMatch) {
//     return decodeURIComponent(cookieMatch.split('=')[1]);
//   }

//   try {
//     return sessionStorage.getItem(REFRESH_COOKIE);
//   } catch (err) {
//     console.warn('Could not read refresh token from sessionStorage:', err);
//     return null;
//   }
// }

// export function clearRefreshToken() {
//   try {
//     document.cookie = `${REFRESH_COOKIE}=; Path=/; SameSite=Strict${secureAttribute()}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
//   } catch (err) {
//     console.warn('Could not clear refresh token cookie:', err);
//   }
//   try {
//     sessionStorage.removeItem(REFRESH_COOKIE);
//   } catch (err) {
//     console.warn('Could not clear refresh token from sessionStorage:', err);
//   }
// }

// export function addTokenListener(listener) {
//   if (typeof listener !== 'function') {
//     throw new Error('Token listener must be a function');
//   }
//   listeners.add(listener);
//   return () => {
//     listeners.delete(listener);
//   };
// }

// export function removeTokenListener(listener) {
//   listeners.delete(listener);
// }

// export function getListenerCount() {
//   return listeners.size;
// }

// export function isAuthenticated() {
//   const token = getToken();
//   return !!token && !isExpired(token, 15);
// }

