const SESSION_TOKEN_KEY = '_s';

export function getSessionToken() {
  return localStorage.getItem(SESSION_TOKEN_KEY);
}

export function setSessionToken(value: string | null) {
  if (!value) {
    localStorage.removeItem(SESSION_TOKEN_KEY);
  } else {
    localStorage.setItem(SESSION_TOKEN_KEY, value);
  }
  window.dispatchEvent(new CustomEvent('storage'));
}
