import { api } from "/shared/js/api.js";
import { getSession } from "/shared/js/session.js";
import { appPath } from "/shared/js/config.js";

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);

async function renderConfirmation() {
  const session = getSession();
  if (!session?.clinic_id) {
    location.replace(appPath("/auth/patient/login.html"));
    return;
  }

  const [clinic, account] = await Promise.all([
    api.get("clinics", session.clinic_id, "clinic_id"),
    api.get("users", session.user_id, "user_id"),
  ]);
  if (!clinic) {
    location.replace(appPath("/auth/patient/login.html"));
    return;
  }

  const submittedDate = clinic.registration_submitted_at
    ? new Intl.DateTimeFormat("en-PH", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "Asia/Manila",
      }).format(new Date(clinic.registration_submitted_at))
    : "Just now";

  document.body.innerHTML = `
    <main class="registration-confirmation-page">
      <section class="card registration-confirmation-card" aria-labelledby="confirmation-title">
        <a class="logo" href="${appPath("/index.html")}"><span class="logo-mark"></span>LapitCare</a>
        <div class="confirmation-mark" aria-hidden="true">&#10003;</div>
        <p class="eyebrow">Clinic registration received</p>
        <h1 id="confirmation-title">${escapeHtml(clinic.clinic_name)}</h1>
        <p class="confirmation-status"><span class="badge status-pending">Pending Review</span></p>
        <p class="confirmation-lead">Your registration was submitted successfully and saved in this browser.</p>
        <dl class="confirmation-details">
          <div><dt>Submitted</dt><dd>${escapeHtml(submittedDate)}</dd></div>
          <div><dt>Clinic reference</dt><dd>${escapeHtml(clinic.clinic_id)}</dd></div>
          <div><dt>Authorized representative</dt><dd>${escapeHtml(session.name || "Authorized representative")}</dd></div>
          <div><dt>Sign-in email</dt><dd>${escapeHtml(account?.email || "Not available")}</dd></div>
          <div><dt>Clinic contact</dt><dd>${escapeHtml(clinic.email || "Not provided")}<br>${escapeHtml(clinic.contact_number || "")}</dd></div>
          <div><dt>Clinic location</dt><dd>${escapeHtml(clinic.address || "Not provided")}</dd></div>
        </dl>
        <div class="confirmation-next">
          <h2>What happens next</h2>
          <p>Your clinic is marked <strong>Pending Review</strong>. Use the representative account details for future sign-ins and check the status and clinic profile from the dashboard. Approval-dependent tools stay unavailable while review is pending.</p>
          <p>This is a frontend demo: review is simulated, and uploaded documents are stored in this browser and have not been verified.</p>
        </div>
        <a class="btn btn-primary" href="${appPath("/clinic/dashboard/dashboard.html")}">Return to Clinic Dashboard</a>
      </section>
    </main>`;
}

renderConfirmation().catch((error) => {
  console.error("Could not load clinic registration confirmation.", error);
  document.body.innerHTML = `<main class="registration-confirmation-page"><section class="card registration-confirmation-card"><div class="confirmation-mark" aria-hidden="true">&#10003;</div><p class="eyebrow">Clinic registration received</p><h1>Registration submitted</h1><p>Your registration was submitted successfully, but the confirmation details could not be loaded. You can continue to your clinic dashboard to view its status.</p><a class="btn btn-primary" href="${appPath("/clinic/dashboard/dashboard.html")}">Return to Clinic Dashboard</a></section></main>`;
});
