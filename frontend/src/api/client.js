const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
const TOKEN_KEY = 'coursehubs_token';

export function setAuthToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function clearAuthToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

export function hasAuthToken() {
  return Boolean(sessionStorage.getItem(TOKEN_KEY));
}

async function request(path, options = {}) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error('Unable to reach CourseHubs. Check your connection and try again.');
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = data?.code;
    if (data?.fields) error.fields = data.fields;
    if (response.status === 401 && token) {
      clearAuthToken();
      window.dispatchEvent(new Event('coursehubs:auth-expired'));
    }
    throw error;
  }

  return data;
}

export const api = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: (path) => request(path, { method: 'DELETE' }),
};

export function checkHealth() { return api.get('/health'); }
export function getAcademicSessions() { return api.get('/academic-sessions'); }
export function register(payload) { return api.post('/auth/register', payload); }
export function verifyEmail(token) { return api.get(`/auth/verify-email?token=${encodeURIComponent(token)}`); }
export function resendVerification(email) { return api.post('/auth/resend-verification', { email }); }
export function login(payload) { return api.post('/auth/login', payload); }
export function getCurrentUser() { return api.get('/auth/me'); }
export function logout() { return api.post('/auth/logout', {}); }
export function requestPasswordReset(email) { return api.post('/auth/forgot-password', { email }); }
export function resetPassword(payload) { return api.post('/auth/reset-password', payload); }
