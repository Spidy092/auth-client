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
export function setRefreshToken(token) {
  if (!token) {
    clearRefreshToken();
    return;
  }

  const expires = new Date(Date.now() + COOKIE_MAX_AGE * 1000);
  
  try {
    document.cookie = `${REFRESH_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=Lax${secureAttribute()}; Expires=${expires.toUTCString()}`;
  } catch (err) {
    console.warn('Could not set refresh token:', err);
  }
}

export function getRefreshToken() {
  try {
    const match = document.cookie
      ?.split('; ')
      ?.find((row) => row.startsWith(`${REFRESH_COOKIE}=`));
    
    if (match) {
      return decodeURIComponent(match.split('=')[1]);
    }
  } catch (err) {
    console.warn('Could not read refresh token:', err);
  }
  
  return null;
}

export function clearRefreshToken() {
  try {
    document.cookie = `${REFRESH_COOKIE}=; Path=/; SameSite=Lax${secureAttribute()}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  } catch (err) {
    console.warn('Could not clear refresh token:', err);
  }
}

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

export function setRefreshToken(token) {
  // ✅ SECURITY: Refresh tokens should ONLY be in httpOnly cookies set by server
  // This function should NOT be used - refresh tokens must come from server cookies
  // Keeping for backwards compatibility but logging warning
  
  if (!token) {
    clearRefreshToken();
    return;
  }

  console.warn('⚠️ SECURITY WARNING: setRefreshToken() called - refresh tokens should only be in httpOnly cookies!');
  console.warn('⚠️ Refresh tokens set client-side are insecure and should be removed');
  
  // ❌ DO NOT store refresh token in client-side storage
  // The server sets it in httpOnly cookie, which is the only secure way
  
  // Only clear any existing client-side storage
  try {
    sessionStorage.removeItem(REFRESH_COOKIE);
  } catch (err) {
    // Ignore
  }
}

export function getRefreshToken() {
  // ✅ Refresh tokens are stored in httpOnly cookies by the server
  // We cannot read httpOnly cookies from JavaScript - they're only sent with requests
  // This function is kept for backwards compatibility but returns null
  // The refresh endpoint will automatically use the httpOnly cookie via credentials: 'include'
  
  // ❌ DO NOT try to read refresh token from client-side storage
  // httpOnly cookies are not accessible via document.cookie
  
  console.warn('⚠️ getRefreshToken() called - refresh tokens are in httpOnly cookies and cannot be read from JavaScript');
  console.warn('⚠️ The refresh endpoint will automatically use the httpOnly cookie via credentials: "include"');
  
  return null; // Refresh token is in httpOnly cookie, not accessible to JavaScript
}

export function clearRefreshToken() {
  try {
    document.cookie = `${REFRESH_COOKIE}=; Path=/; SameSite=Strict${secureAttribute()}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  } catch (err) {
    console.warn('Could not clear refresh token cookie:', err);
  }
  try {
    sessionStorage.removeItem(REFRESH_COOKIE);
  } catch (err) {
    console.warn('Could not clear refresh token from sessionStorage:', err);
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

