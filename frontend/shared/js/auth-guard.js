import {
  getSession,
  isExpired,
  clearSession,
  touchSession,
} from "./session.js";
import { appPath } from "./config.js";
const loginPaths = {
  Patient: appPath("/auth/patient/login.html"),
  "Clinic Administrator": appPath("/auth/patient/login.html"),
  "System Administrator": appPath("/auth/patient/login.html"),
};
export function guard(expectedRole) {
  const s = getSession(),
    loginPath = loginPaths[expectedRole];
  if (!s || s.role !== expectedRole) {
    document.body.innerHTML = `<main class="auth-panel"><div class="card"><h1>Access restricted</h1><p>Sign in with the correct account role to open this workspace.</p><a class="btn btn-teal" href="${loginPath}">Continue to sign in</a></div></main>`;
    return null;
  }
  if (isExpired(s)) {
    clearSession();
    document.body.innerHTML = `<main class="auth-panel"><div class="card"><h1>Session expired</h1><p>For your security, please sign in again.</p><a class="btn btn-teal" href="${loginPath}">Return to sign in</a></div></main>`;
    return null;
  }
  ["click", "keydown"].forEach((e) =>
    document.addEventListener(e, touchSession, { passive: true }),
  );
  return s;
}
