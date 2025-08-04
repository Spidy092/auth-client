let memoryToken = null;

export function setToken(token) {
  memoryToken = token;
  try {
    localStorage.setItem('authToken', token);
  } catch (err) {
    console.warn('Could not write token to localStorage:', err);
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
  memoryToken = null;
  try {
    localStorage.removeItem('authToken');
  } catch (err) {
    console.warn('Could not clear token from localStorage:', err);
  }
}
