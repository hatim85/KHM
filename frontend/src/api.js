import axios from 'axios';

const api = axios.create({
  baseURL: 'https://khm-erp.duckdns.org/api',
  withCredentials: true, // Required for HttpOnly cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor to handle 401 and 429
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Rate limited — surface a clean message
    if (error.response && error.response.status === 429) {
      error.message = error.response.data?.message || 'Too many requests. Please slow down.';
    }
    if (error.response && error.response.status === 401) {
      // Don't loop or log out if the 401 is on an auth endpoint
      if (!error.config?.url?.includes('/auth/')) {
        const { default: store } = await import('./store');
        const { logout } = await import('./features/authSlice');
        store.dispatch(logout());
      }
    }
    return Promise.reject(error);
  }
);

export default api;
