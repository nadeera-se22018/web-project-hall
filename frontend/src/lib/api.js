import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || `https://${window.location.hostname}:5000`;

let authTokenGetter = null;

export const setAuthTokenGetter = (fn) => {
  authTokenGetter = fn;
};

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

api.interceptors.request.use(
  async (config) => {
    let token = null;
    if (authTokenGetter) {
      try {
        token = await authTokenGetter();
      } catch {}
    }
    if (!token) {
      token = localStorage.getItem('access_token');
    }
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const isRefreshReq = originalRequest?.url === '/api/auth/refresh';

    if (
      error.response?.status === 401 &&
      error.response?.data?.code === 'TOKEN_EXPIRED' &&
      !originalRequest._retry &&
      !isRefreshReq
    ) {
      originalRequest._retry = true;

      try {
        await axios.post(`${API_URL}/api/auth/refresh`, {}, {
          withCredentials: true,
        });

        return api(originalRequest);
      } catch (refreshError) {
        handleSessionExpired();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

function handleSessionExpired() {
  localStorage.clear();
  window.dispatchEvent(new Event('auth-logout'));
}

export default api;
