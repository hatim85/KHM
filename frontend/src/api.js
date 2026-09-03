import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // Required for HttpOnly cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor to handle 401 (token expired / unauthenticated)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response && error.response.status === 401) {
      // Don't loop if the 401 is on /auth/me during initial boot
      if (!error.config.url.includes('/auth/me') && !error.config.url.includes('/auth/login')) {
        const { default: store } = await import('./store');
        const { logout } = await import('./features/authSlice');
        store.dispatch(logout());
      }
    }
    return Promise.reject(error);
  }
);

export default api;
