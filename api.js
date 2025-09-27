// auth-client/api.js
import axios from 'axios';
import { getToken } from './token';
import { getConfig } from './config';

// ✅ Fixed: Create instance without baseURL initially
const api = axios.create({
  withCredentials: true,
});

// ✅ Fixed: Set baseURL dynamically in interceptor
api.interceptors.request.use((config) => {
  // Set baseURL dynamically each time
  if (!config.baseURL) {
    const authConfig = getConfig();
    config.baseURL = authConfig?.authBaseUrl || 'http://localhost:4000';
  }
  
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ✅ Added: Response interceptor for token refresh/error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn('API request failed with 401, token may be expired');
      // You could trigger token refresh or logout here
    }
    return Promise.reject(error);
  }
);


api.validateSession = async () => {
  try {
    const response = await api.get('/account/validate-session');
    return response.data.valid;
  } catch (error) {
    if (error.response?.status === 401) {
      return false;
    }
    throw error;
  }
};

export default api;
