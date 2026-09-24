// localStorage can throw (private mode, quota, disabled), so every access is guarded.
export const CONVERSATIONS_KEY = "ui-pg-conversations";
export const THEME_KEY = "ui-pg-theme";

export function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is unavailable or full; the app keeps working for this session.
  }
}

export function readText(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeText(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Same as writeJSON.
  }
}
