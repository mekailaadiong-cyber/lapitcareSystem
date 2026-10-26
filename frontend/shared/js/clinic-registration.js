import { api } from "./api.js";
import { setSession } from "./session.js";
import { setupPassword } from "./ui.js";
import { loadLeaflet } from "./map.js";
import { appPath } from "./config.js";

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function showError(message) {
  const error = document.querySelector("#register-error");
  error.textContent = message;
  error.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function clearError() {
  document.querySelector("#register-error").textContent = "";
}

function renderPage() {
  const specialtiesPromise = api.list("specialties");
  document.body.innerHTML = `<main class="auth-page clinic-registration-page">
    <section class="auth-art"><a class="logo" href="${appPath("/index.html")}"><span class="logo-mark"></span>LapitCare</a>
      <div><p class="eyebrow">Care, closer to home</p><h2>Bring your clinic closer to the community.</h2>
      <p>Share your services, set up your clinic account, and submit your details for a simulated LapitCare review.</p></div>
      <small>Frontend demo · Registration data stays in this browser</small>
    </section>
    <section class="auth-panel"><div class="auth-form clinic-registration-form">
      <a class="back-link" href="${appPath("/auth/patient/login.html")}">← Back to sign in</a>
      <p class="eyebrow">Clinic registration</p><h1>Register your clinic</h1>
      <p class="muted">Move through and submit the five steps freely while reviewing. Form validation is temporarily bypassed.</p>
      <div class="registration-progress" aria-label="Clinic registration progress">
        <ol>
          <li data-progress-step="0" aria-current="step"><span>1</span><small>Clinic info</small></li>
          <li data-progress-step="1"><span>2</span><small>Location</small></li>
          <li data-progress-step="2"><span>3</span><small>Contact</small></li>
          <li data-progress-step="3"><span>4</span><small>Representative</small></li>
          <li data-progress-step="4"><span>5</span><small>Review</small></li>
        </ol>
        <p id="step-status" class="muted" aria-live="polite">Step 1 of 5 · Clinic Information</p>
      </div>
      <form id="clinic-register-form" novalidate>
        <section class="registration-step" data-registration-step="0" aria-labelledby="clinic-step-one">
          <h2 id="clinic-step-one">Clinic Information</h2>
          <div class="field"><label for="clinic-name">Clinic name </label><input class="input" id="clinic-name" name="clinic_name" autocomplete="organization" required></div>
          <div class="field"><label for="clinic-type">Clinic type </label><select class="select" id="clinic-type" name="clinic_type" required><option value="">Select clinic type</option><option>Primary care clinic</option><option>Dental clinic</option><option>Diagnostic clinic</option><option>Specialty clinic</option><option>Wellness clinic</option><option>Other private clinic</option></select></div>
          <fieldset class="field specialty-fieldset" aria-describedby="specialty-help"><legend>Specialties </legend><div class="specialty-options" id="specialties-options"></div><label class="specialty-option specialty-other-option" for="specialty-other"><input id="specialty-other" type="checkbox"><span>Other</span></label><div class="field specialty-other-field" id="specialty-other-field" hidden><label for="specialty-other-value">Specify other specialty </label><input class="input" id="specialty-other-value" maxlength="80" placeholder="Enter a specialty"></div><small class="field-help" id="specialty-help">Check all specialties that apply. Select Other to enter another specialty.</small></fieldset>
          <div class="field"><label for="services">Description of services </label><textarea class="textarea" id="services" name="service_description" rows="4" placeholder="Describe the care and services available at your clinic." required></textarea></div>
          <div class="field"><label for="clinic-logo">Clinic logo or image <span class="muted">(optional)</span></label><input class="input" id="clinic-logo" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="logo-help"><small class="field-help" id="logo-help">PNG, JPG, or WebP up to 512 KB. The image is stored in this browser.</small><div id="logo-preview" class="registration-file-preview" hidden></div></div>
        </section>

        <section class="registration-step" data-registration-step="1" aria-labelledby="clinic-step-two" hidden>
          <h2 id="clinic-step-two">Clinic Location</h2>
          <div class="field"><label for="street-address">Street / building address </label><input class="input" id="street-address" name="street_address" autocomplete="street-address" required></div>
          <div class="grid grid-2">
            <div class="field"><label for="province">Province </label><select class="select" id="province" name="province" required><option value="">Loading locations…</option></select></div>
            <div class="field"><label for="city">City / Municipality </label><select class="select" id="city" name="city" required disabled><option value="">Select a province first</option></select></div>
            <div class="field"><label for="barangay">Barangay </label><select class="select" id="barangay" name="barangay" required disabled><option value="">Select a city / municipality first</option></select></div>
            <div class="field"><label for="postal-code">Postal code <span class="muted">(optional)</span></label><input class="input" id="postal-code" name="postal_code" inputmode="numeric" pattern="[0-9]{4}" title="Enter a four-digit postal code."></div>
          </div>
          <small class="field-help" id="location-help">Select a province, then choose its city or municipality and barangay. Location list based on the Philippine Standard Geographic Code (PSGC).</small>
          <div class="field"><label for="clinic-map">Map pin <span class="muted">(optional)</span></label><div class="registration-map" id="clinic-map" role="application" aria-label="Optional map to place a clinic location pin"></div><small class="field-help" id="map-help">The map pin follows the clinic location you enter. Drag the pin or click the map to adjust it; the street address remains the primary location record.</small></div>
        </section>

        <section class="registration-step" data-registration-step="2" aria-labelledby="clinic-step-three" hidden>
          <h2 id="clinic-step-three">Clinic Contact</h2>
          <div class="field"><label for="clinic-email">Official clinic email </label><input class="input" id="clinic-email" name="clinic_email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="clinic-contact">Clinic mobile / telephone number </label><input class="input" id="clinic-contact" name="clinic_contact" type="tel" autocomplete="tel" placeholder="09171234567" required><small class="field-help">Use a reachable Philippine number.</small></div>
          <div class="field"><label for="website">Website or social media link <span class="muted">(optional)</span></label><input class="input" id="website" name="website_url" type="url" placeholder="https://example.com"></div>
          <fieldset class="operating-schedule-fieldset" aria-describedby="schedule-help"><legend>Weekly operating hours </legend><p class="field-help" id="schedule-help">Choose the days your clinic is open and set each day’s hours. New days start at 9:00 AM–5:00 PM; adjust them as needed.</p><div class="schedule-presets"><button class="btn btn-secondary" id="schedule-weekdays" type="button">Set weekdays</button><button class="btn btn-secondary" id="schedule-everyday" type="button">Set every day</button><button class="btn btn-ghost" id="schedule-clear" type="button">Clear</button></div><div class="operating-schedule" id="operating-schedule"></div></fieldset>
          <div class="field generated-hours-summary"><label for="hours">Generated weekly summary</label><div id="hours-summary-display" aria-live="polite"></div><textarea class="sr-only" id="hours" name="operating_hours" tabindex="-1" readonly required aria-live="polite"></textarea></div>
        </section>

        <section class="registration-step" data-registration-step="3" aria-labelledby="clinic-step-four" hidden>
          <h2 id="clinic-step-four">Authorized Representative & Account Setup</h2>
          <fieldset class="field representative-name-fields"><legend>Authorized representative’s name </legend><div class="grid grid-2"><div class="field"><label for="representative-first-name">First name </label><input class="input" id="representative-first-name" autocomplete="given-name" required></div><div class="field"><label for="representative-middle-name">Middle name <span class="muted">(optional)</span></label><input class="input" id="representative-middle-name" autocomplete="additional-name"></div><div class="field"><label for="representative-last-name">Last name </label><input class="input" id="representative-last-name" autocomplete="family-name" required></div></div></fieldset>
          <div class="field"><label for="representative-position">Position </label><input class="input" id="representative-position" name="representative_position" placeholder="For example: Clinic owner or administrator" required></div>
          <div class="registration-account-note"><strong>Sign-in account details</strong><span>These details belong to the representative’s account and are stored separately from the clinic’s public contact details.</span></div>
          <div class="field"><label for="account-email">Account email </label><input class="input" id="account-email" name="account_email" type="email" autocomplete="username" required></div>
          <div class="field"><label for="account-mobile">Representative’s mobile number </label><input class="input" id="account-mobile" name="account_mobile" type="tel" autocomplete="tel" placeholder="09171234567" required></div>
          <div class="field password-field"><label for="account-password">Password </label><div class="password-input-control"><input class="input" id="account-password" type="password" autocomplete="new-password" minlength="8" aria-describedby="account-password-help" required><button type="button" data-password-toggle="account-password" aria-label="Show password">Show</button></div><small class="field-help" id="account-password-help">Use at least 8 characters.</small></div>
          <div class="field password-field"><label for="confirm-password">Confirm password </label><div class="password-input-control"><input class="input" id="confirm-password" type="password" autocomplete="new-password" minlength="8" required><button type="button" data-password-toggle="confirm-password" aria-label="Show confirmation password">Show</button></div></div>
        </section>

        <section class="registration-step" data-registration-step="4" aria-labelledby="clinic-step-five" hidden>
          <h2 id="clinic-step-five">Review & Submit</h2>
          <p class="muted">Confirm your clinic and account details before submitting.</p>
          <div id="clinic-review" class="clinic-registration-review"></div>
          <section class="registration-extra-section" aria-labelledby="registration-extra-title">
            <h3 id="registration-extra-title">Optional licensing & supporting documents</h3>
            <p class="field-help">These details can help document your clinic’s registration.</p>
            <div class="grid grid-2">
              <div class="field"><label for="license-number">License / registration number <span class="muted">(optional)</span></label><input class="input" id="license-number" autocomplete="off"></div>
              <div class="field"><label for="license-authority">Issuing authority <span class="muted">(optional)</span></label><input class="input" id="license-authority"></div>
              <div class="field"><label for="license-expiry">License expiry date <span class="muted">(optional)</span></label><input class="input" id="license-expiry" type="date"></div>
            </div>
            <div class="field"><label for="registration-documents">Supporting documents <span class="muted">(optional)</span></label><input class="input" id="registration-documents" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" multiple aria-describedby="documents-help"><small class="field-help" id="documents-help">Up to 3 PDF or image files, 256 KB each. Stored in this browser; not verified.</small><div id="document-preview" class="registration-document-list" aria-live="polite"></div></div>
          </section>
          <section class="registration-extra-section" aria-labelledby="registration-declaration-title">
            <h3 id="registration-declaration-title">Declaration & policies</h3>
            <label class="consent"><input id="accuracy-declaration" type="checkbox" required><span>I declare that the information provided is accurate to the best of my knowledge. </span></label>
            <label class="consent"><input id="policy-acknowledgment" type="checkbox" required><span>I have read and agree to the <a href="${appPath("/auth/patient/terms.html")}" target="_blank" rel="noopener">Terms and Conditions</a> and <a href="${appPath("/auth/patient/privacy.html")}" target="_blank" rel="noopener">Privacy Policy</a>. </span></label>
            <p class="field-help">Registration status is simulated in this frontend demo.</p>
          </section>
        </section>
        <p class="form-error" id="register-error" role="alert" aria-live="polite"></p>
        <div class="registration-step-controls"><button class="btn btn-secondary" id="registration-back" type="button" hidden>Back</button><div class="registration-next-group"><small class="field-help" id="next-help">You can move between steps while reviewing. Required fields are checked when you submit.</small><button class="btn btn-primary" id="registration-next" type="button" aria-describedby="next-help">Next</button></div><button class="btn btn-primary" id="registration-submit" type="submit" hidden>Submit Registration</button></div>
      </form>
    </div></section></main>`;
  document.querySelectorAll('a[href^="/"]').forEach((link) =>
    link.setAttribute("href", appPath(link.getAttribute("href"))),
  );
  setupPassword();
  return specialtiesPromise;
}

export async function initClinicRegister() {
  let specialties;
  let localityDirectory;
  let localityAreas;
  try {
    const [allSpecialties, locationResponse] = await Promise.all([
      renderPage(),
      fetch(appPath("/data/philippine-locations.json")),
    ]);
    if (!locationResponse.ok)
      throw new Error("The Philippine location directory could not be loaded.");
    const locationData = await locationResponse.json();
    localityAreas = locationData.areas;
    localityDirectory = Object.fromEntries(
      localityAreas.map((area) => [
        area.name,
        Object.fromEntries(
          area.cities.map((city) => [city.name, city.barangays]),
        ),
      ]),
    );
    specialties = allSpecialties.filter((item) => item.enabled);
  } catch (error) {
    console.error(error);
    document.body.textContent =
      "Clinic registration could not load. Refresh the page or try again later.";
    return;
  }

  const form = document.querySelector("#clinic-register-form");
  const steps = [...form.querySelectorAll("[data-registration-step]")];
  const progressSteps = [...document.querySelectorAll("[data-progress-step]")];
  const backButton = document.querySelector("#registration-back");
  const nextButton = document.querySelector("#registration-next");
  const submitButton = document.querySelector("#registration-submit");
  const provinceSelect = document.querySelector("#province");
  const citySelect = document.querySelector("#city");
  const barangaySelect = document.querySelector("#barangay");
  const specialtiesContainer = document.querySelector("#specialties-options");
  specialtiesContainer.innerHTML = specialties
    .map(
      (specialty, index) =>
        `<label class="specialty-option" for="specialty-${index}"><input class="specialty-checkbox" id="specialty-${index}" type="checkbox" value="${escapeHtml(specialty.specialty_name)}"><span>${escapeHtml(specialty.specialty_name)}</span></label>`,
    )
    .join("");
  const specialtyFieldset = document.querySelector(".specialty-fieldset");
  const syncSpecialtyCard = (checkbox) => {
    checkbox.closest(".specialty-option")?.classList.toggle("is-selected", checkbox.checked);
  };
  specialtyFieldset.querySelectorAll('input[type="checkbox"]').forEach(syncSpecialtyCard);
  specialtyFieldset.addEventListener("change", (event) => {
    if (event.target.matches('input[type="checkbox"]')) syncSpecialtyCard(event.target);
  });

  const setSelectOptions = (select, options, placeholder) => {
    select.innerHTML = `<option value="">${placeholder}</option>${options
      .map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`)
      .join("")}`;
  };
  const provinceAreas = localityAreas.filter(
    (area) => !area.code.startsWith("region:"),
  );
  provinceSelect.innerHTML = `<option value="">Select province</option>${provinceAreas
    .map((area) => `<option value="${escapeHtml(area.name)}">${escapeHtml(area.name)}</option>`)
    .join("")}`;
  provinceSelect.addEventListener("change", () => {
    const cities = Object.keys(localityDirectory[provinceSelect.value] || {});
    setSelectOptions(
      citySelect,
      cities,
      cities.length ? "Select city / municipality" : "Select a province first",
    );
    citySelect.disabled = cities.length === 0;
    setSelectOptions(barangaySelect, [], "Select a city / municipality first");
    barangaySelect.disabled = true;
    clearError();
  });
  citySelect.addEventListener("change", () => {
    const options = localityDirectory[provinceSelect.value]?.[citySelect.value] || [];
    setSelectOptions(
      barangaySelect,
      options,
      options.length ? "Select barangay" : "No barangays available",
    );
    barangaySelect.disabled = options.length === 0;
    clearError();
  });

  let currentStep = 0;
  let clinicPin = null;
  let clinicLogo = "";
  let registrationDocuments = [];
  let isSubmitting = false;
  const value = (selector) => document.querySelector(selector).value.trim();
  const representativeName = () =>
    [
      value("#representative-first-name"),
      value("#representative-middle-name"),
      value("#representative-last-name"),
    ]
      .filter(Boolean)
      .join(" ");
  const selectedSpecialties = () => {
    const selected = [
      ...specialtiesContainer.querySelectorAll(".specialty-checkbox:checked"),
    ].map((checkbox) => checkbox.value);
    if (document.querySelector("#specialty-other").checked) {
      const other = value("#specialty-other-value");
      if (other) selected.push(`Other: ${other}`);
    }
    return selected;
  };

  const weekDays = [
    ["Monday", "Mon"],
    ["Tuesday", "Tue"],
    ["Wednesday", "Wed"],
    ["Thursday", "Thu"],
    ["Friday", "Fri"],
    ["Saturday", "Sat"],
    ["Sunday", "Sun"],
  ];
  const formatClockTime = (time) => {
    const [rawHours, minutes] = time.split(":").map(Number);
    const suffix = rawHours >= 12 ? "PM" : "AM";
    return `${rawHours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
  };
  const timeOptions = (selected) => Array.from({ length: 96 }, (_, index) => {
    const totalMinutes = index * 15;
    const value = `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
    return `<option value="${value}" ${value === selected ? "selected" : ""}>${formatClockTime(value)}</option>`;
  }).join("");
  const scheduleContainer = document.querySelector("#operating-schedule");
  scheduleContainer.innerHTML = weekDays
    .map(
      ([day]) => `<div class="operating-day" data-operating-day="${day}">
        <label class="operating-day-toggle"><input type="checkbox" data-day-open><span>${day}</span></label>
        <span class="operating-day-closed" data-closed-label>Closed</span>
        <div class="operating-day-times" data-day-times hidden>
          <label><span class="sr-only">${day} opening time</span><select class="select" data-day-start disabled>${timeOptions("09:00")}</select></label>
          <span aria-hidden="true">to</span>
          <label><span class="sr-only">${day} closing time</span><select class="select" data-day-end disabled>${timeOptions("17:00")}</select></label>
        </div>
      </div>`,
    )
    .join("");
  const renderHoursCards = () =>
    `<div class="review-hours" aria-label="Weekly operating hours">${weekDays
      .map(([day]) => {
        const row = scheduleContainer.querySelector(`[data-operating-day="${day}"]`);
        const isOpen = row.querySelector("[data-day-open]").checked;
        const start = row.querySelector("[data-day-start]").value;
        const end = row.querySelector("[data-day-end]").value;
        const hours = !isOpen
          ? "Closed"
          : start && end
            ? `${formatClockTime(start)} – ${formatClockTime(end)}`
            : "Set hours";
        return `<div class="review-hours-day${isOpen ? " is-open" : ""}"><span>${escapeHtml(day)}</span><strong>${escapeHtml(hours)}</strong></div>`;
      })
      .join("")}</div>`;
  const updateHoursSummary = () => {
    const summary = weekDays.map(([day, shortDay]) => {
      const row = scheduleContainer.querySelector(`[data-operating-day="${day}"]`);
      if (!row.querySelector("[data-day-open]").checked)
        return `${shortDay}: Closed`;
      const start = row.querySelector("[data-day-start]").value;
      const end = row.querySelector("[data-day-end]").value;
      return start && end
        ? `${shortDay}: ${formatClockTime(start)}–${formatClockTime(end)}`
        : `${shortDay}: Set hours`;
    });
    document.querySelector("#hours").value = summary.join("; ");
    document.querySelector("#hours-summary-display").innerHTML = renderHoursCards();
  };
  const setDayOpen = (row, open) => {
    row.querySelector("[data-day-open]").checked = open;
    row.classList.toggle("is-open", open);
    row.querySelector("[data-closed-label]").hidden = open;
    row.querySelector("[data-day-times]").hidden = !open;
    row.querySelectorAll("[data-day-start], [data-day-end]").forEach((input) => {
      input.disabled = !open;
      input.required = open;
    });
  };
  scheduleContainer.querySelectorAll("[data-operating-day]").forEach((row) => {
    const toggle = row.querySelector("[data-day-open]");
    toggle.addEventListener("change", () => {
      setDayOpen(row, toggle.checked);
      updateHoursSummary();
      clearError();
    });
    row.querySelectorAll("[data-day-start], [data-day-end]").forEach((input) =>
      input.addEventListener("input", () => {
        updateHoursSummary();
        clearError();
      }),
    );
  });
  const setScheduleDays = (selectedDays) => {
    scheduleContainer.querySelectorAll("[data-operating-day]").forEach((row) =>
      setDayOpen(row, selectedDays.includes(row.dataset.operatingDay)),
    );
    updateHoursSummary();
    clearError();
    syncNextButton();
  };
  document
    .querySelector("#schedule-weekdays")
    .addEventListener("click", () =>
      setScheduleDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]),
    );
  document
    .querySelector("#schedule-everyday")
    .addEventListener("click", () =>
      setScheduleDays(weekDays.map(([day]) => day)),
    );
  document
    .querySelector("#schedule-clear")
    .addEventListener("click", () => setScheduleDays([]));
  updateHoursSummary();

  document
    .querySelector("#specialty-other")
    .addEventListener("change", (event) => {
      const otherField = document.querySelector("#specialty-other-field");
      const otherValue = document.querySelector("#specialty-other-value");
      otherField.hidden = !event.currentTarget.checked;
      otherValue.required = event.currentTarget.checked;
      if (!event.currentTarget.checked) otherValue.value = "";
      clearError();
    });

  const setStep = (step) => {
    currentStep = step;
    steps.forEach((section, index) => {
      section.hidden = index !== step;
      if (index === step) section.scrollIntoView({ block: "start" });
    });
    if (step === 1 && clinicMap) {
      requestAnimationFrame(() => {
        clinicMap.invalidateSize({ pan: false });
        setTimeout(() => clinicMap?.invalidateSize({ pan: false }), 150);
      });
    }
    progressSteps.forEach((item, index) => {
      item.classList.toggle("is-current", index === step);
      item.classList.toggle("is-complete", index < step);
      if (index === step) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
    document.querySelector("#step-status").textContent =
      `Step ${step + 1} of 5 · ${["Clinic Information", "Clinic Location", "Clinic Contact", "Authorized Representative", "Review & Submit"][step]}`;
    backButton.hidden = step === 0;
    nextButton.hidden = step === steps.length - 1;
    submitButton.hidden = step !== steps.length - 1;
    clearError();
    if (step === 4) renderReview();
    syncNextButton();
  };

  const renderReview = () => {
    const displayValue = (selector, fallback = "Not provided") => value(selector) || fallback;
    const renderGroup = (title, rows, extra = "") => `
      <section class="review-group">
        <h3 class="review-group-title">${escapeHtml(title)}</h3>
        <dl class="review-list">${rows
          .map(
            ([label, text]) =>
              `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(text || "Not provided").replaceAll("\n", "<br>")}</dd></div>`,
          )
          .join("")}</dl>
        ${extra}
      </section>`;
    const logo = clinicLogo
      ? `<img class="clinic-logo-review" src="${clinicLogo}" alt="Selected clinic logo preview">`
      : "";
    const groups = [
      renderGroup("Clinic information", [
        ["Clinic name", displayValue("#clinic-name")],
        ["Clinic type", displayValue("#clinic-type")],
        ["Specialties", selectedSpecialties().join(", ")],
        ["Services", displayValue("#services")],
      ], logo),
      renderGroup("Location", [
        ["Street / building address", displayValue("#street-address")],
        ["Barangay", displayValue("#barangay")],
        ["City / Municipality", displayValue("#city")],
        ["Province", displayValue("#province")],
        ["Postal code", displayValue("#postal-code")],
      ]),
      renderGroup("Public contact", [
        ["Official clinic email", displayValue("#clinic-email")],
        ["Clinic mobile / telephone", displayValue("#clinic-contact")],
        ["Website / social media", displayValue("#website")],
      ], `<div class="review-hours-section"><h4>Weekly operating hours</h4>${renderHoursCards()}</div>`),
      renderGroup("Authorized representative & account", [
        ["Representative", representativeName() || "Not provided"],
        ["Position", displayValue("#representative-position")],
        ["Account email", displayValue("#account-email")],
        ["Representative mobile", displayValue("#account-mobile")],
      ]),
    ];
    document.querySelector("#clinic-review").innerHTML = `<div class="review-groups">${groups.join("")}</div>`;
  };

  const syncNextButton = () => {
    nextButton.disabled = false;
    nextButton.title = "Continue to the next step";
  };

  const displayDocuments = () => {
    document.querySelector("#document-preview").innerHTML =
      registrationDocuments.length
        ? registrationDocuments
            .map(
              (file) =>
                `<p>${escapeHtml(file.name)} <span class="muted">· ${Math.ceil(file.size / 1024)} KB · Not verified</span></p>`,
            )
            .join("")
        : '<p class="muted">No supporting documents selected.</p>';
  };

  document.querySelector("#clinic-logo").addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    const preview = document.querySelector("#logo-preview");
    if (!file) {
      clinicLogo = "";
      preview.hidden = true;
      preview.replaceChildren();
      return;
    }
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 512 * 1024) {
      event.currentTarget.value = "";
      clinicLogo = "";
      preview.hidden = true;
      showError("Choose a PNG, JPG, or WebP logo no larger than 512 KB.");
      return;
    }
    try {
      clinicLogo = await readFile(file);
      preview.innerHTML = `<img src="${clinicLogo}" alt="Selected clinic logo preview"><span>${escapeHtml(file.name)}</span>`;
      preview.hidden = false;
      clearError();
    } catch {
      showError("The selected clinic image could not be previewed.");
    }
  });

  document
    .querySelector("#registration-documents")
    .addEventListener("change", async (event) => {
      const files = [...(event.currentTarget.files || [])];
      const acceptedTypes = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
      if (
        files.length > 3 ||
        files.some((file) => !acceptedTypes.includes(file.type) || file.size > 256 * 1024)
      ) {
        event.currentTarget.value = "";
        registrationDocuments = [];
        displayDocuments();
        showError("Choose up to 3 PDF or image files, each no larger than 256 KB.");
        return;
      }
      try {
        registrationDocuments = await Promise.all(
          files.map(async (file) => ({
            name: file.name,
            type: file.type,
            size: file.size,
            data_url: await readFile(file),
            verification_status: "Not verified",
          })),
        );
        displayDocuments();
        clearError();
      } catch {
        event.currentTarget.value = "";
        registrationDocuments = [];
        displayDocuments();
        showError("One or more supporting files could not be read.");
      }
    });

  const updateStepProgress = () => {
    clearError();
  };
  form.addEventListener("input", updateStepProgress);
  form.addEventListener("change", updateStepProgress);
  nextButton.addEventListener("click", () => {
    setStep(currentStep + 1);
  });
  backButton.addEventListener("click", () => setStep(currentStep - 1));

  const mapHelp = document.querySelector("#map-help");
  let clinicMap = null;
  let clinicMarker = null;
  let placeClinicPin = null;
  let geocodeTimer = null;
  let geocodeController = null;
  let locationRequestId = 0;
  const selectedClinicLocation = () =>
    [
      value("#street-address"),
      value("#barangay"),
      value("#city"),
      value("#province"),
      "Philippines",
    ]
      .filter(Boolean)
      .join(", ");
  const queueClinicLocationLookup = () => {
    clearTimeout(geocodeTimer);
    geocodeController?.abort();
    const requestId = ++locationRequestId;
    if (!clinicMap || !value("#city") || !value("#province")) {
      if (clinicMap && (!value("#city") || !value("#province"))) {
        clinicPin = null;
        clinicMarker?.remove();
        clinicMarker = null;
        clinicMap.setView([12.5, 122], 6, { animate: false });
      }
      mapHelp.textContent = "Choose a city and province to locate the clinic, or place the pin manually.";
      return;
    }
    mapHelp.textContent = "Finding the selected clinic location…";
    geocodeTimer = setTimeout(async () => {
      const controller = new AbortController();
      geocodeController = controller;
      try {
        const query = new URLSearchParams({
          q: selectedClinicLocation(),
          format: "jsonv2",
          limit: "1",
          countrycodes: "ph",
        });
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?${query}`,
          { signal: controller.signal, headers: { Accept: "application/json" } },
        );
        if (!response.ok) throw new Error("Location lookup is unavailable.");
        const results = await response.json();
        if (controller.signal.aborted || requestId !== locationRequestId) return;
        if (!results.length) {
          mapHelp.textContent = "Location not found automatically. Click the map or drag the pin to set it manually.";
          return;
        }
        const latitude = Number(results[0].lat);
        const longitude = Number(results[0].lon);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
          throw new Error("Location lookup returned an invalid point.");
        if (!placeClinicPin?.(latitude, longitude, { zoom: 16, automatic: true }))
          throw new Error("The location service returned a point outside the Philippines.");
        mapHelp.textContent = `Map centered on ${value("#barangay") ? `${value("#barangay")}, ` : ""}${value("#city")}, ${value("#province")}. Drag the pin to adjust its position.`;
      } catch (error) {
        if (error.name === "AbortError") return;
        console.warn("Clinic location lookup failed.", error);
        mapHelp.textContent = "Could not locate this address automatically. Move the map pin to the clinic location.";
      }
    }, 1100);
  };
  ["#street-address", "#province", "#city", "#barangay"].forEach((selector) => {
    document.querySelector(selector).addEventListener(
      selector === "#street-address" ? "input" : "change",
      queueClinicLocationLookup,
    );
  });
  loadLeaflet()
    .then((leaflet) => {
      const map = (clinicMap = leaflet.map("clinic-map").setView([12.5, 122], 6));
      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(map);
      placeClinicPin = (latitude, longitude, options = {}) => {
        if (latitude < 4.5 || latitude > 21.5 || longitude < 116 || longitude > 127.5) {
          clinicPin = null;
          mapHelp.textContent = "Choose a point within the Philippines or leave the optional map pin blank.";
          return false;
        }
        clinicPin = { latitude, longitude };
        if (!clinicMarker) {
          clinicMarker = leaflet
            .marker([latitude, longitude], { draggable: true })
            .addTo(map);
          clinicMarker.on("dragstart", () => {
            clearTimeout(geocodeTimer);
            geocodeController?.abort();
            locationRequestId += 1;
          });
          clinicMarker.on("dragend", (event) => {
            const point = event.target.getLatLng();
            setManualPin(point.lat, point.lng);
          });
        } else {
          clinicMarker.setLatLng([latitude, longitude]);
        }
        if (options.zoom) map.setView([latitude, longitude], options.zoom, { animate: false });
        else map.panTo([latitude, longitude]);
        if (!options.automatic)
          mapHelp.textContent = `Map pin: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}. Drag the pin or click the map to adjust it.`;
        return true;
      };
      const setManualPin = (latitude, longitude) => {
        clearTimeout(geocodeTimer);
        geocodeController?.abort();
        locationRequestId += 1;
        placeClinicPin(latitude, longitude);
      };
      map.on("click", (event) => setManualPin(event.latlng.lat, event.latlng.lng));
      clinicMap.on("resize", () => clinicMap.invalidateSize({ pan: false }));
      if (typeof ResizeObserver !== "undefined") {
        const mapResizeObserver = new ResizeObserver(() => {
          if (!steps[1].hidden) clinicMap.invalidateSize({ pan: false });
        });
        mapResizeObserver.observe(document.querySelector("#clinic-map"));
      }
      if (value("#city") && value("#province")) queueClinicLocationLookup();
      requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    })
    .catch(() => {
      mapHelp.textContent = "The optional map is unavailable. You can continue using the street address above.";
    });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    // Required-field and format validation stay bypassed during the design review.
    isSubmitting = true;
    submitButton.disabled = true;
    submitButton.textContent = "Saving registration…";

    const accountEmail = value("#account-email").toLowerCase();
    const accountMobile = value("#account-mobile");
    const clinicEmail = value("#clinic-email").toLowerCase();
    const clinicMobile = value("#clinic-contact");
    const clinicId = `cln_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const userId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const clinicName = value("#clinic-name");
    const streetAddress = value("#street-address");
    const barangay = value("#barangay");
    const city = value("#city");
    const province = value("#province");
    const clinic = {
      clinic_id: clinicId,
      clinic_name: clinicName,
      clinic_type: value("#clinic-type"),
      service_description: value("#services"),
      representative_name: representativeName(),
      representative_first_name: value("#representative-first-name"),
      representative_middle_name: value("#representative-middle-name"),
      representative_last_name: value("#representative-last-name"),
      representative_position: value("#representative-position"),
      email: clinicEmail,
      contact_number: clinicMobile,
      address: [streetAddress, barangay, city, province]
        .filter(Boolean)
        .join(", "),
      street_address: streetAddress,
      barangay,
      city,
      province,
      postal_code: value("#postal-code"),
      website_url: value("#website"),
      latitude: clinicPin?.latitude,
      longitude: clinicPin?.longitude,
      specialties: selectedSpecialties(),
      services: value("#services")
        .split(/[\n,;]/)
        .map((service) => service.trim())
        .filter(Boolean),
      operating_hours: value("#hours"),
      profile_photo: clinicLogo || undefined,
      license_number: value("#license-number"),
      license_authority: value("#license-authority"),
      license_expiry: value("#license-expiry"),
      registration_documents: registrationDocuments,
      registration_status: "Pending Review",
      registration_submitted_at: new Date().toISOString(),
      accuracy_confirmed_at: new Date().toISOString(),
      terms_accepted_at: new Date().toISOString(),
      clinic_status: "Closed",
      approval_status: "Pending",
      verified: false,
      queue_count: 0,
      estimated_wait_minutes: 0,
      cancellation_window_hours: 12,
      rating: 0,
    };
    const user = {
      user_id: userId,
      email: accountEmail,
      mobile_number: accountMobile,
      role: "Clinic Administrator",
      name: representativeName(),
      clinic_id: clinicId,
      account_status: "Active",
      email_verified: true,
      created_at: new Date().toISOString(),
    };

    try {
      const registration = await api.registerClinicAccount(
        clinic,
        user,
        value("#account-password"),
      );
      setSession(registration.user);
      location.replace(
        `${appPath("/auth/clinic/registration-submitted.html")}?refresh=${Date.now()}`,
      );
    } catch (error) {
      showError(error.message || "The clinic registration could not be saved. Please try again.");
      isSubmitting = false;
      submitButton.disabled = false;
      submitButton.textContent = "Submit Registration";
    }
  });

  displayDocuments();
  setStep(0);
}
