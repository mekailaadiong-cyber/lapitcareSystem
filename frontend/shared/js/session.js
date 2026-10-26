import { config } from "./config.js";
const key = `${config.storage_prefix}session`;
export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}
export function setSession(user) {
  localStorage.setItem(
    key,
    JSON.stringify({
      user_id: user.user_id,
      role: user.role,
      clinic_id: user.clinic_id || null,
      patient_id: user.patient_id || null,
      demo_appointment_access: user.demo_appointment_access === true,
      name: user.name,
      last_active: Date.now(),
    }),
  );
}
export function touchSession() {
  const s = getSession();
  if (s) {
    s.last_active = Date.now();
    localStorage.setItem(key, JSON.stringify(s));
  }
}
export function clearSession() {
  localStorage.removeItem(key);
  fetch(`${config.api_base}?action=logout`, {
    method: "POST",
    keepalive: true,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }).catch((error) => console.error("Unable to close the server session.", error));
}
export function isExpired(s) {
  return !s || Date.now() - s.last_active > config.session_timeout_ms;
}
