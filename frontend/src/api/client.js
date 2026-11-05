const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
const TOKEN_KEY = 'coursehubs_token';

const ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'The email address or password is incorrect.',
  CURRENT_PASSWORD_INVALID: 'Your current password is incorrect.',
  ACCOUNT_TEMPORARILY_LOCKED: 'Too many unsuccessful attempts. Please try again later.',
  EMAIL_NOT_VERIFIED: 'Verify your email address before signing in.',
  ACCOUNT_SUSPENDED: 'This account is currently unavailable. Please contact CourseHubs support.',
  UNAUTHENTICATED: 'Please sign in to continue.',
  INVALID_TOKEN: 'Your session has expired. Please sign in again.',
  SESSION_INVALID: 'Your session is no longer valid. Please sign in again.',
  INVALID_VERIFICATION_TOKEN: 'This verification link is invalid or has already been used.',
  VERIFICATION_EXPIRED: 'This verification link has expired. Request a new one.',
  RESET_TOKEN_EXPIRED: 'This password-reset link is invalid or has expired. Request a new one.',
};

const STATUS_MESSAGES = {
  400: 'We could not process that request. Please check the information and try again.',
  401: 'Please sign in again to continue.',
  403: 'You do not have permission to complete this action.',
  404: 'We could not find what you were looking for.',
  503: 'This service is temporarily unavailable. Please try again shortly.',
  409: 'We could not complete that request because the information conflicts with an existing record.',
  410: 'This link has expired or is no longer valid. Request a new one to continue.',
  422: 'Please review the highlighted information and try again.',
  429: 'Too many requests. Please wait a moment and try again.',
};

const FIELD_FALLBACKS = {
  first_name: 'Enter your first name.',
  surname: 'Enter your surname.',
  middle_name: 'Check your middle name.',
  email: 'Enter a valid email address.',
  new_email: 'Enter a valid new email address.',
  phone: 'Enter a valid phone number.',
  password: 'Enter a password that meets the requirements.',
  new_password: 'Choose a password that meets the requirements.',
  confirm_password: 'Confirm your new password.',
  account_type: 'Choose a valid account type.',
  reg_no: 'Enter your student registration number.',
  level: 'Choose a valid academic level.',
  expected_graduation_session_id: 'Choose an expected graduation session.',
  staff_no: 'Enter your staff number.',
  token: 'This link is invalid or has expired. Request a new one.',
  confirmation: 'Type DELETE to confirm.',
  profile_picture_data: 'Choose a valid profile photo.',
};

const KNOWN_FIELD_MESSAGES = {
  first_name: ['First name is required.', 'Enter a first name of no more than 80 characters.'],
  surname: ['Surname is required.', 'Enter a surname of no more than 80 characters.'],
  middle_name: ['Middle name must be no more than 80 characters.'],
  email: ['Email is required.', 'Enter a valid email address.', 'An account with this email already exists.'],
  new_email: ['Enter a valid email address.', 'Choose a different email address.', 'That email address is already in use.'],
  phone: ['Phone number is required.', 'Enter a valid phone number.'],
  password: ['Password is required.', 'Password must be at least 8 characters.', 'Password must not exceed 72 bytes.'],
  new_password: ['Use between 8 and 72 characters.'],
  confirm_password: ['The passwords do not match.'],
  account_type: ['Account type is required.', 'Account type must be one of: student, staff.'],
  reg_no: ['Registration number is required.', 'An account with this registration number already exists.'],
  level: ['Level is required.', 'Level must be a level between 100 and 500, in steps of 100.'],
  expected_graduation_session_id: ['Expected graduation session is required.'],
  staff_no: ['Staff number is required.', 'An account with this staff number already exists.'],
  token: ['This password-reset link is invalid.'],
  confirmation: ['Type DELETE to confirm.'],
  profile_picture_data: ['Choose a valid JPG, PNG or WebP image.', 'Your profile photo must be smaller than 400 KB after processing.', 'The selected file is not a supported image.'],
};

function safeFieldErrors(fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return undefined;
  const safe = {};
  for (const [field, message] of Object.entries(fields)) {
    if (!(field in FIELD_FALLBACKS)) continue;
    const allowed = KNOWN_FIELD_MESSAGES[field] || [];
    safe[field] = typeof message === 'string' && allowed.includes(message)
      ? message
      : FIELD_FALLBACKS[field];
  }
  return Object.keys(safe).length ? safe : undefined;
}

function safeErrorMessage(data, status, fields) {
  const code = typeof data?.code === 'string' ? data.code : '';
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (status >= 500) return 'Something went wrong on our end. Please try again shortly.';
  if (status === 422 && fields) return 'Please review the highlighted information and try again.';
  return STATUS_MESSAGES[status] || 'We could not complete your request. Please try again.';
}

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
    throw new Error('We could not connect to CourseHubs. Check your internet connection and try again.');
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const fields = safeFieldErrors(data?.fields);
    const code = typeof data?.code === 'string' && Object.hasOwn(ERROR_MESSAGES, data.code)
      ? data.code
      : undefined;
    const error = new Error(safeErrorMessage(data, response.status, fields));
    error.status = response.status;
    if (code) error.code = code;
    if (fields) error.fields = fields;
    if (code === 'EMAIL_NOT_VERIFIED' && typeof data?.email === 'string') error.email = data.email;
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
  del: (path, body) => request(path, { method: 'DELETE', ...(body ? { body: JSON.stringify(body) } : {}) }),
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

export function getAccount() { return api.get('/account'); }
export function updateAccountProfile(payload) { return api.patch('/account/profile', payload); }
export function requestEmailChange(payload) { return api.post('/account/email-change', payload); }
export function verifyEmailChange(token) { return api.get(`/account/verify-email-change?token=${encodeURIComponent(token)}`); }
export function changeAccountPassword(payload) { return api.post('/account/password', payload); }
export function deleteAccount(payload) { return api.del('/account', payload); }
export function exchangeGoogleCode(code) { return api.post('/auth/google/exchange', { code }); }
export function startGoogleSignIn() { window.location.assign(`${BASE_URL}/auth/google`); }
