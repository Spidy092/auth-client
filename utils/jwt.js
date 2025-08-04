// auth-client/utils/jwt.js
import { jwtDecode } from 'jwt-decode';

export function decodeToken(token) {
  try {
    return jwtDecode(token);
  } catch (err) {
    console.warn('Failed to decode JWT:', err);
    return null;
  }
}

export function isTokenExpired(token, bufferSeconds = 60) {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) return true;
  const currentTime = Date.now() / 1000;
  return decoded.exp < currentTime + bufferSeconds;
}
