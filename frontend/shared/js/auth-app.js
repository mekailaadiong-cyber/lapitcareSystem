import { api } from "./api.js";
import { clearSession, setSession } from "./session.js";
import { setupPassword } from "./ui.js";
import {
  email as validateEmail,
  mobile as validateMobile,
} from "./validators.js";
import { appPath } from "./config.js";
export { initClinicRegister } from "./clinic-registration.js";

const logo = `<a class="logo" href="${appPath("/index.html")}"><span class="logo-mark"></span>LapitCare</a>`;
const verificationKey = "lapitcare_pending_email_verification";
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );

function wrap(content, role = "patient", pageClass = "") {
  document.body.innerHTML = `<main class="auth-page ${role === "admin" ? "admin-auth" : ""} ${pageClass}">
    <section class="auth-art">${logo}<div><p class="eyebrow">Care, closer to home</p>
    <h2>${role === "patient" ? "Find the right private clinic with confidence." : role === "clinic" ? "A calmer way to manage your clinic day." : "LapitCare system administration"}</h2>
    <p>${role === "patient" ? "Discover verified clinics in Pagadian and manage appointments in one place." : role === "clinic" ? "Keep services, staff availability, schedules, and requests organized." : "Review clinic registrations and monitor the LapitCare demo."}</p></div>
    <small>Prototype environment Â· Fictional data only</small></section><section class="auth-panel"><div class="auth-form">${content}</div></section></main>`;
  document
    .querySelectorAll('a[href^="/"]')
    .forEach((link) =>
      link.setAttribute("href", appPath(link.getAttribute("href"))),
    );
  setupPassword();
}

function displayError(selector, message) {
  const target = document.querySelector(selector);
  if (target) target.textContent = message;
}

export function initLogin() {
  wrap(`<a class="back-link" href="/index.html">← Back to LapitCare</a>
    <p class="eyebrow">LapitCare access</p><h1>Welcome back</h1>
    <p class="muted">Sign in to continue to your LapitCare account.</p>
    <form id="login-form">
      <div class="field"><label for="email">Email Address or Mobile Number <span class="required-mark" aria-hidden="true">*</span></label>
        <input class="input" id="email" type="text" autocomplete="username" inputmode="email" placeholder="name@example.com or 09171234567" required aria-describedby="identifier-help">
        <small class="field-help" id="identifier-help">Use the email address or Philippine mobile number on your account.</small>
      </div>
      <div class="field password-field"><label for="password">Password <span class="required-mark" aria-hidden="true">*</span></label>
        <input class="input" id="password" type="password" autocomplete="current-password" required>
        <button type="button" data-password-toggle="password">Show</button>
      </div>
      <div class="auth-links"><a href="/auth/patient/forgot-password.html">Forgot Password?</a></div>
      <p class="form-error" id="login-error" role="alert" aria-live="polite"></p>
      <button class="btn btn-primary full-btn" type="submit">Sign In</button>
    </form>
    <section class="demo-access" aria-labelledby="demo-access-title">
      <div class="demo-access-heading"><div><p class="eyebrow">Quick access</p><h2 id="demo-access-title">Explore a demo portal</h2></div><p class="demo-access-note">Use a demo button without filling in the sign-in fields above.</p></div>
      <div class="demo-account-list">
        <article class="demo-account"><div><h3>Patient portal</h3><p>Explore clinic discovery and patient appointments.</p></div><button class="btn demo-login-btn demo-login-patient" type="button" data-demo-role="Patient">Explore as Patient</button></article>
        <article class="demo-account"><div><h3>Clinic portal</h3><p>Preview clinic schedules and appointment management.</p></div><button class="btn demo-login-btn demo-login-clinic" type="button" data-demo-role="Clinic Administrator">Enter Clinic Portal</button></article>
        <article class="demo-account"><div><h3>Admin portal</h3><p>Review the system administration workspace.</p></div><button class="btn demo-login-btn demo-login-admin" type="button" data-demo-role="System Administrator">Access Admin Portal</button></article>
      </div>
    </section>
    <section class="account-creation" aria-label="Create an account">
      <a class="account-choice patient-choice" href="/auth/patient/register.html"><span class="account-choice-icon" aria-hidden="true">✦</span><span class="account-choice-copy"><strong>Your health journey starts here.</strong><span>Create a Patient Account</span></span><span aria-hidden="true">→</span></a>
      <a class="account-choice clinic-choice" href="/auth/clinic/register.html"><span class="account-choice-icon" aria-hidden="true">＋</span><span class="account-choice-copy"><strong>Bring your healthcare services closer to patients.</strong><span>Register Your Clinic</span></span><span aria-hidden="true">→</span></a>
    </section>`,
    "patient",
    "central-login",
  );

  const identifier = document.querySelector("#email");
  const form = document.querySelector("#login-form");
  form.addEventListener("input", () => displayError("#login-error", ""));
  const enterAccount = async (user) => {
    const errorSelector = "#login-error";
    displayError(errorSelector, "");
    if (!user) {
      displayError(errorSelector, "We could not open that demo portal. Please try again.");
      return false;
    }
    if (user.email_verified === false) {
      const message = document.querySelector(errorSelector);
      message.textContent = "Your account needs verification before sign in. Complete the simulated verification: ";
      const link = document.createElement("a");
      link.href = appPath("/auth/patient/verify-email.html");
      link.textContent = "Verify your account";
      message.append(link);
      return false;
    }
    if (user.role === "Clinic Administrator") {
      const clinic = await api.get("clinics", user.clinic_id, "clinic_id");
      if (!clinic) {
        displayError(errorSelector, "No clinic profile is linked to this account.");
        return false;
      }
    }
    if (user.account_status !== "Active") {
      displayError(errorSelector, `This account is ${String(user.account_status || "inactive").toLowerCase()}.`);
      return false;
    }
    if (user.role === "Patient") {
      const patient = (await api.list("patients")).find((item) => item.user_id === user.user_id);
      if (!patient || patient.account_status !== "Active") {
        displayError(errorSelector, "This patient account is not active. Complete verification or contact support.");
        return false;
      }
      setSession({ ...user, patient_id: patient.patient_id });
    } else {
      setSession(user);
    }
    const dashboardByRole = {
      Patient: "/patient/dashboard/dashboard.html",
      "Clinic Administrator": "/clinic/dashboard/dashboard.html",
      "System Administrator": "/admin/dashboard/dashboard.html",
    };
    const dashboard = dashboardByRole[user.role];
    if (!dashboard) {
      clearSession();
      displayError(errorSelector, "This account does not have access to a LapitCare portal.");
      return false;
    }
    location.href = appPath(dashboard);
    return true;
  };
  document.querySelectorAll("[data-demo-role]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      const originalText = button.textContent;
      button.textContent = "Opening portal…";
      displayError("#login-error", "");
      try {
        const user = await api.loginDemo(button.dataset.demoRole);
        const entered = await enterAccount(user);
        if (!entered) {
          button.disabled = false;
          button.textContent = originalText;
        }
      } catch (error) {
        console.error(error);
        displayError("#login-error", "The demo account could not be prepared. Please try again.");
        button.disabled = false;
        button.textContent = originalText;
        return;
      }
    });
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorSelector = "#login-error";
    displayError(errorSelector, "");
    if (!form.reportValidity()) {
      displayError(errorSelector, "Enter your email address or mobile number and password.");
      return;
    }

    const loginId = identifier.value.trim();
    const password = document.querySelector("#password").value;
    if (validateEmail(loginId) && validateMobile(loginId)) {
      displayError(errorSelector, "Enter a valid email address or Philippine mobile number.");
      identifier.focus();
      return;
    }
    try {
      const user = await api.login(loginId, password);
      if (!user) {
        displayError(errorSelector, "Those details do not match a LapitCare account. Check your email or mobile number and password.");
        return;
      }
      await enterAccount(user);
    } catch (error) {
      console.error(error);
      displayError(errorSelector, "Mock sign-in could not be completed. Check your information and try again.");
    }
  });
}
export function initPatientRegister() {
  document.body.innerHTML = `<main class="patient-register-page">
    <header class="patient-register-header"><a class="logo" href="${appPath("/index.html")}"><span class="logo-mark"></span>LapitCare</a><nav aria-label="Account navigation"><a href="${appPath("/index.html")}">Home</a><span>Already registered?</span><a class="register-signin-link" href="${appPath("/auth/patient/login.html")}">Sign In</a></nav></header>
    <section class="patient-register-content"><div class="patient-register-heading"><p class="eyebrow">Patient registration</p><h1>Create Your Patient Account</h1><p>Create an account to discover healthcare providers, explore clinic locations, and manage your appointments in one place.</p><p class="register-required-note">Fields marked <span aria-hidden="true">*</span> are required.</p></div>
      <div class="patient-registration-progress" aria-label="Patient registration progress"><ol>
        <li data-patient-progress="0" aria-current="step"><span>1</span><small>Personal</small></li><li data-patient-progress="1"><span>2</span><small>Contact</small></li><li data-patient-progress="2"><span>3</span><small>Account</small></li><li data-patient-progress="3"><span>4</span><small>Consent</small></li><li data-patient-progress="4"><span>5</span><small>Review</small></li>
      </ol><p id="patient-step-status" aria-live="polite">Step 1 of 5 · Personal information</p></div>
      <div id="register-success" class="register-success" role="status" aria-live="polite" hidden></div>
      <form id="register-form" novalidate>
        <section class="register-section" data-patient-step="0" aria-labelledby="personal-info-title"><div class="register-section-heading"><span>01</span><div><h2 id="personal-info-title">Personal information</h2><p>Tell us what you would like us to call you.</p></div></div><div class="register-fields register-fields-personal">
          <div class="field"><label for="first-name">First Name <span aria-hidden="true">*</span></label><input class="input" id="first-name" name="first_name" autocomplete="given-name" required><small class="register-field-error" id="first-name-error"></small></div>
          <div class="field"><label for="middle-name">Middle Name <span class="field-optional">Optional</span></label><input class="input" id="middle-name" name="middle_name" autocomplete="additional-name"></div>
          <div class="field"><label for="last-name">Last Name <span aria-hidden="true">*</span></label><input class="input" id="last-name" name="last_name" autocomplete="family-name" required><small class="register-field-error" id="last-name-error"></small></div>
          <div class="field"><label for="suffix">Suffix <span class="field-optional">Optional</span></label><input class="input" id="suffix" name="suffix" autocomplete="honorific-suffix" placeholder="Jr., III"></div>
          <div class="field"><label for="preferred-name">Preferred Name <span class="field-optional">Optional</span></label><input class="input" id="preferred-name" name="preferred_name" autocomplete="nickname"></div>
        </div></section>
        <section class="register-section" data-patient-step="1" aria-labelledby="contact-info-title"><div class="register-section-heading"><span>02</span><div><h2 id="contact-info-title">Contact information</h2><p>Use contact details you can access for account sign-in.</p></div></div><div class="register-fields register-fields-two register-contact-fields">
          <div class="field register-email-field"><label for="email">Email Address <span aria-hidden="true">*</span></label><input class="input" id="email" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="254" placeholder="name@example.com" required aria-describedby="email-error"><small class="register-field-error" id="email-error"></small></div>
          <div class="field"><label for="mobile">Mobile Number <span aria-hidden="true">*</span></label><input class="input" id="mobile" name="mobile" type="tel" inputmode="tel" autocomplete="tel" placeholder="0917 123 4567" aria-describedby="mobile-help mobile-error" required><small class="field-help" id="mobile-help">Philippine mobile number, e.g. 09171234567 or +639171234567.</small><small class="register-field-error" id="mobile-error"></small></div>
        </div></section>
        <section class="register-section" data-patient-step="2" hidden aria-labelledby="photo-title"><div class="register-section-heading"><span>03</span><div><h2 id="photo-title">Profile photo <span class="field-optional">Optional</span></h2><p>Choose a JPG, PNG, or WebP image up to 5 MB. It stays in this browser.</p></div></div><div class="register-photo-control"><div class="register-avatar" id="photo-preview" aria-label="Default profile avatar"><span id="photo-initials">LC</span></div><div class="register-photo-actions"><input id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp" hidden><button class="btn btn-secondary" type="button" id="choose-photo">Choose Photo</button><button class="register-text-button" type="button" id="remove-photo" disabled>Remove photo</button><small class="register-field-error" id="photo-error" role="alert"></small><small class="field-help">Prototype image storage is local to this browser; it is not uploaded.</small></div></div></section>
        <section class="register-section" data-patient-step="2" hidden aria-labelledby="security-title"><div class="register-section-heading"><span>04</span><div><h2 id="security-title">Account security</h2><p>Set a password for your LapitCare account.</p></div></div><div class="register-fields register-fields-two">
          <div class="field password-field"><label for="password">Password <span aria-hidden="true">*</span></label><input class="input" id="password" name="password" type="password" autocomplete="new-password" minlength="8" aria-describedby="password-help password-error" required><button type="button" data-password-toggle="password" aria-label="Show password">Show</button><small class="field-help" id="password-help">Use at least 8 characters.</small><small class="register-field-error" id="password-error"></small></div>
          <div class="field password-field"><label for="confirm">Confirm Password <span aria-hidden="true">*</span></label><input class="input" id="confirm" name="confirm_password" type="password" autocomplete="new-password" minlength="8" aria-describedby="confirm-error" required><button type="button" data-password-toggle="confirm" aria-label="Show confirmation password">Show</button><small class="register-field-error" id="confirm-error"></small></div>
        </div></section>
        <section class="register-consent-section" data-patient-step="3" hidden aria-labelledby="privacy-title"><h2 id="privacy-title">Privacy and consent</h2><p>Your information is used to manage your LapitCare account, clinic discovery, and appointment features. No residential address or medical history is collected here.</p>
          <label class="register-check"><input id="terms-consent" type="checkbox" required><span>I accept the <a href="${appPath("/auth/patient/terms.html")}" target="_blank" rel="noopener">Terms and Conditions</a>. <b>*</b></span></label>
          <label class="register-check"><input id="privacy-consent" type="checkbox" required><span>I acknowledge the <a href="${appPath("/auth/patient/privacy.html")}" target="_blank" rel="noopener">Privacy Policy</a>. <b>*</b></span></label>
          <label class="register-check"><input id="accuracy-consent" type="checkbox" required><span>I confirm that the information provided is accurate. <b>*</b></span></label>
          <small class="register-field-error" id="consent-error" role="alert"></small>
        </section>
        <section class="register-review-section" data-patient-step="4" hidden aria-labelledby="patient-review-title"><div class="register-section-heading"><span>05</span><div><h2 id="patient-review-title">Review your information</h2><p>Check the details below. Go back to any step to make a change.</p></div></div><div id="patient-review" class="patient-review-summary"></div><p class="register-storage-note">LapitCare is a frontend prototype. Account records are stored in this browser; passwords use the existing demo credential format and are not production-secure. Contact details are not verified.</p></section>
        <p class="form-error register-form-error" id="register-error" role="alert" aria-live="polite"></p><div class="patient-register-step-controls"><button class="btn btn-secondary" id="patient-register-back" type="button" hidden>Back</button><div class="patient-register-next-group"><small class="field-help" id="patient-next-help">You can move between steps while reviewing. Details are checked before account creation.</small><button class="btn btn-primary" id="patient-register-next" type="button" aria-describedby="patient-next-help">Next</button></div><button class="btn btn-primary register-submit" id="patient-register-submit" type="submit" hidden>Create Patient Account</button></div>
      </form><p class="account-prompt">Already have an account? <a href="${appPath("/auth/patient/login.html")}">Sign In</a></p>
    </section></main>`;
  setupPassword();

  const form = document.querySelector("#register-form");
  const photoInput = document.querySelector("#profile-photo");
  const photoPreview = document.querySelector("#photo-preview");
  const removePhoto = document.querySelector("#remove-photo");
  const choosePhoto = document.querySelector("#choose-photo");
  const submitButton = document.querySelector("#patient-register-submit");
  const backButton = document.querySelector("#patient-register-back");
  const nextButton = document.querySelector("#patient-register-next");
  const nextGroup = document.querySelector(".patient-register-next-group");
  const patientSteps = [...form.querySelectorAll("[data-patient-step]")];
  const progressSteps = [...document.querySelectorAll("[data-patient-progress]")];
  const patientStepNames = ["Personal information", "Contact information", "Profile photo and account security", "Privacy and consent", "Review and submit"];
  let selectedPhoto = null;
  let previewUrl = "";
  let isSubmitting = false;
  let currentStep = 0;
  const setFieldError = (id, message) => {
    const error = document.querySelector(`#${id}-error`);
    const input = document.getElementById(id);
    if (error) error.textContent = message;
    if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
  };
  const clearPhotoPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = "";
    photoPreview.style.backgroundImage = "";
    photoPreview.innerHTML = '<span id="photo-initials">LC</span>';
    photoPreview.setAttribute("aria-label", "Default profile avatar");
    choosePhoto.textContent = "Choose Photo";
  };
  const renderPatientReview = () => {
    const value = (id) => document.getElementById(id).value.trim();
    const fullName = [value("first-name"), value("middle-name"), value("last-name"), value("suffix")].filter(Boolean).join(" ");
    const preferredName = value("preferred-name");
    const photoLabel = selectedPhoto ? selectedPhoto.name : "No photo selected";
    document.querySelector("#patient-review").innerHTML = `<div class="patient-review-group"><div class="patient-review-group-heading"><h3>Personal information</h3><button class="register-text-button" type="button" data-edit-patient-step="0">Edit</button></div><dl><div><dt>Full name</dt><dd>${escapeHtml(fullName || "Not provided")}</dd></div><div><dt>Preferred name</dt><dd>${escapeHtml(preferredName || "Not provided")}</dd></div></dl></div><div class="patient-review-group"><div class="patient-review-group-heading"><h3>Contact details</h3><button class="register-text-button" type="button" data-edit-patient-step="1">Edit</button></div><dl><div><dt>Email address</dt><dd>${escapeHtml(value("email") || "Not provided")}</dd></div><div><dt>Mobile number</dt><dd>${escapeHtml(value("mobile") || "Not provided")}</dd></div></dl></div><div class="patient-review-group"><div class="patient-review-group-heading"><h3>Photo and security</h3><button class="register-text-button" type="button" data-edit-patient-step="2">Edit</button></div><dl><div><dt>Profile photo</dt><dd>${escapeHtml(photoLabel)}</dd></div><div><dt>Password</dt><dd>${value("password") ? "Password set" : "Not provided"}</dd></div></dl></div><div class="patient-review-group"><div class="patient-review-group-heading"><h3>Privacy and consent</h3><button class="register-text-button" type="button" data-edit-patient-step="3">Edit</button></div><dl><div><dt>Terms and Conditions</dt><dd>${document.querySelector("#terms-consent").checked ? "Accepted" : "Not accepted"}</dd></div><div><dt>Privacy Policy</dt><dd>${document.querySelector("#privacy-consent").checked ? "Acknowledged" : "Not acknowledged"}</dd></div><div><dt>Information accuracy</dt><dd>${document.querySelector("#accuracy-consent").checked ? "Confirmed" : "Not confirmed"}</dd></div></dl></div>`;
    document.querySelectorAll("[data-edit-patient-step]").forEach((button) => button.addEventListener("click", () => setPatientStep(Number(button.dataset.editPatientStep))));
  };
  const setPatientStep = (step) => {
    const previousStep = currentStep;
    currentStep = Math.max(0, Math.min(patientStepNames.length - 1, step));
    patientSteps.forEach((section) => { section.hidden = Number(section.dataset.patientStep) !== currentStep; });
    if (currentStep !== previousStep) patientSteps.find((section) => Number(section.dataset.patientStep) === currentStep)?.scrollIntoView({ block: "start", behavior: "smooth" });
    progressSteps.forEach((item, index) => {
      item.classList.toggle("is-current", index === currentStep);
      item.classList.toggle("is-complete", index < currentStep);
      if (index === currentStep) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
    document.querySelector("#patient-step-status").textContent = `Step ${currentStep + 1} of ${patientStepNames.length} · ${patientStepNames[currentStep]}`;
    backButton.hidden = currentStep === 0;
    nextGroup.hidden = currentStep === patientStepNames.length - 1;
    submitButton.hidden = currentStep !== patientStepNames.length - 1;
    if (currentStep === patientStepNames.length - 1) renderPatientReview();
    document.querySelector("#register-error").textContent = "";
  };
  const normalizeName = (value) => value.trim().replace(/\s+/g, " ");
  const normalizePatientMobile = (value) => {
    const digits = value.replace(/\D/g, "");
    if (/^639\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
    if (/^09\d{9}$/.test(digits)) return digits;
    return "";
  };
  const validate = () => {
    let valid = true;
    const firstName = normalizeName(document.querySelector("#first-name").value);
    const lastName = normalizeName(document.querySelector("#last-name").value);
    const emailValue = document.querySelector("#email").value.trim().toLowerCase();
    const mobileValue = normalizePatientMobile(document.querySelector("#mobile").value);
    const passwordValue = document.querySelector("#password").value;
    const confirmValue = document.querySelector("#confirm").value;
    for (const [id, value] of [["first-name", firstName], ["last-name", lastName]]) {
      const message = value ? "" : "This field is required.";
      setFieldError(id, message);
      if (message) valid = false;
    }
    const emailError = emailValue ? (validateEmail(emailValue) || "") : "Enter your email address.";
    setFieldError("email", emailError);
    if (emailError) valid = false;
    const mobileError = mobileValue ? "" : "Enter a valid Philippine mobile number, such as 09171234567.";
    setFieldError("mobile", mobileError);
    if (mobileError) valid = false;
    const passwordError = passwordValue.length >= 8 ? "" : "Use a password with at least 8 characters.";
    setFieldError("password", passwordError);
    if (passwordError) valid = false;
    const confirmError = confirmValue && confirmValue === passwordValue ? "" : "Enter the same password in both fields.";
    setFieldError("confirm", confirmError);
    if (confirmError) valid = false;
    const consentValid = ["terms-consent", "privacy-consent", "accuracy-consent"].every((id) => document.getElementById(id).checked);
    document.querySelector("#consent-error").textContent = consentValid ? "" : "Accept the terms, acknowledge the privacy policy, and confirm your information is accurate.";
    document.querySelector("#register-error").textContent = "";
    if (!consentValid) valid = false;
    return { valid, firstName, lastName, email: emailValue, mobileNumber: mobileValue };
  };

  form.addEventListener("input", (event) => {
    if (event.target.matches("input:not([type=checkbox])")) {
      const error = event.target.id && document.querySelector(`#${event.target.id}-error`);
      if (error) error.textContent = "";
      event.target.removeAttribute("aria-invalid");
    }
    document.querySelector("#register-error").textContent = "";
  });
  form.addEventListener("change", (event) => {
    if (["terms-consent", "privacy-consent", "accuracy-consent"].includes(event.target.id)) {
      const consentValid = ["terms-consent", "privacy-consent", "accuracy-consent"].every((id) => document.getElementById(id).checked);
      if (consentValid) document.querySelector("#consent-error").textContent = "";
    }
  });
  nextButton.addEventListener("click", () => setPatientStep(currentStep + 1));
  backButton.addEventListener("click", () => setPatientStep(currentStep - 1));
  choosePhoto.addEventListener("click", () => photoInput.click());
  photoInput.addEventListener("change", () => {
    const file = photoInput.files?.[0];
    document.querySelector("#photo-error").textContent = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      photoInput.value = "";
      selectedPhoto = null;
      removePhoto.disabled = true;
      clearPhotoPreview();
      document.querySelector("#photo-error").textContent = "Choose a JPG, PNG, or WebP image.";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      photoInput.value = "";
      selectedPhoto = null;
      removePhoto.disabled = true;
      clearPhotoPreview();
      document.querySelector("#photo-error").textContent = "The image is larger than 5 MB. Choose a smaller file.";
      return;
    }
    selectedPhoto = file;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    photoPreview.innerHTML = "";
    photoPreview.style.backgroundImage = `url("${previewUrl}")`;
    photoPreview.setAttribute("aria-label", `Selected profile photo: ${escapeHtml(file.name)}`);
    choosePhoto.textContent = "Change Photo";
    removePhoto.disabled = false;
  });
  removePhoto.addEventListener("click", () => {
    selectedPhoto = null;
    photoInput.value = "";
    removePhoto.disabled = true;
    document.querySelector("#photo-error").textContent = "";
    clearPhotoPreview();
  });
  window.addEventListener("beforeunload", () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, { once: true });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (currentStep !== patientStepNames.length - 1) {
      setPatientStep(currentStep + 1);
      return;
    }
    const result = validate();
    if (!result.valid) {
      const invalidId = ["first-name", "last-name", "email", "mobile", "password", "confirm"].find((id) => document.getElementById(id).getAttribute("aria-invalid") === "true");
      const invalidStep = { "first-name": 0, "last-name": 0, email: 1, mobile: 1, password: 2, confirm: 2 }[invalidId];
      setPatientStep(invalidStep ?? 3);
      document.querySelector(invalidId ? `#${invalidId}` : "#terms-consent").focus();
      return;
    }
    isSubmitting = true;
    submitButton.disabled = true;
    submitButton.textContent = "Creating your account…";
    displayError("#register-error", "");
    let photoRef = null;
    let identityConflict = false;
    try {
      const duplicate = await api.accountIdentityInUse(result.email, result.mobileNumber);
      if (duplicate.email || duplicate.mobile) {
        identityConflict = true;
        if (duplicate.email) setFieldError("email", "An account already uses this email address.");
        if (duplicate.mobile) setFieldError("mobile", "An account already uses this mobile number.");
        throw new Error("Review the contact details marked above.");
      }
      const now = new Date().toISOString();
      const id = () => crypto.randomUUID ? crypto.randomUUID().replaceAll("-", "") : `${Date.now()}${Math.random().toString(36).slice(2)}`;
      const userId = `usr_${id()}`;
      const patientId = `pat_${id()}`;
      if (selectedPhoto) {
        photoRef = `patient-photo:${patientId}`;
        try {
          await storePatientPhoto(photoRef, selectedPhoto);
        } catch {
          throw new Error("The selected photo could not be stored in this browser. Remove it or try another image.");
        }
      }
      const middleName = normalizeName(document.querySelector("#middle-name").value);
      const suffix = normalizeName(document.querySelector("#suffix").value);
      const preferredName = normalizeName(document.querySelector("#preferred-name").value);
      const fullName = [result.firstName, middleName, result.lastName, suffix].filter(Boolean).join(" ");
      const user = {
        user_id: userId,
        email: result.email,
        mobile_number: result.mobileNumber,
        role: "Patient",
        name: fullName,
        account_status: "Active",
        created_at: now,
        terms_accepted_at: now,
        privacy_acknowledged_at: now,
      };
      const patient = {
        patient_id: patientId,
        user_id: userId,
        name: fullName,
        first_name: result.firstName,
        middle_name: middleName || null,
        last_name: result.lastName,
        suffix: suffix || null,
        preferred_name: preferredName || null,
        email: result.email,
        mobile_number: result.mobileNumber,
        profile_photo_ref: photoRef,
        account_status: "Active",
        information_confirmed_at: now,
        created_at: now,
      };
      await api.registerPatientAccount(
        patient,
        user,
        document.querySelector("#password").value,
      );
      form.hidden = true;
      document.querySelector(".account-prompt").hidden = true;
      const displayName = preferredName || result.firstName;
      const success = document.querySelector("#register-success");
      success.hidden = false;
      success.innerHTML = `<div class="register-success-icon" aria-hidden="true">✓</div><p class="eyebrow">Patient account created</p><h2>Welcome to LapitCare!</h2><p>Your account is ready, ${escapeHtml(displayName)}. No contact details have been verified in this prototype. Sign in with your email or mobile number and password to open your Patient Dashboard.</p><a class="btn btn-primary" href="${appPath("/auth/patient/login.html")}">Continue to Sign In</a><a class="register-success-home" href="${appPath("/index.html")}">Back to home</a>`;
      success.scrollIntoView({ block: "start", behavior: "smooth" });
    } catch (error) {
      if (photoRef) await removePatientPhoto(photoRef).catch(() => {});
      if (identityConflict) setPatientStep(1);
      else if (photoRef) setPatientStep(2);
      displayError("#register-error", error.message === "Review the contact details marked above." ? error.message : error.message || "Account creation failed. Please try again.");
      submitButton.disabled = false;
      submitButton.textContent = "Create Patient Account";
      isSubmitting = false;
    }
  });
  setPatientStep(0);
}

const patientPhotoDatabase = "lapitcare-local-media";
function openPatientPhotoDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("Browser image storage is unavailable."));
    const request = indexedDB.open(patientPhotoDatabase, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("patient-photos", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Browser image storage could not be opened."));
  });
}
async function storePatientPhoto(id, file) {
  const database = await openPatientPhotoDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("patient-photos", "readwrite");
    transaction.objectStore("patient-photos").put({ id, blob: file, type: file.type, saved_at: new Date().toISOString() });
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error("The profile photo could not be stored in this browser.")); };
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error("The profile photo could not be stored in this browser.")); };
  });
}
async function removePatientPhoto(id) {
  const database = await openPatientPhotoDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("patient-photos", "readwrite");
    transaction.objectStore("patient-photos").delete(id);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
    transaction.onabort = () => { database.close(); reject(transaction.error); };
  });
}

export function initMessage(kind) {
  if (kind === "verify") {
    let pending;
    try {
      pending = JSON.parse(localStorage.getItem(verificationKey) || "null");
    } catch (error) {
      console.error(error);
    }
    wrap(`<div class="message-icon">âœ‰</div><p class="eyebrow">Email verification</p><h1>${pending ? "Verify your email" : "No pending verification"}</h1>
      <p class="muted">${pending ? `Your account was created successfully for ${pending.email}. Verification is required before you can sign in. This demo does not send email; use the button below to simulate verification on this browser.` : "Register a patient account to begin email verification."}</p>
      ${pending ? '<button class="btn btn-primary full-btn" id="verify-account">Verify email address</button>' : ""}
      <a class="btn btn-secondary full-btn" href="/auth/patient/login.html">Continue to login</a>`);
    document
      .querySelector("#verify-account")
      ?.addEventListener("click", async () => {
        try {
          const user = await api.get("users", pending.user_id, "user_id");
          const patient = await api.get(
            "patients",
            pending.patient_id,
            "patient_id",
          );
          if (!user || !patient)
            throw new Error(
              "The account awaiting verification could not be found.",
            );
          await api.update(
            "users",
            user.user_id,
            { email_verified: true, account_status: "Active" },
            "user_id",
          );
          await api.update(
            "patients",
            patient.patient_id,
            { email_verified: true, account_status: "Active" },
            "patient_id",
          );
          localStorage.removeItem(verificationKey);
          wrap(
            '<div class="message-icon">âœ“</div><p class="eyebrow">Email verified</p><h1>Your account is active</h1><p class="muted">You can now sign in to LapitCare.</p><a class="btn btn-primary full-btn" href="/auth/patient/login.html">Go to patient login</a>',
          );
        } catch (error) {
          console.error(error);
          displayError(
            "#verify-account",
            "Verification failed. Please try again.",
          );
        }
      });
    return;
  }
  if (kind === "forgot") {
    wrap(`<a class="back-link" href="/auth/patient/login.html">← Back to sign in</a><p class="eyebrow">Account recovery</p><h1>Reset your password</h1>
      <p class="muted">Enter the email address or mobile number associated with your account.</p><form id="forgot-form"><div class="field"><label for="reset-email">Email address or mobile number</label><input class="input" id="reset-email" autocomplete="username" placeholder="name@example.com or 09171234567" required></div>
      <p class="form-error" id="forgot-message" role="status"></p><button class="btn btn-primary full-btn">Request reset link</button></form>`);
    document
      .querySelector("#forgot-form")
      .addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
          const requested = await api.beginPasswordReset(
            document.querySelector("#reset-email").value.trim(),
          );
          const message = document.querySelector("#forgot-message");
          message.textContent = requested
            ? "This local demo cannot send email. Continue on this browser to choose a new password: "
            : "If an account matches that email, a local reset can be completed in this browser.";
          if (requested) {
            const link = document.createElement("a");
            link.href = appPath("/auth/reset-password/reset-password.html");
            link.textContent = "Choose a new password";
            message.append(link);
          }
        } catch (error) {
          console.error(error);
          displayError(
            "#forgot-message",
            `The reset request could not be sent: ${error.message}`,
          );
        }
      });
    return;
  }
  if (kind === "reset-password") {
    wrap(`<p class="eyebrow">Account recovery</p><h1>Choose a new password</h1><p class="muted">Use at least 8 characters.</p>
      <form id="new-password-form"><div class="field"><label for="new-password">New password</label><input class="input" id="new-password" type="password" minlength="8" required></div>
      <div class="field"><label for="confirm-password">Confirm new password</label><input class="input" id="confirm-password" type="password" minlength="8" required></div>
      <p class="form-error" id="reset-error" role="alert"></p><button class="btn btn-primary full-btn">Update password</button></form>`);
    document
      .querySelector("#new-password-form")
      .addEventListener("submit", async (event) => {
        event.preventDefault();
        const password = document.querySelector("#new-password").value;
        if (password !== document.querySelector("#confirm-password").value) {
          displayError("#reset-error", "Passwords do not match.");
          return;
        }
        try {
          await api.updatePassword(password);
          clearSession();
          wrap(
            '<div class="message-icon">âœ“</div><h1>Password updated</h1><p class="muted">Your local demo password was updated on this browser.</p><a class="btn btn-primary full-btn" href="/index.html">Return to LapitCare</a>',
          );
        } catch (error) {
          console.error(error);
          displayError(
            "#reset-error",
            `Password could not be updated: ${error.message}`,
          );
        }
      });
    return;
  }
  const data = {
    pending: [
      "Registration submitted",
      "Your clinic registration is pending administrator approval. Sign in after it has been approved.",
      "Return to clinic login",
      "/auth/clinic/login.html",
    ],
  }[kind];
  wrap(
    `<div class="message-icon">âœ“</div><p class="eyebrow">LapitCare account</p><h1>${data[0]}</h1><p class="muted">${data[1]}</p><a class="btn btn-primary full-btn" href="${data[3]}">${data[2]}</a>`,
    "clinic",
  );
}
