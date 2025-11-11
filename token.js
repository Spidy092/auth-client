
// auth-client/token.js

import { jwtDecode } from 'jwt-decode';

let accessToken = null;
const listeners = new Set();

const REFRESH_COOKIE = 'account_refresh_token';
const REFRESH_STORAGE_KEY = 'refresh_token'; // localStorage key
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

function secureAttribute() {
  try {
    return typeof window !== 'undefined' && window.location?.protocol === 'https:'
      ? '; Secure'
      : '';
  } catch (err) {
    return '';
  }
}

// ========== ACCESS TOKEN (localStorage only) ==========
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

// ========== REFRESH TOKEN (localStorage + Cookie dual storage) ==========

/**
 * Store refresh token in BOTH localStorage AND cookie
 * Whichever survives (cross-domain, privacy settings) will work
 */
export function setRefreshToken(token) {
  if (!token) {
    clearRefreshToken();
    return;
  }

  const expires = new Date(Date.now() + COOKIE_MAX_AGE * 1000);

  // 1. Try to set cookie (works for same-domain, cross-subdomain)
  try {
    document.cookie = `${REFRESH_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=Lax${secureAttribute()}; Expires=${expires.toUTCString()}`;
    console.log('✅ Refresh token stored in cookie');
  } catch (err) {
    console.warn('⚠️ Could not persist refresh token cookie:', err);
  }

  // 2. Also store in localStorage as backup (survives browser privacy settings)
  try {
    localStorage.setItem(REFRESH_STORAGE_KEY, token);
    console.log('✅ Refresh token stored in localStorage');
  } catch (err) {
    console.warn('⚠️ Could not persist refresh token to localStorage:', err);
  }
}

/**
 * Get refresh token from cookie OR localStorage (whichever works)
 * Priority: Cookie > localStorage
 */
export function getRefreshToken() {
  // 1. Try cookie first (preferred for httpOnly scenario)
  let cookieMatch = null;
  try {
    cookieMatch = document.cookie
      ?.split('; ')
      ?.find((row) => row.startsWith(`${REFRESH_COOKIE}=`));
  } catch (err) {
    cookieMatch = null;
  }

  if (cookieMatch) {
    const token = decodeURIComponent(cookieMatch.split('=')[1]);
    console.log('✅ Retrieved refresh token from cookie');
    return token;
  }

  // 2. Fallback to localStorage
  try {
    const token = localStorage.getItem(REFRESH_STORAGE_KEY);
    if (token) {
      console.log('✅ Retrieved refresh token from localStorage (fallback)');
      return token;
    }
  } catch (err) {
    console.warn('⚠️ Could not read refresh token from localStorage:', err);
  }

  console.warn('⚠️ No refresh token found in cookie or localStorage');
  return null;
}

/**
 * Clear refresh token from BOTH cookie AND localStorage
 */
export function clearRefreshToken() {
  // Clear cookie
  try {
    document.cookie = `${REFRESH_COOKIE}=; Path=/; SameSite=Lax${secureAttribute()}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    console.log('✅ Cleared refresh token cookie');
  } catch (err) {
    console.warn('⚠️ Could not clear refresh token cookie:', err);
  }

  // Clear localStorage
  try {
    localStorage.removeItem(REFRESH_STORAGE_KEY);
    console.log('✅ Cleared refresh token from localStorage');
  } catch (err) {
    console.warn('⚠️ Could not clear refresh token from localStorage:', err);
  }
}

// ========== ACCESS TOKEN MANAGEMENT ==========
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

// ========== HELPER FUNCTIONS ==========
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

