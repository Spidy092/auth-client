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
export function getListenerCount() {
  return listeners.size;
}
