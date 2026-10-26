import { api } from "./api.js";
import { guard } from "./auth-guard.js";
import { canBook, canLeaveFeedback, canModify } from "./business-rules.js";
import { clearSession, getSession, setSession } from "./session.js";
import { badge, formModal, icon, modal, setupCustomSelects, setupMobileNav, toast } from "./ui.js";
import { startPolling } from "./polling.js";
import { loadLeaflet } from "./map.js";
import { appPath } from "./config.js";
import { renderClinicAdminPage } from "./clinic-admin.js";

const roots = {
  Patient: appPath("/patient/"),
  "Clinic Administrator": appPath("/clinic/"),
  "System Administrator": appPath("/admin/"),
};
const previewMaps = new Map();
const findCareLocationKey = "lapitcare_findcare_location";
const savedClinicKey = (patientId) => `lapitcare_saved_clinics_${patientId}`;
function readSavedClinicIds(patientId) {
  try {
    const saved = JSON.parse(localStorage.getItem(savedClinicKey(patientId)) || "[]");
    return Array.isArray(saved) ? [...new Set(saved.filter((id) => typeof id === "string"))] : [];
  } catch {
    return [];
  }
}
function writeSavedClinicIds(patientId, clinicIds) {
  localStorage.setItem(savedClinicKey(patientId), JSON.stringify([...new Set(clinicIds)]));
}
const navs = {
  Patient: [
    { label: "Overview", items: [["dashboard", "Overview", "home"]] },
    { label: "Explore Healthcare", items: [["clinics", "Find Clinics", "search"]] },
    { label: "Appointments", items: [["booking", "Book Appointment", "calendar"], ["appointments", "My Appointments", "calendar"]] },
    { label: "", items: [["saved-clinics", "Saved Clinics", "clinic"], ["notifications", "Notifications", "bell"]] },
    { label: "Help & Support", items: [["help", "FAQs & Help Center", "check"], ["report-issue", "Report an Issue", "report"], ["support-reports", "My Support Reports", "log"]] },
    { label: "Profile & Settings", items: [["profile", "Manage Profile", "user"]] },
  ],
  "Clinic Administrator": [
    { label: "Overview", items: [["dashboard", "Overview", "home"]] },
    { label: "Clinic Operations", items: [
      ["appointments", "Appointments", "calendar", "appointments/appointments.html"],
      ["services", "Services & Specialties", "service"],
      ["schedules", "Clinic Schedule & Hours", "clock", "schedules/schedules.html?view=hours"],
      ["status-queue", "Availability & Queue", "report"],
      ["profile", "Clinic Profile & Location", "clinic", "profile/profile.html"],
    ] },
    { label: "Staff Management", items: [
      ["staff", "Staff Directory", "staff", "staff/staff.html"],
      ["schedules", "Staff Schedules & Availability", "clock", "schedules/schedules.html?view=staff"],
    ] },
    { label: "Insights & Updates", items: [["reports", "Reports & Activity", "report"], ["notifications", "Notifications", "bell"]] },
    { label: "Help & Support", items: [
      ["help", "FAQs & Help Center", "check"],
      ["report-issue", "Report an Issue", "report"],
      ["support-reports", "My Support Reports", "log"],
    ] },
  ],
  "System Administrator": [
    { label: "Overview", items: [["dashboard", "Dashboard", "home"]] },
    { label: "Account Management", items: [["patients", "Patient Accounts", "user"], ["clinics", "Clinic Accounts", "clinic"]] },
    { label: "Clinic Verification", items: [["clinic-approvals", "Pending Applications", "check"], ["clinics?view=approved", "Approved Clinics", "clinic", "clinics/clinics.html?view=approved"], ["clinic-approvals?view=follow-up", "Needs Correction / Rejected", "report", "clinic-approvals/clinic-approvals.html?view=follow-up"]] },
    { label: "Platform Monitoring", items: [["admin-appointments", "Appointment Monitoring", "calendar", "appointments/appointments.html"], ["platform-map", "Platform Map", "clinic", "platform-map/platform-map.html"], ["admin-support", "Issue & Support", "report", "support/support.html"]] },
    { label: "Content & Insights", items: [["reports", "Reports & Analytics", "report"], ["admin-help", "FAQs & Help Content", "check", "help-content/help.html"], ["activity-logs", "Activity Logs", "log"]] },
    { label: "System", items: [["admin-settings", "System Settings", "clock", "settings/settings.html"], ["notifications", "Notifications", "bell"], ["profile", "Profile & Settings", "user"]] },
  ],
};
const titles = {
  dashboard: "Dashboard",
  profile: "Profile",
  clinics: "Find Care",
  "clinic-detail": "Clinic Detail",
  "saved-clinics": "Saved Clinics",
  "report-issue": "Report an Issue",
  "support-reports": "My Support Reports",
  map: "Interactive clinic map",
  booking: "Book an appointment",
  appointments: "Appointments",
  notifications: "Notifications",
  feedback: "Patient feedback",
  help: "Help",
  services: "Services & specialties",
  staff: "Clinic staff",
  schedules: "Schedules & slots",
  "status-queue": "Status & queue",
  reports: "Reports & Activity",
  help: "FAQs & Help Center",
  "clinic-approvals": "Clinic approvals",
  patients: "Patient accounts",
  specialties: "Specialty categories",
  reports: "Reports & analytics",
  "activity-logs": "Activity logs",
  "admin-appointments": "Appointment monitoring",
  "platform-map": "Platform map",
  "admin-support": "Issue & support management",
  "admin-help": "FAQs & help content",
  "admin-settings": "System settings",
  notifications: "Notifications",
  profile: "My profile",
};
const clinicPageTitles = {
  appointments: "Appointments",
  services: "Services & Specialties",
  staff: "Staff Directory",
  schedules: "Clinic Schedule & Hours",
  "status-queue": "Availability & Queue",
  reports: "Reports & Activity",
  profile: "Clinic Profile & Location",
};
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
const safeProfilePhoto = (value) =>
  /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(String(value || ""))
    ? value
    : "";
function renderSidebarProfilePhoto(name, photo = "") {
  const avatar = document.querySelector(".sidebar-profile-avatar");
  if (!avatar) return;
  const initials = String(name || "?")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
  avatar.innerHTML = safeProfilePhoto(photo)
    ? `<img src="${escapeHtml(photo)}" alt="">`
    : escapeHtml(initials);
}
function renderHeaderProfile(name, photo = "") {
  const avatar = document.querySelector("#profile-menu-toggle");
  if (!avatar) return;
  const initials = String(name || "?")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
  avatar.innerHTML = safeProfilePhoto(photo)
    ? `<img src="${escapeHtml(photo)}" alt="">`
    : escapeHtml(initials);
}
function compressProfilePhoto(file) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type))
    return Promise.reject(new Error("Choose a JPG, PNG, or WebP image."));
  if (file.size > 5 * 1024 * 1024)
    return Promise.reject(new Error("Choose an image smaller than 5 MB."));
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("The selected image could not be opened."));
    };
    image.onload = () => {
      if (image.width * image.height > 25_000_000) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Choose an image with fewer than 25 megapixels."));
        return;
      }
      const scale = Math.min(1, 512 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Your browser could not prepare this image."));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size > 180 * 1024) {
            reject(
              new Error(
                "This image could not be reduced to the safe size limit.",
              ),
            );
            return;
          }
          const reader = new FileReader();
          reader.onerror = () =>
            reject(new Error("The image could not be saved."));
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        0.78,
      );
    };
    image.src = objectUrl;
  });
}
const formatDate = (value) =>
  value
    ? new Date(`${value}T00:00`).toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
const formatTime = (value) => {
  if (!value) return "Time not selected";
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
};
function today() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
const manilaDateTime = (date, time = "00:00") =>
  new Date(`${date}T${time.length === 5 ? `${time}:00` : time}+08:00`);
const isFutureSlot = (slot) =>
  manilaDateTime(slot.slot_date, slot.start_time).getTime() > Date.now();
const distanceKm = (fromLat, fromLon, toLat, toLon) => {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latitude = radians(toLat - fromLat);
  const longitude = radians(toLon - fromLon);
  const value =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(fromLat)) *
      Math.cos(radians(toLat)) *
      Math.sin(longitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};
function readFindCareLocation() {
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(findCareLocationKey) || "null",
    );
    if (
      !saved ||
      !Number.isFinite(Number(saved.saved_at)) ||
      Date.now() - Number(saved.saved_at) > 30 * 60 * 1000 ||
      !Number.isFinite(Number(saved.lat)) ||
      Number(saved.lat) < -90 ||
      Number(saved.lat) > 90 ||
      !Number.isFinite(Number(saved.lon)) ||
      Number(saved.lon) < -180 ||
      Number(saved.lon) > 180
    )
      return null;
    return { lat: Number(saved.lat), lon: Number(saved.lon) };
  } catch {
    return null;
  }
}
function saveFindCareLocation(lat, lon) {
  sessionStorage.setItem(
    findCareLocationKey,
    JSON.stringify({ lat, lon, saved_at: Date.now() }),
  );
}
const staffName = (id, staff) =>
  staff.find((item) => item.staff_id === id)?.staff_name || "Clinic staff";
const staffRole = (member) => member.staff_role || "Doctor";
const clinicName = (id, clinics) =>
  clinics.find((item) => item.clinic_id === id)?.clinic_name || "Clinic";
const setPageError = (error) => {
  const root = document.querySelector("#page-content");
  root.innerHTML = `<div class="empty"><div class="empty-icon">!</div><h2>We couldn’t load this page</h2><p>${escapeHtml(error.message)}</p><button class="btn btn-primary" id="retry">Try again</button></div>`;
  root
    .querySelector("#retry")
    .addEventListener("click", () => location.reload());
};

function shell(role, feature, session) {
  const admin = role === "System Administrator";
  const root = roots[role];
  const profilePath = `${root}profile/profile.html`;
  const notificationsPath = `${root}notifications/notifications.html`;
  const profileSection = admin
    ? `<section class="sidebar-profile"><a class="sidebar-profile-avatar" href="${profilePath}" aria-label="Edit profile">${escapeHtml(session.name.split(" ").map((part) => part[0]).slice(0, 2).join(""))}</a><div class="sidebar-profile-details"><strong>${escapeHtml(session.name)}</strong><span>System Administrator</span></div><a class="sidebar-profile-edit" href="${profilePath}">Edit Profile</a></section>`
    : `<section class="sidebar-profile"><a class="sidebar-profile-avatar" href="${profilePath}" aria-label="Edit profile">${escapeHtml(
        session.name
          .split(" ")
          .map((part) => part[0])
          .slice(0, 2)
          .join(""),
      )}</a><div class="sidebar-profile-details"><strong>${escapeHtml(session.name)}</strong><span>${role === "Clinic Administrator" ? "Clinic" : escapeHtml(role)}</span></div><a class="sidebar-profile-edit" href="${profilePath}">Edit Profile</a></section>`;
  const navMarkup = ["Patient", "Clinic Administrator", "System Administrator"].includes(role)
    ? navs[role].map(({ label, items }) => `<section class="side-nav-group">${label ? `<h2>${escapeHtml(label)}</h2>` : ""}${items.map(([key, text, glyph, customHref]) => { const href = customHref ? `${root}${customHref}` : `${root}${key}/${key}.html`; const target = new URL(href, location.origin); const requiredQuery = new URLSearchParams(target.search); const currentQuery = new URLSearchParams(location.search); const queryMatches = [...requiredQuery].every(([name, value]) => currentQuery.get(name) === value); const hashMatches = !target.hash || target.hash === location.hash; const addStaffContext = feature === "staff" && currentQuery.get("action") === "add"; const active = customHref ? target.pathname === location.pathname && queryMatches && hashMatches : key === feature && (admin || !location.search || addStaffContext) && !location.hash; return `<a class="${active ? "active" : ""}" href="${href}" title="${escapeHtml(text)}" aria-label="${escapeHtml(text)}"><span>${icon(glyph)}</span><span class="nav-label">${escapeHtml(text)}</span></a>`; }).join("")}</section>`).join("")
    : navs[role].map(([key, label, glyph]) => `<a class="${key === feature ? "active" : ""}" href="${root}${key}/${key}.html" title="${label}" aria-label="${label}"><span>${icon(glyph)}</span><span class="nav-label">${label}</span></a>`).join("");
  const profileControl = ["Patient", "Clinic Administrator", "System Administrator"].includes(role)
    ? `<div class="profile-menu-wrap"><button class="avatar profile-menu-toggle" id="profile-menu-toggle" type="button" aria-label="Open profile menu" aria-expanded="false" aria-haspopup="dialog" aria-controls="profile-popover">${escapeHtml(session.name.split(" ").map((part) => part[0]).slice(0, 2).join(""))}</button><div class="profile-popover" id="profile-popover" role="dialog" aria-label="${role === "System Administrator" ? "System administrator" : role === "Patient" ? "Patient" : "Clinic administrator"} profile menu" hidden><div class="profile-popover-heading"><div class="profile-popover-avatar">${escapeHtml(session.name.split(" ").map((part) => part[0]).slice(0, 2).join(""))}</div><div><strong>${escapeHtml(session.name)}</strong><span>${role}</span>${role === "Clinic Administrator" ? '<small id="profile-clinic-name">Loading clinic profile…</small>' : ""}</div></div>${role === "System Administrator" ? `<a href="${profilePath}" data-profile-menu-link>Edit Profile</a><a href="${root}settings/settings.html" data-profile-menu-link>Account Settings</a><a href="${root}help-content/help.html" data-profile-menu-link>Help & FAQs</a><a href="${root}support/support.html" data-profile-menu-link>Report an Issue</a>` : `<a href="${profilePath}" data-profile-menu-link>Edit Profile</a><a href="${profilePath}#account-settings" data-profile-menu-link>Account Settings</a><a href="${root}help/help.html" data-profile-menu-link>Help & FAQs</a><a href="${root}report-issue/report-issue.html" data-profile-menu-link>Report an Issue</a>`}<div class="profile-popover-footer"><a href="${appPath("/index.html")}" data-logout>Sign Out</a></div></div></div>`
    : `<a class="avatar profile-shortcut" href="${profilePath}" aria-label="My profile" title="My profile">${escapeHtml(session.name.split(" ").map((part) => part[0]).slice(0, 2).join(""))}</a>`;  const collapsed =
    localStorage.getItem("lapitcare_sidebar_collapsed") === "true";
  document.body.innerHTML = `<div class="app-layout ${admin ? "admin-shell" : ""}">
    <aside class="sidebar" id="role-sidebar"><div class="sidebar-brand"><a class="logo" href="${root}dashboard/dashboard.html" aria-label="LapitCare dashboard"><span class="logo-mark"></span><span class="logo-text">LapitCare</span></a></div>
      ${profileSection}<nav class="side-nav" aria-label="${role} navigation">${navMarkup}</nav><div class="side-bottom"><a class="btn btn-ghost" data-logout href="${appPath("/index.html")}" aria-label="Sign out" title="Sign out">${icon("logout")}<span class="nav-label">Sign out</span></a></div>
    </aside><main class="app-main"><header class="topbar"><button class="icon-btn sidebar-nav-toggle" type="button" data-sidebar-toggle data-menu aria-expanded="${window.matchMedia("(max-width: 980px)").matches ? "false" : String(!collapsed)}" aria-controls="role-sidebar" aria-label="Toggle sidebar navigation" title="Toggle sidebar navigation"><span class="sidebar-nav-icon ${collapsed && !window.matchMedia("(max-width: 980px)").matches ? "is-collapsed" : ""}" aria-hidden="true"></span></button>
      <a class="topbar-brand" href="${appPath("/index.html")}" aria-label="LapitCare home"><span class="logo-mark"></span><span>Lapit<span>Care</span></span></a>
      <div class="actions"><div class="notification-menu-wrap"><button class="icon-btn notification-link" id="notification-menu-toggle" type="button" aria-label="Open notifications" title="Notifications" aria-expanded="false" aria-haspopup="dialog" aria-controls="notification-popover">${icon("bell")}<span class="notification-count" id="header-unread-count" hidden></span></button><section class="notification-popover" id="notification-popover" role="dialog" aria-label="Recent notifications" hidden><div class="notification-popover-head"><div><strong>Notifications</strong><span id="notification-popover-summary">Your latest updates</span></div><a href="${notificationsPath}">View all</a></div><div class="notification-popover-list" id="notification-popover-list"><p class="muted">Loading updates…</p></div><a class="notification-popover-all" href="${notificationsPath}">Open notification center</a></section></div>${profileControl}</div></header>
      <section class="page page-${feature}">${["Patient", "Clinic Administrator", "System Administrator"].includes(role) && feature === "dashboard" ? "" : `<div class="page-head"><div class="page-heading">${feature !== "dashboard" ? '<button class="btn btn-ghost page-back-button" type="button" data-back aria-label="Go back">← Back</button>' : ""}<div><p class="eyebrow">${role === "Patient" ? "My care" : admin ? "Back office" : "Clinic workspace"}</p>
        <h1 class="page-title">${role === "Clinic Administrator" ? (feature === "dashboard" ? "Overview" : feature === "staff" && new URLSearchParams(location.search).get("view") === "roles" ? "Roles & Permissions" : feature === "schedules" && new URLSearchParams(location.search).get("view") === "staff" ? "Staff Schedules & Availability" : clinicPageTitles[feature] || titles[feature] || feature) : titles[feature] || feature}</h1><p class="muted" id="page-subtitle"></p></div></div><div class="page-head-actions"><div class="actions" id="page-actions"></div></div></div>`}
        <div id="page-content"><div class="grid grid-3"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div></div>
      </section></main></div>`;
  const layout = document.querySelector(".app-layout");
  document.querySelector("[data-back]")?.addEventListener("click", () => {
    location.href = `${root}dashboard/dashboard.html`;
  });
  layout.classList.toggle("sidebar-collapsed", collapsed);
  const sidebarToggle = document.querySelector("[data-sidebar-toggle]");
  const toggleMobileNav = setupMobileNav(sidebarToggle);
  sidebarToggle.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 980px)").matches) {
      toggleMobileNav();
      return;
    }
    const next = !layout.classList.contains("sidebar-collapsed");
    layout.classList.toggle("sidebar-collapsed", next);
    localStorage.setItem("lapitcare_sidebar_collapsed", String(next));
    sidebarToggle.setAttribute(
      "aria-label",
      `${next ? "Expand" : "Collapse"} navigation`,
    );
    sidebarToggle.querySelector(".sidebar-nav-icon")?.classList.toggle("is-collapsed", next);
    sidebarToggle.setAttribute("aria-expanded", String(!next));
    sidebarToggle.title = `${next ? "Expand" : "Collapse"} navigation`;
  });
  window.addEventListener("resize", () => {
    const mobile = window.matchMedia("(max-width: 980px)").matches;
    sidebarToggle.querySelector(".sidebar-nav-icon")?.classList.toggle(
      "is-collapsed",
      !mobile && layout.classList.contains("sidebar-collapsed"),
    );
    if (mobile) sidebarToggle.setAttribute("aria-expanded", String(document.querySelector(".sidebar")?.classList.contains("open")));
    else sidebarToggle.setAttribute("aria-expanded", String(!layout.classList.contains("sidebar-collapsed")));
  });
  document.querySelectorAll("[data-logout]").forEach((link) =>
    link.addEventListener("click", (event) => {
      event.preventDefault();
      clearSession();
      sessionStorage.removeItem(findCareLocationKey);
      location.href = appPath("/index.html");
    }),
  );
  const profileButton = document.querySelector("#profile-menu-toggle");
  const profilePopover = document.querySelector("#profile-popover");
  if (profileButton && profilePopover) {
    const closePopover = () => {
      profilePopover.hidden = true;
      profileButton.setAttribute("aria-expanded", "false");
    };
    profileButton.addEventListener("click", () => {
      const open = profilePopover.hidden;
      profilePopover.hidden = !open;
      profileButton.setAttribute("aria-expanded", String(open));
    });
    profilePopover.querySelectorAll("[data-profile-menu-link]").forEach((link) =>
      link.addEventListener("click", closePopover),
    );
    document.addEventListener("pointerdown", (event) => {
      if (!event.target.closest(".profile-menu-wrap")) closePopover();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !profilePopover.hidden) {
        closePopover();
        profileButton.focus();
      }
    });
  }
  const notificationButton = document.querySelector("#notification-menu-toggle");
  const notificationPopover = document.querySelector("#notification-popover");
  if (notificationButton && notificationPopover) {
    const list = notificationPopover.querySelector("#notification-popover-list");
    const recipientIds = [session.patient_id, session.clinic_id, session.user_id, ...(role === "System Administrator" ? ["system_admin"] : [])].filter(Boolean);
    const renderRecentNotifications = async () => {
      const notifications = (await api.list("notifications"))
        .filter((note) => recipientIds.includes(note.recipient_id))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const unread = notifications.filter((note) => !note.read).length;
      const count = document.querySelector("#header-unread-count");
      count.textContent = unread > 99 ? "99+" : String(unread);
      count.hidden = unread === 0;
      notificationPopover.querySelector("#notification-popover-summary").textContent = unread ? `${unread} unread update${unread === 1 ? "" : "s"}` : "You’re all caught up";
      list.innerHTML = notifications.slice(0, 5).map((note) => `<article class="notification-popover-item ${note.read ? "" : "is-unread"}"><span class="notification-popover-mark">${icon("bell")}</span><div><strong>${escapeHtml(note.notification_type || "Update")}</strong><p>${escapeHtml(note.message || "")}</p><small>${escapeHtml(new Date(note.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }))}</small></div>${note.read ? "" : `<button type="button" class="notification-mark-read" data-notification-read="${escapeHtml(note.notification_id)}" aria-label="Mark as read">Read</button>`}</article>`).join("") || '<p class="notification-popover-empty">No updates yet. Appointment and clinic updates will appear here.</p>';
      list.querySelectorAll("[data-notification-read]").forEach((button) => button.addEventListener("click", async () => {
        await api.update("notifications", button.dataset.notificationRead, { read: true }, "notification_id");
        await renderRecentNotifications();
      }));
    };
    const closeNotifications = () => {
      notificationPopover.hidden = true;
      notificationButton.setAttribute("aria-expanded", "false");
    };
    notificationButton.addEventListener("click", async () => {
      const open = notificationPopover.hidden;
      notificationPopover.hidden = !open;
      notificationButton.setAttribute("aria-expanded", String(open));
      if (open) await renderRecentNotifications();
    });
    document.addEventListener("pointerdown", (event) => {
      if (!event.target.closest(".notification-menu-wrap")) closeNotifications();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !notificationPopover.hidden) {
        closeNotifications();
        notificationButton.focus();
      }
    });
  }
}

async function saveNotification(
  recipientId,
  message,
  type = "Appointment update",
) {
  await api.create("notifications", {
    notification_id: `not_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    recipient_id: recipientId,
    notification_type: type,
    message,
    read: false,
    created_at: new Date().toISOString(),
  });
}

async function patientPage(feature, session) {
  const root = document.querySelector("#page-content");
  if (feature === "map") {
    location.replace("../clinics/clinics.html?view=map");
    return;
  }
  const patients = await api.list("patients");
  const patient = patients.find(
    (item) =>
      item.patient_id === session.patient_id ||
      item.user_id === session.user_id,
  );
  if (!patient)
    throw new Error("This account is not linked to a patient profile.");
  const patientId = patient.patient_id;
  renderSidebarProfilePhoto(patient.name, patient.profile_photo);
  renderHeaderProfile(patient.name, patient.profile_photo);
  const [clinics, appointments, notifications] = await Promise.all([
    api.clinics(),
    api.list("appointments"),
    api.list("notifications"),
  ]);
  const mine = appointments.filter((item) => item.patient_id === patientId);
  const unreadCount = notifications.filter(
    (notification) => notification.recipient_id === patientId && !notification.read,
  ).length;
  const unreadBadge = document.querySelector("#header-unread-count");
  unreadBadge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
  unreadBadge.hidden = unreadCount === 0;

  if (feature === "saved-clinics") {
    const savedIds = readSavedClinicIds(patientId);
    const saved = clinics.filter((clinic) => savedIds.includes(clinic.clinic_id));
    root.innerHTML = `<section class="card saved-clinics-heading"><div><p class="eyebrow">Your shortlist</p><h2>Clinics you saved</h2><p class="muted">Keep promising clinics together so they are easy to compare later.</p></div><a class="btn btn-primary" href="../clinics/clinics.html">Explore clinics</a></section><div class="grid grid-2 saved-clinics-list">${saved.map((clinic) => `<article class="card clinic-card"><div class="clinic-card-top"><div class="avatar">${safeProfilePhoto(clinic.profile_photo) ? `<img src="${escapeHtml(clinic.profile_photo)}" alt="">` : escapeHtml(clinic.clinic_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join(""))}</div>${badge(clinic.clinic_status)}</div><p class="eyebrow">${escapeHtml(clinic.clinic_type || "Private clinic")}</p><h3>${escapeHtml(clinic.clinic_name)}</h3><p class="muted">${escapeHtml(clinic.address || clinic.barangay || "Location not listed")}</p><p><strong>Bookable services:</strong> ${escapeHtml((clinic.services || []).slice(0, 3).join(" · ") || "Not listed")}</p>${clinic.service_description ? `<p class="muted"><strong>Service details:</strong> ${escapeHtml(clinic.service_description)}</p>` : ""}<div class="actions"><a class="btn btn-primary" href="../clinic-detail/clinic-detail.html?id=${encodeURIComponent(clinic.clinic_id)}">View Details</a><button class="btn btn-secondary" type="button" data-remove-saved="${escapeHtml(clinic.clinic_id)}">Remove</button></div></article>`).join("") || `<div class="empty saved-clinics-empty"><strong>No saved clinics yet</strong><p>Use Save Clinic while browsing to build your shortlist.</p><a class="btn btn-primary" href="../clinics/clinics.html">Find Clinics</a></div>`}</div>`;
    root.querySelectorAll("[data-remove-saved]").forEach((button) => button.addEventListener("click", () => {
      writeSavedClinicIds(patientId, readSavedClinicIds(patientId).filter((id) => id !== button.dataset.removeSaved));
      toast("Clinic removed from your saved list.");
      location.reload();
    }));
    return;
  }

  if (feature === "report-issue") {
    root.innerHTML = `<section class="card support-form-card"><p class="eyebrow">Patient support</p><h2>Report an issue</h2><p class="muted">Tell the LapitCare demo team what happened. Your report is linked to your patient account.</p><form id="support-report-form" novalidate><div class="grid grid-2"><div class="field"><label for="report-category">Category</label><select class="select" id="report-category"><option value="">Choose a category</option><option>Appointments</option><option>Clinic information</option><option>Account access</option><option>Website problem</option><option>Other</option></select></div><div class="field"><label for="report-subject">Subject</label><input class="input" id="report-subject" maxlength="120" placeholder="Short summary"></div></div><div class="field"><label for="report-description">What happened?</label><textarea class="textarea" id="report-description" rows="6" maxlength="2000" placeholder="Include the page and steps that led to the issue."></textarea></div><div class="field"><label for="report-attachment">Screenshot or document (optional)</label><input class="input" id="report-attachment" type="file" accept="image/png,image/jpeg,application/pdf"><small class="field-help">One image or PDF up to 512 KB. Stored locally in this browser.</small></div><p class="form-error" id="support-report-error" role="alert"></p><button class="btn btn-primary" id="support-report-submit" type="submit">Submit Report</button></form></section>`;
    root.querySelector("#support-report-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = root.querySelector("#support-report-submit");
      const error = root.querySelector("#support-report-error");
      const file = root.querySelector("#report-attachment").files?.[0];
      const category = root.querySelector("#report-category").value;
      const subject = root.querySelector("#report-subject").value.trim();
      const description = root.querySelector("#report-description").value.trim();
      if (!category || !subject || !description) {
        error.textContent = "Choose a category and enter a subject and description before submitting.";
        return;
      }
      submit.disabled = true;
      error.textContent = "";
      try {
        let attachment = null;
        if (file) {
          if (!/^(image\/(png|jpeg)|application\/pdf)$/.test(file.type) || file.size > 512 * 1024)
            throw new Error("Choose one PNG, JPG, or PDF file up to 512 KB.");
          attachment = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ name: file.name, data_url: String(reader.result) });
            reader.onerror = () => reject(new Error("The selected attachment could not be read."));
            reader.readAsDataURL(file);
          });
        }
        const supportReportId = `sup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await api.create("support_reports", {
          support_report_id: supportReportId,
          patient_id: patientId,
          report_category: category,
          subject,
          description,
          attachment,
          report_status: "Received",
          resolution_notes: "",
          created_at: new Date().toISOString(),
        });
        await api.notify("system_admin", `New patient issue report: ${subject}`, "Support report", { reference_type: "support_report", reference_id: supportReportId });
        root.innerHTML = `<section class="card support-success-card"><div class="success-check" aria-hidden="true">&#10003;</div><p class="eyebrow">Report received</p><h2>Thank you for letting us know.</h2><p>Your report is saved to this browser and linked to your patient account.</p><div class="actions"><a class="btn btn-primary" href="../support-reports/support-reports.html">View My Support Reports</a><a class="btn btn-secondary" href="../dashboard/dashboard.html">Return to Dashboard</a></div></section>`;
      } catch (submitError) {
        error.textContent = submitError.message || "Your report could not be saved.";
        submit.disabled = false;
      }
    });
    return;
  }

  if (feature === "support-reports") {
    const reports = (await api.list("support_reports"))
      .filter((report) => report.patient_id === patientId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    root.innerHTML = `<section class="dashboard-section-head"><div><p class="eyebrow">Help & Support</p><h2 class="section-title">My support reports</h2><p class="muted">Check the status and response for reports sent from your account.</p></div><a class="btn btn-primary" href="../report-issue/report-issue.html">Report an Issue</a></section><div class="list support-reports-list">${reports.map((report) => `<article class="card support-report-card"><div class="support-report-head"><div><p class="eyebrow">${escapeHtml(report.report_category || "Support")}</p><h3>${escapeHtml(report.subject || "Support request")}</h3></div>${badge(report.report_status || "Received")}</div><p>${escapeHtml(report.description || "")}</p><small class="muted">${escapeHtml(new Date(report.created_at).toLocaleString("en-PH"))} · ${escapeHtml(report.support_report_id)}</small>${report.attachment?.name ? `<p class="muted">Attachment: ${escapeHtml(report.attachment.name)}</p>` : ""}${report.resolution_notes ? `<div class="notice"><strong>Response</strong><p>${escapeHtml(report.resolution_notes)}</p></div>` : '<p class="muted">No response has been added yet.</p>'}</article>`).join("") || '<div class="empty"><strong>No support reports yet</strong><p>Reports you submit will appear here with their current status.</p></div>'}</div>`;
    return;
  }

  if (feature === "help") {
    const faqs = (await api.list("faqs")).filter((faq) => faq.published !== false && ["General", "Patient"].includes(faq.audience || "General"));
    root.innerHTML = `<div class="support-help-layout"><section class="card"><p class="eyebrow">Help & Support</p><h2>FAQs & Help Center</h2><p class="muted">Search quick answers or send a report if something is not working.</p><div class="field"><label for="faq-search">Search questions</label><input class="input" id="faq-search" type="search" placeholder="Try appointments, clinic, or saved"></div><div class="help-faq-list" id="faq-results"></div></section><aside class="card support-contact-card"><h2>Still need help?</h2><p>Send a report linked to your account and review its status later.</p><div class="dashboard-shortcuts"><a class="btn btn-primary" href="../report-issue/report-issue.html">Report an Issue</a><a class="btn btn-secondary" href="../support-reports/support-reports.html">My Support Reports</a></div></aside></div>`;
    const renderFaqs = () => {
      const query = root.querySelector("#faq-search").value.trim().toLowerCase();
      const matches = faqs.filter((faq) => `${faq.question} ${faq.answer}`.toLowerCase().includes(query));
      root.querySelector("#faq-results").innerHTML = matches.map((faq) => `<details class="help-faq"><summary>${escapeHtml(faq.question)}</summary><p>${escapeHtml(faq.answer)}</p></details>`).join("") || '<div class="empty">No matching answers. Send a report and we will log the issue in this demo.</div>';
    };
    root.querySelector("#faq-search").addEventListener("input", renderFaqs);
    renderFaqs();
    return;
  }

  if (feature === "dashboard") {
    const supportReports = await api.list("support_reports");
    const recentAdminActivity = (await api.list("activity_logs")).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
    const recentRegistrations = [
      ...clinics.map((item) => ({ name: item.clinic_name, role: "Clinic", status: item.approval_status, created_at: item.registration_submitted_at || item.created_at })),
      ...patients.map((item) => ({ name: item.name, role: "Patient", status: item.account_status || "Active", created_at: item.created_at })),
    ].filter((item) => item.created_at).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
    const upcomingAppointments = mine
      .filter(
        (appointment) =>
          ["Confirmed", "Pending"].includes(appointment.appointment_status) &&
          manilaDateTime(
            appointment.appointment_date,
            appointment.appointment_time,
          ).getTime() > Date.now(),
      )
      .sort((a, b) =>
        `${a.appointment_date} ${a.appointment_time}`.localeCompare(
          `${b.appointment_date} ${b.appointment_time}`,
        ),
      );
    const patientNotifications = notifications
      .filter((notification) => notification.recipient_id === patientId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 4);
    const notificationTarget = (notification) => {
      const appointment = mine.find((item) => notification.message.includes(item.reference_number));
      return appointment
        ? `../appointments/appointments.html?status=${encodeURIComponent(appointment.appointment_status === "Cancelled" ? "Cancelled" : appointment.appointment_status === "Completed" ? "Completed" : appointment.appointment_status === "Confirmed" ? "Confirmed" : "Pending")}`
        : "../clinics/clinics.html";
    };
    const firstName = patient.name.trim().split(/\s+/)[0] || "there";
    const statusCards = [
      {
        label: "Upcoming",
        count: upcomingAppointments.length,
        description: "Pending or confirmed visits",
      },
      {
        label: "Pending",
        count: mine.filter(
          (appointment) => appointment.appointment_status === "Pending",
        ).length,
        description: "Awaiting clinic review",
      },
      {
        label: "Confirmed",
        count: upcomingAppointments.filter(
          (appointment) => appointment.appointment_status === "Confirmed",
        ).length,
        description: "Ready for your visit",
      },
    ];

    const savedClinicIds = readSavedClinicIds(patientId);
    root.innerHTML = `<section class="patient-welcome"><div class="patient-welcome-copy"><h2>Welcome back, ${escapeHtml(firstName)}</h2><p class="muted">Find trusted local care and keep track of your next steps.</p></div><div class="patient-welcome-actions"><p class="eyebrow">Quick actions</p><div class="actions"><a class="btn btn-primary" href="../clinics/clinics.html">${icon("search")} Find a Clinic</a><a class="btn btn-secondary" href="../booking/booking.html">Book Appointment</a><a class="btn btn-ghost" href="../appointments/appointments.html">My Appointments</a></div></div></section>
      <section class="grid grid-3 patient-status-cards" aria-label="Appointment summary">${statusCards.map((card) => `<a class="card stat-card dashboard-link patient-status-${card.label.toLowerCase()}" href="../appointments/appointments.html?status=${encodeURIComponent(card.label)}"><span class="patient-status-symbol" aria-hidden="true">${card.label === "Upcoming" ? "↗" : card.label === "Pending" ? "◷" : "✓"}</span><span class="stat-label">${escapeHtml(card.label)} appointments</span><div class="stat-value">${card.count}</div><span class="muted">${escapeHtml(card.description)}</span></a>`).join("")}</section>
      <div class="patient-dashboard-workspace"><section class="card patient-dashboard-map-card"><div class="dashboard-section-head"><div><p class="eyebrow">Explore healthcare</p><h2 class="section-title">Nearby clinic map</h2></div><div class="actions"><a class="btn btn-secondary" href="../clinics/clinics.html?view=map">Find clinics</a><button class="btn btn-ghost" type="button" id="patient-map-expand" aria-expanded="false">Expand</button></div></div><div class="dashboard-map" id="patient-dashboard-map"></div><p class="form-error" id="patient-map-error" role="status"></p></section>
      <section class="card patient-upcoming-list"><div class="dashboard-section-head"><div><p class="eyebrow">Next in your care</p><h2 class="section-title">Upcoming appointments</h2></div><a href="../appointments/appointments.html">View all</a></div><div class="list">${upcomingAppointments.slice(0, 2).map((appointment) => `<article class="list-item patient-appointment-preview"><div class="appointment-date-chip"><strong>${escapeHtml(new Date(`${appointment.appointment_date}T00:00`).toLocaleDateString("en-PH", { day: "2-digit" }))}</strong><span>${escapeHtml(new Date(`${appointment.appointment_date}T00:00`).toLocaleDateString("en-PH", { month: "short" }))}</span></div><div class="grow"><strong>${escapeHtml(clinicName(appointment.clinic_id, clinics))}</strong><p>${escapeHtml(appointment.service_name || "Appointment")} · ${formatDate(appointment.appointment_date)} at ${escapeHtml(appointment.appointment_time)}</p><span class="muted">${escapeHtml(appointment.reference_number || "Reference pending")}</span></div>${badge(appointment.appointment_status)}<a class="btn btn-ghost" href="../appointments/appointments.html?appointment_id=${encodeURIComponent(appointment.appointment_id)}">View details</a></article>`).join("") || `<div class="empty"><strong>No upcoming appointments</strong><p>When you book a clinic visit, its status and schedule will appear here.</p><a class="btn btn-primary" href="../clinics/clinics.html">Find a Clinic</a></div>`}</div></section></div>
      <div class="patient-dashboard-followup"><section class="card patient-saved-summary"><div class="dashboard-section-head"><div><p class="eyebrow">Your shortlist</p><h2 class="section-title">Saved Clinics</h2></div><a href="../saved-clinics/saved-clinics.html">View all</a></div><p class="patient-saved-count">${savedClinicIds.length} saved ${savedClinicIds.length === 1 ? "clinic" : "clinics"}</p>${savedClinicIds.length ? `<a class="btn btn-secondary" href="../saved-clinics/saved-clinics.html">Manage saved clinics</a>` : `<p class="muted">Save clinics to compare their services later.</p><a class="btn btn-secondary" href="../clinics/clinics.html">Explore clinics</a>`}</section>
      <section class="card patient-recent-notifications"><div class="dashboard-section-head"><div><p class="eyebrow">Updates</p><h2 class="section-title">Recent notifications</h2></div><a href="../notifications/notifications.html">${unreadCount ? `${unreadCount} unread` : "View all"}</a></div><div class="list">${patientNotifications.slice(0, 2).map((notification) => `<a class="list-item notification-preview ${notification.read ? "" : "unread"}" href="${notificationTarget(notification)}"><div><strong>${escapeHtml(notification.notification_type)}</strong><div class="muted">${escapeHtml(notification.message.length > 96 ? `${notification.message.slice(0, 96)}…` : notification.message)}</div></div><span class="muted">${formatDate(String(notification.created_at || "").slice(0, 10))}</span></a>`).join("") || '<div class="empty">No notifications yet.</div>'}</div></section></div>`;

    renderClinicPreviewMap(
      "patient-dashboard-map",
      clinics.map((clinic) => ({
        clinic,
        href: `../clinic-detail/clinic-detail.html?id=${encodeURIComponent(clinic.clinic_id)}`,
      })),
    ).catch((error) => {
      const message = root.querySelector("#patient-map-error");
      if (message)
        message.textContent = `Map preview unavailable: ${error.message}`;
    });
    root.querySelector("#patient-map-expand").addEventListener("click", (event) => {
      const expanded = root.querySelector(".patient-dashboard-map-card").classList.toggle("is-expanded");
      event.currentTarget.textContent = expanded ? "Compact map" : "Expand map";
      event.currentTarget.setAttribute("aria-expanded", String(expanded));
      requestAnimationFrame(() => previewMaps.get("patient-dashboard-map")?.invalidateSize({ pan: false }));
    });
    return;
  }
  if (feature === "clinics") {
    const [specialties, barangays] = await Promise.all([
      api.list("specialties"),
      api.list("barangays"),
    ]);
    let staff = await api.list("staff");
    let slots = await api.list("slots");
    const clinicCategories = [...new Set(clinics.map((clinic) => clinic.clinic_type).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const searchParams = new URLSearchParams(location.search);
    const savedLocation = readFindCareLocation();
    root.innerHTML = `<section class="find-care-toolbar" aria-label="Search and filter clinics"><div class="find-care-search-row"><div class="find-care-search-box"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"></circle><path d="m16 16 5 5"></path></svg><input class="input" id="clinic-search" type="search" placeholder="Search clinics, services, specialties, or locations" aria-label="Search clinics, services, specialties, or locations"></div>
        <div class="find-care-actions"><button class="btn btn-secondary near-me-button" type="button" id="find-care-near-me"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="2.5"></circle></svg><span>Near me</span></button><div class="find-care-filter-wrap"><button class="btn btn-secondary find-care-filter-toggle" type="button" id="find-care-filter-toggle" aria-expanded="false" aria-controls="find-care-filter-panel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10m-7 6h4"></path><circle cx="8" cy="6" r="1.5"></circle><circle cx="15" cy="12" r="1.5"></circle><circle cx="11" cy="18" r="1.5"></circle></svg><span>Filters</span><span class="find-care-filter-count" id="find-care-filter-count" hidden>0</span></button><section class="find-care-filter-panel" id="find-care-filter-panel" aria-label="Clinic filters" hidden><div class="find-care-filter-panel-head"><div><p class="eyebrow">Refine results</p><h2>Clinic filters</h2></div><button class="find-care-filter-close" type="button" id="find-care-filter-close" aria-label="Close filters">×</button></div><div class="find-care-filter-grid">
          <div class="field"><label for="category-filter">Clinic type</label><select class="select" id="category-filter"><option value="">All clinic types</option>${clinicCategories.map((category) => `<option>${escapeHtml(category)}</option>`).join("")}</select></div>
          <div class="field"><label for="specialty-filter">Specialty</label><select class="select" id="specialty-filter"><option value="">All specialties</option>${specialties.filter((x) => x.enabled).map((x) => `<option>${escapeHtml(x.specialty_name)}</option>`).join("")}</select></div>
          <div class="field"><label for="barangay-filter">Barangay</label><select class="select" id="barangay-filter"><option value="">All barangays</option>${barangays.map((x) => `<option>${escapeHtml(x.barangay_name)}</option>`).join("")}</select></div>
          <div class="field"><label for="status-filter">Clinic status</label><select class="select" id="status-filter"><option value="">Any status</option><option>Open</option><option>Limited Services</option><option>Closed</option></select></div>
          <div class="field"><label for="availability-filter">Availability</label><select class="select" id="availability-filter"><option value="">Any availability</option><option value="on-duty">On-duty staff</option><option value="open-slots">Upcoming appointment slots</option></select></div>
          <div class="field"><label for="radius-filter">Distance</label><select class="select" id="radius-filter"><option value="">Any distance</option><option value="5">Within 5 km</option><option value="10">Within 10 km</option><option value="20">Within 20 km</option></select></div>
          <div class="field"><label for="clinic-sort">Sort results</label><select class="select" id="clinic-sort"><option value="name">Name: A to Z</option><option value="distance">Distance: nearest first</option></select></div>
        </div><div class="find-care-filter-panel-foot"><span id="find-care-filter-hint">Choose one or more filters to narrow clinics.</span><button class="btn btn-primary" type="button" id="find-care-filter-done">Show results</button></div></section></div><button class="btn btn-ghost clear-filters-button" type="button" id="clear-clinic-filters">Clear filters</button></div>
        <input type="hidden" id="patient-latitude"><input type="hidden" id="patient-longitude"><p class="muted find-care-location-status" id="find-care-location-status" role="status"></p></section>
      <div class="find-care-results-head"><p id="clinic-result-count" aria-live="polite">Loading clinics…</p><div class="find-care-view-toggle" role="group" aria-label="Clinic results view"><button class="btn btn-secondary active" id="find-care-list-view" type="button" aria-pressed="true">List</button><button class="btn btn-secondary" id="find-care-map-view" type="button" aria-pressed="false">Map</button></div></div>
      <div class="find-care-layout mobile-list"><div class="grid grid-2" id="clinic-results"></div><section class="card find-care-map-card"><div class="dashboard-section-head"><div><p class="eyebrow">Matching results</p><h2 class="section-title">Clinic map</h2></div><button class="btn btn-ghost" type="button" id="find-care-map-expand" aria-expanded="false">Expand map</button></div><div class="dashboard-map" id="find-care-map"></div><p class="form-error" id="find-care-map-error" role="status"></p></section></div>`;
    setupCustomSelects(root);
    root.querySelector("#category-filter").value = searchParams.get("category") || "";
    root.querySelector("#clinic-search").value = searchParams.get("q") || "";
    root.querySelector("#specialty-filter").value =
      searchParams.get("specialty") || "";
    root.querySelector("#specialty-filter")._customSelectRefresh?.();
    root.querySelector("#barangay-filter").value =
      searchParams.get("barangay") || "";
    root.querySelector("#status-filter").value =
      searchParams.get("status") || "";
    root.querySelector("#availability-filter").value =
      searchParams.get("availability") || "";
    root.querySelector("#radius-filter").value =
      searchParams.get("radius") || "";
    root.querySelector("#clinic-sort").value = searchParams.get("sort") || "name";
    root.querySelector("#patient-latitude").value =
      searchParams.get("lat") || savedLocation?.lat || "";
    root.querySelector("#patient-longitude").value =
      searchParams.get("lon") || savedLocation?.lon || "";
    root.querySelectorAll(".find-care-toolbar select").forEach((select) => select._customSelectRefresh?.());
    const filterPanel = root.querySelector("#find-care-filter-panel");
    const filterToggle = root.querySelector("#find-care-filter-toggle");
    const filterSelects = [...root.querySelectorAll("#category-filter, #specialty-filter, #barangay-filter, #status-filter, #availability-filter, #radius-filter, #clinic-sort")];
    const updateFilterState = () => {
      const count = filterSelects.filter((select) => select.id === "clinic-sort" ? select.value === "distance" : Boolean(select.value)).length;
      const badge = root.querySelector("#find-care-filter-count");
      badge.textContent = String(count);
      badge.hidden = count === 0;
      filterToggle.classList.toggle("has-active-filters", count > 0);
      root.querySelector("#find-care-filter-hint").textContent = count
        ? `${count} ${count === 1 ? "filter is" : "filters are"} narrowing your results.`
        : "Choose one or more filters to narrow clinics.";
      return count;
    };
    const setFilterPanelOpen = (open, returnFocus = false) => {
      filterPanel.hidden = !open;
      filterToggle.setAttribute("aria-expanded", String(open));
      root.querySelector(".find-care-filter-wrap").classList.toggle("is-open", open);
      if (returnFocus) filterToggle.focus();
    };
    filterToggle.addEventListener("click", () => setFilterPanelOpen(filterPanel.hidden));
    root.querySelector("#find-care-filter-close").addEventListener("click", () => setFilterPanelOpen(false, true));
    root.querySelector("#find-care-filter-done").addEventListener("click", () => setFilterPanelOpen(false, true));
    document.addEventListener("click", (event) => {
      if (filterPanel.hidden) return;
      const clickedList = event.target.closest?.(".custom-select-list");
      const listBelongsToPanel = clickedList && [...filterPanel.querySelectorAll(".custom-select")].some((wrapper) => wrapper._customSelectList === clickedList);
      if (!root.querySelector(".find-care-filter-wrap").contains(event.target) && !listBelongsToPanel) setFilterPanelOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || filterPanel.hidden || event.target.closest?.(".custom-select-list")) return;
      setFilterPanelOpen(false, true);
    });
    updateFilterState();
    if (filterSelects.some((select) => select.id === "clinic-sort" ? select.value === "distance" : Boolean(select.value))) setFilterPanelOpen(true);
    if (
      searchParams.has("radius") &&
      !searchParams.has("lat") &&
      !savedLocation
    )
      root.querySelector("#find-care-location-status").textContent =
        "Choose Near me to apply a distance filter from your current location.";
    const render = async () => {
      updateFilterState();
      const query = root
        .querySelector("#clinic-search")
        .value.toLowerCase()
        .trim();
      const category = root.querySelector("#category-filter").value;
      const specialty = root.querySelector("#specialty-filter").value;
      const barangay = root.querySelector("#barangay-filter").value;
      const status = root.querySelector("#status-filter").value;
      const availability = root.querySelector("#availability-filter").value;
      const sort = root.querySelector("#clinic-sort").value;
      const radius = Number(root.querySelector("#radius-filter").value);
      const latitude = Number(root.querySelector("#patient-latitude").value);
      const longitude = Number(root.querySelector("#patient-longitude").value);
      const hasLocation =
        Number.isFinite(latitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        Number.isFinite(longitude) &&
        longitude >= -180 &&
        longitude <= 180 &&
        root.querySelector("#patient-latitude").value !== "" &&
        root.querySelector("#patient-longitude").value !== "";
      const locationStatus = root.querySelector("#find-care-location-status");
      if (radius && !hasLocation)
        locationStatus.textContent =
          "Choose Near me before searching to apply a distance filter.";
      else if (radius && hasLocation)
        locationStatus.textContent = `Showing clinics within ${radius} km.`;
      const currentAppointments = await api.list("appointments");
      const hasOnDuty = (clinicId) =>
        staff.some(
          (person) =>
            person.clinic_id === clinicId && person.duty_status === "On Duty",
        );
      const openSlotCount = (clinicId) =>
        slots.filter(
          (slot) =>
            slot.clinic_id === clinicId &&
            slot.slot_status === "Available" &&
            isFutureSlot(slot) &&
            staff.some(
              (person) =>
                person.staff_id === slot.staff_id &&
                person.duty_status === "On Duty",
            ) &&
            !currentAppointments.some(
              (appointment) =>
                appointment.slot_id === slot.slot_id &&
                appointment.appointment_status !== "Cancelled",
            ),
        ).length;
      const hasOpenSlots = (clinicId) => openSlotCount(clinicId) > 0;
      const filtered = clinics.filter(
        (c) =>
          (!query ||
            `${c.clinic_name} ${c.clinic_type || ""} ${c.address || ""} ${c.barangay || ""} ${(c.services || []).join(" ")} ${(c.specialties || []).join(" ")}`
              .toLowerCase()
              .includes(query)) &&
          (!category || c.clinic_type === category) &&
          (!specialty || (c.specialties || []).includes(specialty)) &&
          (!barangay || c.barangay === barangay) &&
          (!status || c.clinic_status === status) &&
          (!availability ||
            (availability === "on-duty"
              ? hasOnDuty(c.clinic_id)
              : hasOpenSlots(c.clinic_id))) &&
          (!radius ||
            !hasLocation ||
            (Number.isFinite(Number(c.latitude)) &&
              Number.isFinite(Number(c.longitude)) &&
              distanceKm(latitude, longitude, c.latitude, c.longitude) <=
                radius)),
      );
      const sortedClinics = [...filtered].sort((a, b) => {
        if (sort === "distance" && hasLocation) {
          const hasCoordinates = (clinic) => Number.isFinite(Number(clinic.latitude)) && Number.isFinite(Number(clinic.longitude));
          if (hasCoordinates(a) && hasCoordinates(b)) return distanceKm(latitude, longitude, a.latitude, a.longitude) - distanceKm(latitude, longitude, b.latitude, b.longitude);
          if (hasCoordinates(a)) return -1;
          if (hasCoordinates(b)) return 1;
        }
        return a.clinic_name.localeCompare(b.clinic_name);
      });
      if (sort === "distance" && !hasLocation)
        locationStatus.textContent = "Select Near me to sort by distance. Showing clinics alphabetically for now.";
      root.querySelector("#clinic-result-count").textContent = `${sortedClinics.length} ${sortedClinics.length === 1 ? "clinic" : "clinics"} found`;
      const savedClinicIds = readSavedClinicIds(patientId);
      root.querySelector("#clinic-results").innerHTML = sortedClinics.length
        ? sortedClinics
            .map(
              (
                c,
              ) => `<article class="card clinic-card" data-clinic-id="${escapeHtml(c.clinic_id)}">
        <div class="clinic-card-top"><div class="avatar">${
          safeProfilePhoto(c.profile_photo)
            ? `<img src="${escapeHtml(c.profile_photo)}" alt="">`
            : escapeHtml(
                c.clinic_name
                  .split(" ")
                  .slice(0, 2)
                  .map((x) => x[0])
                  .join(""),
              )
        }</div>${badge(c.clinic_status)}</div>
        <div><p class="eyebrow clinic-card-category">${escapeHtml(c.clinic_type || "Private clinic")}</p><h3>${escapeHtml(c.clinic_name)}</h3><div class="specialties">${(c.specialties || []).map((s) => `<span class="specialty-pill">${escapeHtml(s)}</span>`).join("")}</div></div>
        <p class="clinic-card-services"><strong>Bookable services:</strong> ${escapeHtml((c.services || []).slice(0, 3).join(" · ") || "Not listed")}</p>
        ${c.service_description ? `<p class="muted"><strong>Service details:</strong> ${escapeHtml(c.service_description)}</p>` : ""}
        <div class="meta"><span>⌖ ${escapeHtml(c.address || c.barangay || "Location not listed")}</span><span>◷ ${escapeHtml(c.operating_hours || "Hours not listed")}</span><span>✚ ${staff.filter((s) => s.clinic_id === c.clinic_id && s.duty_status === "On Duty").length} on duty</span><span>${openSlotCount(c.clinic_id)} upcoming slots</span></div>
        <div class="actions"><a class="btn btn-secondary" href="../clinic-detail/clinic-detail.html?id=${encodeURIComponent(c.clinic_id)}">View Details</a>
        <a class="btn btn-primary" href="../booking/booking.html?clinic_id=${encodeURIComponent(c.clinic_id)}">Book</a><button class="btn btn-ghost" type="button" data-save-clinic="${escapeHtml(c.clinic_id)}" aria-pressed="${savedClinicIds.includes(c.clinic_id)}">${savedClinicIds.includes(c.clinic_id) ? "Saved" : "Save Clinic"}</button></div></article>`,
            )
            .join("")
        : '<div class="empty"><div class="empty-icon">⌕</div><strong>No matching clinics</strong><p>Try clearing one or more filters.</p></div>';
      renderClinicPreviewMap(
        "find-care-map",
        sortedClinics.map((clinic) => ({
          clinic,
          href: `../clinic-detail/clinic-detail.html?id=${encodeURIComponent(clinic.clinic_id)}`,
        })),
      )
        .then((map) => {
          root.querySelectorAll("[data-clinic-id]").forEach((card) => {
            card.addEventListener("click", (event) => {
              if (event.target.closest("a, button")) return;
              root
                .querySelectorAll(".clinic-card-selected")
                .forEach((item) =>
                  item.classList.remove("clinic-card-selected"),
                );
              card.classList.add("clinic-card-selected");
              map._lapitcareMarkers.get(card.dataset.clinicId)?.openPopup();
            });
          });
        })
        .catch((error) => {
          const message = root.querySelector("#find-care-map-error");
          if (message)
            message.textContent = `Map unavailable: ${error.message}`;
        });
      root.querySelectorAll("[data-save-clinic]").forEach((button) => button.addEventListener("click", () => {
        const id = button.dataset.saveClinic;
        const current = readSavedClinicIds(patientId);
        const next = current.includes(id) ? current.filter((savedId) => savedId !== id) : [...current, id];
        writeSavedClinicIds(patientId, next);
        button.textContent = next.includes(id) ? "Saved" : "Save Clinic";
        button.setAttribute("aria-pressed", String(next.includes(id)));
        toast(next.includes(id) ? "Clinic saved to your shortlist." : "Clinic removed from your shortlist.");
      }));
    };
    root.querySelector("#clinic-search").addEventListener("input", render);
    root
      .querySelectorAll("select")
      .forEach((element) => element.addEventListener("change", render));
    const resultsLayout = root.querySelector(".find-care-layout");
    root.querySelector("#find-care-map-expand").addEventListener("click", (event) => {
      const expanded = resultsLayout.classList.toggle("is-map-expanded");
      event.currentTarget.textContent = expanded ? "Show list and map" : "Expand map";
      event.currentTarget.setAttribute("aria-expanded", String(expanded));
      if (!expanded && window.matchMedia("(max-width: 700px)").matches) {
        resultsLayout.classList.remove("mobile-map");
        resultsLayout.classList.add("mobile-list");
        root.querySelector("#find-care-list-view").click();
      }
      requestAnimationFrame(() => previewMaps.get("find-care-map")?.invalidateSize({ pan: false }));
    });
    root.querySelector("#find-care-list-view").addEventListener("click", () => {
      resultsLayout.classList.add("mobile-list");
      resultsLayout.classList.remove("mobile-map");
      resultsLayout.classList.remove("is-map-expanded");
      root.querySelector("#find-care-map-expand").textContent = "Expand map";
      root.querySelector("#find-care-map-expand").setAttribute("aria-expanded", "false");
      root.querySelector("#find-care-list-view").classList.add("active");
      root.querySelector("#find-care-map-view").classList.remove("active");
      root.querySelector("#find-care-list-view").setAttribute("aria-pressed", "true");
      root.querySelector("#find-care-map-view").setAttribute("aria-pressed", "false");
    });
    root.querySelector("#find-care-map-view").addEventListener("click", () => {
      resultsLayout.classList.add("mobile-map");
      resultsLayout.classList.remove("mobile-list");
      resultsLayout.classList.add("is-map-expanded");
      root.querySelector("#find-care-map-expand").textContent = "Show list and map";
      root.querySelector("#find-care-map-expand").setAttribute("aria-expanded", "true");
      root.querySelector("#find-care-map-view").classList.add("active");
      root.querySelector("#find-care-list-view").classList.remove("active");
      root.querySelector("#find-care-map-view").setAttribute("aria-pressed", "true");
      root.querySelector("#find-care-list-view").setAttribute("aria-pressed", "false");
      requestAnimationFrame(() => previewMaps.get("find-care-map")?.invalidateSize({ pan: false }));
    });
    if (searchParams.get("view") === "map") root.querySelector("#find-care-map-view").click();
    root.querySelector("#find-care-near-me").addEventListener("click", () => {
      if (!navigator.geolocation) {
        toast("Location access is not available in this browser.");
        return;
      }
      const button = root.querySelector("#find-care-near-me");
      const message = root.querySelector("#find-care-location-status");
      button.disabled = true;
      message.textContent = "Requesting your location…";
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          root.querySelector("#patient-latitude").value = coords.latitude;
          root.querySelector("#patient-longitude").value = coords.longitude;
          saveFindCareLocation(coords.latitude, coords.longitude);
          if (!root.querySelector("#radius-filter").value)
            root.querySelector("#radius-filter").value = "10";
          root.querySelector("#radius-filter")._customSelectRefresh?.();
          message.textContent =
            "Your location is ready. Distance filters are applied.";
          button.disabled = false;
          render();
        },
        () => {
          message.textContent =
            "Location wasn’t available. You can still search by clinic or barangay.";
          button.disabled = false;
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
      );
    });
    root
      .querySelector("#clear-clinic-filters")
      .addEventListener("click", () => {
        root.querySelector("#clinic-search").value = "";
        root.querySelectorAll(".find-care-toolbar select").forEach((select) => {
          select.value = select.id === "clinic-sort" ? "name" : "";
          select._customSelectRefresh?.();
        });
        root.querySelector("#patient-latitude").value = "";
        root.querySelector("#patient-longitude").value = "";
        sessionStorage.removeItem(findCareLocationKey);
        root.querySelector("#find-care-location-status").textContent = "";
        render();
      });
    root.querySelector("#specialty-filter").value =
      searchParams.get("specialty") || "";
    await render();
    startPolling(async () => {
      const [currentClinics, currentStaff, currentSlots] = await Promise.all([
        api.clinics(),
        api.list("staff"),
        api.list("slots"),
      ]);
      clinics.splice(0, clinics.length, ...currentClinics);
      staff = currentStaff;
      slots = currentSlots;
      await render();
    });
    return;
  }

  if (feature === "clinic-detail") {
    const id = new URLSearchParams(location.search).get("id");
    if (!clinics.some((c) => c.clinic_id === id)) {
      root.innerHTML = '<div class="empty">Clinic not found.</div>';
      return;
    }
    const render = async () => {
      const current = await api.clinics();
      clinics.splice(0, clinics.length, ...current);
      const clinic = current.find((c) => c.clinic_id === id);
      if (!clinic) {
        root.innerHTML =
          '<div class="empty">This clinic is no longer published.</div>';
        return;
      }
      const [staff, slots, reviews, appointmentsNow] = await Promise.all([
        api.list("staff"),
        api.list("slots"),
        api.publicFeedback(id),
        api.list("appointments"),
      ]);
      const currentRating = reviews.length
        ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) /
          reviews.length
        : Number(clinic.rating || 0);
      const clinicAddress = [clinic.street_address || clinic.address, clinic.barangay, clinic.city, clinic.province, clinic.postal_code].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(", ") || "Address not provided";
      const specialties = Array.isArray(clinic.specialties) ? clinic.specialties : [];
      const services = Array.isArray(clinic.services) ? clinic.services : [];
      const documents = Array.isArray(clinic.registration_documents) ? clinic.registration_documents : [];
      const availableSlots = slots.filter(
        (s) =>
          s.clinic_id === id &&
          s.slot_status === "Available" &&
          isFutureSlot(s) &&
          staff.some(
            (person) =>
              person.staff_id === s.staff_id &&
              person.duty_status === "On Duty",
          ) &&
          !appointmentsNow.some(
            (appointment) =>
              appointment.slot_id === s.slot_id &&
              appointment.appointment_status !== "Cancelled",
          ),
      );
      root.innerHTML = `<section class="detail-hero card"><div class="clinic-detail-heading"><div class="clinic-detail-photo">${
        safeProfilePhoto(clinic.profile_photo)
          ? `<img src="${escapeHtml(clinic.profile_photo)}" alt="${escapeHtml(clinic.clinic_name)} profile photo">`
          : escapeHtml(
              clinic.clinic_name
                .split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join(""),
            )
      }</div><div class="clinic-detail-intro"><div class="actions clinic-detail-badges">${badge(clinic.clinic_status)}${clinic.verified ? '<span class="badge clinic-verified">✓ Verified</span>' : ""}</div><p class="eyebrow">${escapeHtml(clinic.clinic_type || "Healthcare provider")}</p><h2>${escapeHtml(clinic.clinic_name)}</h2>
        <p class="muted">⌖ ${escapeHtml(clinicAddress)}</p><div class="specialties">${specialties.map((s) => `<span class="specialty-pill">${escapeHtml(s)}</span>`).join("") || '<span class="muted">Specialties not listed</span>'}</div></div><div class="clinic-detail-actions"><strong class="rating">★ ${currentRating.toFixed(1)}</strong><span class="muted">${reviews.length} patient reviews</span><button class="btn btn-secondary" id="clinic-detail-save" type="button" aria-pressed="false">Save Clinic</button></div></div>
        <p class="clinic-detail-description">${escapeHtml(clinic.service_description || "Clinic information and care details are provided by the clinic.")}</p></section>
        <div class="grid detail-grid"><div class="grid clinic-detail-main"><section class="card clinic-detail-section"><p class="eyebrow">Care offered</p><h2 class="section-title">Services & specialties</h2><div class="clinic-detail-services">${services.map((service) => `<span>${escapeHtml(service)}</span>`).join("") || '<p class="muted">Services have not been listed.</p>'}</div></section>
        <section class="card clinic-detail-section"><p class="eyebrow">Plan your visit</p><h2 class="section-title">Location & contact</h2><dl class="clinic-contact-grid"><div><dt>Address</dt><dd>${escapeHtml(clinicAddress)}</dd></div><div><dt>Clinic email</dt><dd>${clinic.email ? `<a href="mailto:${escapeHtml(clinic.email)}">${escapeHtml(clinic.email)}</a>` : "Not provided"}</dd></div><div><dt>Phone</dt><dd>${clinic.contact_number ? `<a href="tel:${escapeHtml(clinic.contact_number)}">${escapeHtml(clinic.contact_number)}</a>` : "Not provided"}</dd></div><div><dt>Website</dt><dd>${clinic.website_url ? `<a href="${escapeHtml(clinic.website_url)}" target="_blank" rel="noopener noreferrer">Visit clinic website</a>` : "Not provided"}</dd></div></dl><div class="clinic-hours"><strong>Operating hours</strong><p>${escapeHtml(clinic.operating_hours || "Hours not provided")}</p></div></section>
        <section class="card clinic-detail-section"><div class="dashboard-section-head"><div><p class="eyebrow">Community experience</p><h2 class="section-title">Patient feedback</h2></div><a href="../feedback/feedback.html?clinic_id=${encodeURIComponent(id)}">Leave feedback</a></div>${reviews.map((f) => `<blockquote class="clinic-review"><div class="rating" aria-label="${Number(f.rating) || 0} out of 5 stars">${"★".repeat(Math.max(0, Math.min(5, Number(f.rating) || 0)))}${"☆".repeat(5 - Math.max(0, Math.min(5, Number(f.rating) || 0)))}</div><p>“${escapeHtml(f.comment)}”</p><small class="muted">${formatDate(f.created_at?.slice(0, 10))}</small></blockquote>`).join("") || '<p class="muted">No patient feedback has been shared for this clinic yet.</p>'}</section>
        <details class="card clinic-registration-details"><summary>Clinic registration information</summary><dl class="clinic-contact-grid"><div><dt>Authorized representative</dt><dd>${escapeHtml(clinic.representative_name || "Not provided")}${clinic.representative_position ? ` · ${escapeHtml(clinic.representative_position)}` : ""}</dd></div><div><dt>License / registration number</dt><dd>${escapeHtml(clinic.license_number || "Not provided")}</dd></div><div><dt>Issuing authority</dt><dd>${escapeHtml(clinic.license_authority || "Not provided")}</dd></div><div><dt>License expiry</dt><dd>${escapeHtml(clinic.license_expiry || "Not provided")}</dd></div></dl>${documents.length ? `<p class="muted">Supporting files supplied: ${documents.map((document) => escapeHtml(document.name || "Document")).join(", ")}. Files are not independently verified.</p>` : '<p class="muted">No supporting files listed.</p>'}</details></div>
        <aside class="grid clinic-detail-aside"><section class="card queue-card"><span class="eyebrow">Clinic queue</span><div class="stat-value">${Number(clinic.queue_count || 0)}</div><p>Estimated wait: ${Number(clinic.estimated_wait_minutes || 0)} minutes</p></section>
        <section class="card clinic-booking-card"><p class="eyebrow">Appointment availability</p><h3>Plan your visit</h3><p class="muted">${availableSlots.length} upcoming schedules${availableSlots.length ? " are currently available" : " listed"}.</p>
        ${clinic.clinic_status === "Closed" || !availableSlots.length ? '<div class="notice">No appointment schedules are currently available.</div>' : `<a class="btn btn-primary" href="../booking/booking.html?clinic_id=${encodeURIComponent(id)}">Book appointment</a>`}</section><section class="card"><p class="eyebrow">Clinic team</p><h3>Staff availability</h3><div class="list">${staff.filter((s) => s.clinic_id === id).map((s) => `<div class="list-item"><div><strong>${escapeHtml(s.staff_name)}</strong><div class="muted">${escapeHtml(s.specialty_name || "Clinic staff")}</div></div>${badge(s.duty_status)}</div>`).join("") || '<p class="muted">Staff details are not listed.</p>'}</div></section></aside></div>`;
      const savedButton = root.querySelector("#clinic-detail-save");
      const savedIds = readSavedClinicIds(patientId);
      savedButton.textContent = savedIds.includes(id) ? "Saved" : "Save Clinic";
      savedButton.setAttribute("aria-pressed", String(savedIds.includes(id)));
      savedButton.addEventListener("click", () => {
        const currentIds = readSavedClinicIds(patientId);
        const nextIds = currentIds.includes(id)
          ? currentIds.filter((savedId) => savedId !== id)
          : [...currentIds, id];
        writeSavedClinicIds(patientId, nextIds);
        savedButton.textContent = nextIds.includes(id) ? "Saved" : "Save Clinic";
        savedButton.setAttribute("aria-pressed", String(nextIds.includes(id)));
        toast(nextIds.includes(id) ? "Clinic saved to your shortlist." : "Clinic removed from your shortlist.");
      });
    };
    await render();
    startPolling(render);
    return;
  }

  if (feature === "booking") {
    let [staff, slots, schedules] = await Promise.all([
      api.list("staff"),
      api.list("slots"),
      api.list("schedules"),
    ]);
    let bookingAppointments = appointments;
    root.innerHTML = `<div class="booking-shell"><form class="booking-form" id="booking-form" novalidate>
      <nav class="booking-stepper" aria-label="Appointment booking progress"><ol><li class="is-current" data-booking-step="1" aria-current="step"><span>1</span><small>Clinic & service</small></li><li data-booking-step="2"><span>2</span><small>Date & time</small></li><li data-booking-step="3"><span>3</span><small>Visit details</small></li><li data-booking-step="4"><span>4</span><small>Review</small></li></ol><p id="booking-step-status" class="muted" aria-live="polite">Step 1 of 4 · Clinic & service</p></nav>
      <section class="card booking-section"><p class="eyebrow">STEP 1 · CLINIC & SERVICE</p><h2>Choose where you’d like to go</h2><p class="muted">Select an approved clinic, then choose one of its listed services. Clinic details will appear below so you can check the location and hours before continuing.</p>
        <div class="booking-choice-grid"><div class="field"><label for="book-clinic">Clinic</label><select class="select" id="book-clinic" required><option value="">Select a clinic</option>${clinics.map((c) => `<option value="${escapeHtml(c.clinic_id)}">${escapeHtml(c.clinic_name)} — ${escapeHtml(c.barangay)}</option>`).join("")}</select></div>
        <div class="field"><label for="book-service">Service</label><select class="select" id="book-service" required disabled><option value="">Choose a clinic first</option></select></div></div>
        <div class="notice booking-clinic-info" id="booking-clinic-info">Choose a clinic to see its specialties, services, and availability.</div>
      </section>
      <section class="card booking-section"><p class="eyebrow">STEP 2 · SCHEDULE</p><h2>Choose an available date and time</h2><p class="muted">Pick a highlighted day first, then choose a time that fits your schedule. A time is held only after your request is submitted.</p><div class="booking-schedule-grid">
        <div class="field"><p class="field-label" id="book-date-label">Choose a date</p><div class="booking-calendar" aria-labelledby="book-date-label"><div class="booking-calendar-header"><button type="button" class="calendar-nav" id="booking-calendar-prev" aria-label="Previous month">‹</button><h3 id="booking-calendar-month" aria-live="polite"></h3><button type="button" class="calendar-nav" id="booking-calendar-next" aria-label="Next month">›</button></div><div class="calendar-weekdays" aria-hidden="true"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div><div class="booking-calendar-days" id="booking-calendar-days" role="group" aria-label="Select an available appointment date"></div><p class="booking-calendar-legend"><span></span> Available appointments</p></div><select class="booking-data-source" id="book-date" data-native-select required disabled aria-hidden="true" tabindex="-1"><option value="">Choose a clinic and service first</option></select></div>
        <div class="field"><p class="field-label" id="book-time-label">Available appointment times</p><div class="booking-time-options" id="booking-time-options" role="group" aria-labelledby="book-time-label"><p class="muted">Choose a date to see available times.</p></div><select class="booking-data-source" id="book-slot" data-native-select required disabled aria-hidden="true" tabindex="-1"><option value="">Choose a date first</option></select></div>
        </div><p class="muted booking-staff-hint" id="booking-staff-hint">A qualified on-duty provider will be assigned from the clinic schedule.</p>
      </section>
      <section class="card booking-section"><p class="eyebrow">STEP 3 · VISIT DETAILS</p><h2>How can the clinic reach you?</h2><p class="muted">Your account contact details are filled in for you. Update them if you need the clinic to use different details for this visit.</p>
        <div class="booking-account-contact"><span>Patient</span><strong>${escapeHtml(patient.name || "Patient account")}</strong><span>Contact details from your account</span></div>
        <div class="booking-contact-grid"><div class="field"><label for="book-email">Email address</label><input class="input" id="book-email" type="email" value="${escapeHtml(patient.email || "")}" autocomplete="email" required></div>
        <div class="field"><label for="book-phone">Contact number</label><input class="input" id="book-phone" type="tel" value="${escapeHtml(patient.mobile_number || "")}" autocomplete="tel" required></div></div>
        <div class="field"><p class="field-label">Common reasons</p><p class="muted booking-reason-hint">Choose a suggestion to fill the note, then edit it if needed.</p><div class="booking-reason-options" id="booking-reason-options" role="group" aria-label="Common visit reasons">${["General consultation", "Follow-up visit", "Dental check-up", "Vaccination", "Lab results review", "Preventive health check"].map((reason) => `<button type="button" class="booking-reason-chip" data-visit-reason="${escapeHtml(reason)}" aria-pressed="false">${escapeHtml(reason)}</button>`).join("")}</div><label for="book-reason">Reason for visit</label><textarea class="textarea" id="book-reason" maxlength="500" required placeholder="Briefly describe what you need help with"></textarea><small class="muted">Keep medical details brief; do not include highly sensitive information.</small></div>
      </section>
      <section class="card booking-summary"><p class="eyebrow">STEP 4 · FINAL CHECK</p><h2>Review your appointment request</h2><p class="muted">Check each part before sending your request to the clinic.</p><div id="booking-review" class="booking-review">Your appointment details will appear here as you complete each step.</div>
        <div class="notice booking-pending-note"><strong>What happens next?</strong><p>Your request will be marked Pending. The appointment is not confirmed until the clinic accepts it.</p></div></section>
      <div class="booking-controls"><p class="form-error" id="booking-error" role="alert" aria-live="polite"></p><div class="actions"><button type="button" class="btn btn-secondary" id="booking-back">Back</button><button type="button" class="btn btn-primary" id="booking-next">Continue</button><button type="submit" class="btn btn-primary hidden" id="booking-submit">Send appointment request</button></div></div>
      </form></div>`;
    setupCustomSelects(root);
    const q = (selector) => root.querySelector(selector);
    let bookingStep = 1;
    const setBookingStep = (step) => {
      bookingStep = Math.max(1, Math.min(4, step));
      root.querySelectorAll("[data-booking-step]").forEach((item) => {
        const itemStep = Number(item.dataset.bookingStep);
        const active = itemStep === bookingStep;
        item.classList.toggle("is-current", active);
        item.classList.toggle("is-complete", itemStep < bookingStep);
        item.querySelector("span").textContent = itemStep < bookingStep ? "✓" : String(itemStep);
        if (active) item.setAttribute("aria-current", "step");
        else item.removeAttribute("aria-current");
      });
      q("#booking-step-status").textContent = `Step ${bookingStep} of 4 · ${["Clinic & service", "Date & time", "Visit details", "Review & submit"][bookingStep - 1]}`;
      root.querySelectorAll(".booking-section, .booking-summary").forEach((section, index) => {
        const visible = bookingStep === 4
          ? section.classList.contains("booking-summary")
          : index + 1 === bookingStep;
        section.classList.toggle("booking-step-hidden", !visible);
      });
      q("#booking-back").disabled = bookingStep === 1;
      q("#booking-next").classList.toggle("hidden", bookingStep === 4);
      q("#booking-submit").classList.toggle("hidden", bookingStep !== 4);
      q("#booking-error").textContent = "";
      q("#booking-error").classList.remove("is-visible");
    };
    setBookingStep(1);
    const clinicSelect = q("#book-clinic");
    clinicSelect.value =
      new URLSearchParams(location.search).get("clinic_id") || "";
    clinicSelect._customSelectRefresh?.();
    const selectedClinic = () =>
      clinics.find((clinic) => clinic.clinic_id === clinicSelect.value);
    const selectedDate = () => q("#book-date").value;
    const selectedService = () => q("#book-service").value;
    const validContactNumber = (value) => /^[+\d][\d\s()\-]{6,19}$/.test(value.trim()) && value.replace(/\D/g, "").length >= 7;
    const validEmailAddress = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
    const selectedSlot = () =>
      slots.find((slot) => slot.slot_id === q("#book-slot").value);
    const serviceRequirement = (service) => {
      const name = service.toLowerCase();
      if (name.includes("dental")) return "Dentistry";
      if (name.includes("skin")) return "Dermatology";
      if (name.includes("pediatric")) return "Pediatrics";
      if (name.includes("eye")) return "Ophthalmology / Optometry";
      return "";
    };
    const serviceIsSupported = (clinic, service) => {
      const requiredSpecialty = serviceRequirement(service);
      return Boolean(
        clinic &&
        (!requiredSpecialty || clinic.specialties.includes(requiredSpecialty)),
      );
    };
    const clinicStaff = (clinic, service = "") =>
      clinic && serviceIsSupported(clinic, service)
        ? staff.filter(
            (provider) => {
              const requiredSpecialty = serviceRequirement(service);
              return provider.clinic_id === clinic.clinic_id &&
                provider.duty_status === "On Duty" &&
                (requiredSpecialty
                  ? provider.specialty_name === requiredSpecialty
                  : clinic.specialties.includes(provider.specialty_name) ||
                    provider.assigned_services?.includes(service));
            },
          )
        : [];
    const availableSlots = (clinic, date = "", service = "") => {
      if (!clinic || clinic.clinic_status === "Closed") return [];
      const eligibleStaff = clinicStaff(clinic, service);
      const serviceDuration = Number(clinic.service_catalog?.find((item) => item.name === service)?.duration) || 30;
      const minuteOf = (time) => { const [hours, minutes] = String(time || "").split(":").map(Number); return (hours || 0) * 60 + (minutes || 0); };
      return slots
        .filter(
          (slot) =>
            slot.clinic_id === clinic.clinic_id &&
            slot.slot_status === "Available" &&
            isFutureSlot(slot) &&
            (!date || slot.slot_date === date) &&
            eligibleStaff.some(
              (provider) => {
                if (provider.staff_id !== slot.staff_id) return false;
                if (provider.active === false || provider.assigned_services?.length && !provider.assigned_services.includes(service)) return false;
                if ((clinic.closures || []).some((closure) => slot.slot_date >= closure.start_date && slot.slot_date <= closure.end_date)) return false;
                const weekday = new Date(`${slot.slot_date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Manila" });
                const shifts = schedules.filter((shift) => shift.clinic_id === clinic.clinic_id && shift.staff_id === provider.staff_id);
                if (shifts.length && !shifts.some((shift) => (shift.weekday || "").toLowerCase().includes(weekday.toLowerCase()) && slot.start_time >= shift.start_time && minuteOf(slot.start_time) + serviceDuration <= minuteOf(shift.end_time))) return false;
                const hours = clinic.operating_schedule?.[weekday];
                if (hours && (hours.closed || slot.start_time < hours.open || minuteOf(slot.start_time) + serviceDuration > minuteOf(hours.close))) return false;
                if ((clinic.staff_unavailability || []).some((leave) => leave.staff_id === provider.staff_id && slot.slot_date >= leave.start_date && slot.slot_date <= leave.end_date)) return false;
                const duration = Number(slot.duration_minutes) || serviceDuration;
                const start = minuteOf(slot.start_time);
                const overlap = bookingAppointments.some((appointment) => appointment.staff_id === provider.staff_id && appointment.appointment_date === slot.slot_date && ["Pending", "Confirmed", "Completed"].includes(appointment.appointment_status) && appointment.slot_id !== slot.slot_id && start < minuteOf(appointment.appointment_time) + (Number(appointment.duration_minutes) || duration) && start + serviceDuration > minuteOf(appointment.appointment_time));
                return !overlap;
              },
            ) &&
            !bookingAppointments.some(
              (appointment) =>
                appointment.slot_id === slot.slot_id &&
                appointment.appointment_status !== "Cancelled",
            ),
        )
        .sort((a, b) =>
          `${a.slot_date}${a.start_time}`.localeCompare(
            `${b.slot_date}${b.start_time}`,
          ),
        );
    };
    let visibleCalendarMonth = new Date();
    visibleCalendarMonth.setDate(1);
    const availableBookingDates = () => selectedService()
      ? [...new Set(availableSlots(selectedClinic(), "", selectedService()).map((slot) => slot.slot_date))].sort()
      : [];
    const renderBookingCalendar = () => {
      const calendarDays = q("#booking-calendar-days");
      const slotsByDate = new Map();
      const calendarSlots = selectedService() ? availableSlots(selectedClinic(), "", selectedService()) : [];
      calendarSlots.forEach((slot) => {
        slotsByDate.set(slot.slot_date, [...(slotsByDate.get(slot.slot_date) || []), slot]);
      });
      const dates = [...slotsByDate.keys()].sort();
      const monthKey = (date) => date.slice(0, 7);
      const availableMonths = [...new Set(dates.map(monthKey))];
      if (availableMonths.length && !availableMonths.includes(`${visibleCalendarMonth.getFullYear()}-${String(visibleCalendarMonth.getMonth() + 1).padStart(2, "0")}`)) {
        const firstMonth = availableMonths[0].split("-").map(Number);
        visibleCalendarMonth = new Date(firstMonth[0], firstMonth[1] - 1, 1);
      }
      q("#booking-calendar-month").textContent = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric" }).format(visibleCalendarMonth);
      const currentMonthKey = `${visibleCalendarMonth.getFullYear()}-${String(visibleCalendarMonth.getMonth() + 1).padStart(2, "0")}`;
      const currentMonthDates = dates.filter((date) => monthKey(date) === currentMonthKey);
      q("#booking-calendar-prev").disabled = !availableMonths.some((month) => month < currentMonthKey);
      q("#booking-calendar-next").disabled = !availableMonths.some((month) => month > currentMonthKey);
      if (!dates.length) {
        const clinic = selectedClinic();
        const service = selectedService();
        const message = !clinic || !service
          ? "Select a clinic and service to see available appointment dates."
          : clinic.clinic_status === "Closed"
            ? "This clinic is marked Closed and is not accepting appointment requests."
            : !clinicStaff(clinic, service).length
              ? "This clinic has no on-duty provider available for this service."
              : "No future appointment slots are available for this clinic and service. The clinic must publish future slots for an on-duty provider.";
        calendarDays.innerHTML = `<p class="booking-calendar-empty">${escapeHtml(message)}</p>`;
        return;
      }
      const first = new Date(visibleCalendarMonth.getFullYear(), visibleCalendarMonth.getMonth(), 1);
      const offset = (first.getDay() + 6) % 7;
      const count = new Date(visibleCalendarMonth.getFullYear(), visibleCalendarMonth.getMonth() + 1, 0).getDate();
      const blanks = Array.from({ length: offset }, () => '<span class="booking-calendar-blank" aria-hidden="true"></span>').join("");
      const days = Array.from({ length: count }, (_, index) => {
        const number = index + 1;
        const date = `${currentMonthKey}-${String(number).padStart(2, "0")}`;
        const countForDate = slotsByDate.get(date)?.length || 0;
        const disabled = !currentMonthDates.includes(date) || !countForDate;
        const labelDate = formatDate(date);
        const selected = date === selectedDate();
        return `<button type="button" class="booking-calendar-day ${disabled ? "is-unavailable" : "is-available"} ${selected ? "is-selected" : ""}" data-booking-date="${date}" aria-pressed="${selected}" ${selected ? 'aria-current="date"' : ""} aria-label="${escapeHtml(labelDate)}${disabled ? ", unavailable" : `, ${countForDate} available time${countForDate === 1 ? "" : "s"}`}" ${disabled ? "disabled" : ""}><span>${number}</span>${disabled ? "" : `<small>${countForDate} time${countForDate === 1 ? "" : "s"}</small>`}</button>`;
      }).join("");
      calendarDays.innerHTML = `${blanks}${days}`;
      calendarDays.querySelectorAll("[data-booking-date]").forEach((button) => button.addEventListener("click", () => {
        q("#book-date").value = button.dataset.bookingDate;
        q("#book-date").dispatchEvent(new Event("change", { bubbles: true }));
        calendarDays.querySelector(`[data-booking-date="${button.dataset.bookingDate}"]`)?.focus();
      }));
    };
    q("#booking-calendar-prev").addEventListener("click", () => {
      const current = `${visibleCalendarMonth.getFullYear()}-${String(visibleCalendarMonth.getMonth() + 1).padStart(2, "0")}`;
      const previous = [...new Set(availableBookingDates().map((date) => date.slice(0, 7)))].filter((month) => month < current).sort().at(-1);
      if (!previous) return;
      const [year, month] = previous.split("-").map(Number);
      visibleCalendarMonth = new Date(year, month - 1, 1);
      renderBookingCalendar();
    });
    q("#booking-calendar-next").addEventListener("click", () => {
      const current = `${visibleCalendarMonth.getFullYear()}-${String(visibleCalendarMonth.getMonth() + 1).padStart(2, "0")}`;
      const next = [...new Set(availableBookingDates().map((date) => date.slice(0, 7)))].filter((month) => month > current).sort()[0];
      if (!next) return;
      const [year, month] = next.split("-").map(Number);
      visibleCalendarMonth = new Date(year, month - 1, 1);
      renderBookingCalendar();
    });
    const refreshServices = () => {
      const clinic = selectedClinic();
      const previous = q("#book-service").value;
      const services =
        clinic && clinic.clinic_status !== "Closed"
          ? (clinic.services || []).filter((service) =>
              serviceIsSupported(clinic, service),
            )
          : [];
      q("#book-service").disabled = !services.length;
      q("#book-service").innerHTML =
        `<option value="">${services.length ? "Select a service" : "No services available"}</option>${services.map((service) => `<option value="${escapeHtml(service)}">${escapeHtml(service)}</option>`).join("")}`;
      if (services.includes(previous)) q("#book-service").value = previous;
      q("#book-service")._customSelectRefresh?.();
      q("#booking-clinic-info").innerHTML = clinic
        ? `<strong>${escapeHtml(clinic.clinic_name)}</strong><dl class="booking-clinic-facts"><div><dt>Specialties</dt><dd>${escapeHtml((clinic.specialties || []).join(", ") || "Not listed")}</dd></div><div><dt>Location</dt><dd>${escapeHtml([clinic.address, clinic.barangay].filter(Boolean).join(", ") || "Not listed")}</dd></div><div><dt>Operating hours</dt><dd>${escapeHtml(clinic.operating_hours || "Not listed")}</dd></div><div><dt>Providers on duty</dt><dd>${clinicStaff(clinic, q("#book-service").value).length} available for selected service</dd></div></dl>`
        : "Choose a clinic to see its specialties, services, and availability.";
      refreshDates();
    };
    const refreshSlots = () => {
      const clinic = selectedClinic();
      const previous = q("#book-slot").value;
      const options = selectedService() && selectedDate()
        ? availableSlots(clinic, selectedDate(), selectedService())
        : [];
      q("#book-slot").disabled = !options.length;
      q("#book-slot").innerHTML =
        `<option value="">${options.length ? "Select an appointment time" : "No times available for this date"}</option>${options
          .map((slot) => {
            const provider = staff.find(
              (item) => item.staff_id === slot.staff_id,
            );
            return `<option value="${escapeHtml(slot.slot_id)}">${escapeHtml(slot.start_time)} · ${escapeHtml(provider?.staff_name || "Clinic provider")}</option>`;
          })
          .join("")}`;
      if (options.some((slot) => slot.slot_id === previous))
        q("#book-slot").value = previous;
      const selectedId = q("#book-slot").value;
      q("#booking-time-options").innerHTML = options.length
        ? options.map((slot) => {
            const provider = staff.find((item) => item.staff_id === slot.staff_id);
            return `<button type="button" class="booking-time-card ${slot.slot_id === selectedId ? "is-selected" : ""}" data-booking-slot="${escapeHtml(slot.slot_id)}" aria-pressed="${slot.slot_id === selectedId}"><span class="booking-time-icon" aria-hidden="true">◷</span><span class="booking-time-copy"><strong>${escapeHtml(formatTime(slot.start_time))}</strong><small>${escapeHtml(provider?.staff_name || "Clinic provider")}</small></span><span class="booking-time-check" aria-hidden="true">✓</span></button>`;
          }).join("")
        : `<p class="booking-calendar-empty">${selectedDate() ? "No appointment times are available on this date. Choose another highlighted date." : "Choose a highlighted date to see the available appointment times."}</p>`;
      q("#booking-time-options").querySelectorAll("[data-booking-slot]").forEach((button) => button.addEventListener("click", () => {
        const slotId = button.dataset.bookingSlot;
        if (!options.some((slot) => slot.slot_id === slotId)) return;

        q("#book-slot").value = slotId;
        q("#booking-time-options").querySelectorAll("[data-booking-slot]").forEach((option) => {
          const isSelected = option.dataset.bookingSlot === slotId;
          option.classList.toggle("is-selected", isSelected);
          option.setAttribute("aria-pressed", String(isSelected));
        });
        q("#book-slot").dispatchEvent(new Event("change", { bubbles: true }));
        refreshSummary();
      }));
      renderBookingCalendar();
      refreshSummary();
    };
    const refreshDates = () => {
      const clinic = selectedClinic();
      const previous = selectedDate();
      const service = selectedService();
      const dates = [
        ...new Set(
          availableSlots(clinic, "", service).map((slot) => slot.slot_date),
        ),
      ];
      q("#book-date").disabled = !dates.length || !service;
      q("#book-date").innerHTML =
        `<option value="">${dates.length ? "Select an available date" : "No available dates"}</option>${dates.map((date) => `<option value="${escapeHtml(date)}">${formatDate(date)}</option>`).join("")}`;
      if (dates.includes(previous)) q("#book-date").value = previous;
      else if (dates.length === 1) q("#book-date").value = dates[0];
      const providers = clinicStaff(clinic, service);
      q("#booking-staff-hint").textContent = !clinic || !service
        ? "Choose a clinic and service to see published appointment times."
        : !providers.length
          ? "No on-duty provider is currently listed for this service. You can continue reviewing the steps, but this clinic cannot accept a request until a provider is scheduled."
          : !dates.length
            ? "No future appointment times are currently published for this service. You can continue reviewing the steps, then choose a clinic with an available schedule before submitting."
            : `${dates.length} date${dates.length === 1 ? "" : "s"} currently have published availability for this service.`;
      refreshSlots();
    };
    const refreshSummary = () => {
      const clinic = selectedClinic();
      const slot = selectedSlot();
      const provider =
        slot && staff.find((item) => item.staff_id === slot.staff_id);
      const item = (label, value) => `<div><dt>${label}</dt><dd>${escapeHtml(value || "Not selected")}</dd></div>`;
      q("#booking-review").innerHTML = `<section class="booking-review-group"><h3>Clinic & service</h3><dl>${item("Clinic", clinic?.clinic_name)}${item("Service", selectedService())}</dl></section><section class="booking-review-group"><h3>Date & time</h3><dl>${item("Appointment date", slot ? formatDate(slot.slot_date) : "")}${item("Available time", slot ? formatTime(slot.start_time) : "")}${item("Provider", provider ? `${provider.staff_name} · ${provider.specialty_name}` : "")}</dl></section><section class="booking-review-group"><h3>Your visit</h3><dl>${item("Patient", patient.name)}${item("Email address", q("#book-email").value.trim())}${item("Contact number", q("#book-phone").value.trim())}${item("Reason for visit", q("#book-reason").value.trim())}</dl></section>`;
    };
    const refreshBookingData = async () => {
      const [currentStaff, currentSlots, currentAppointments, currentClinics, currentSchedules] =
        await Promise.all([
          api.list("staff"),
          api.list("slots"),
          api.list("appointments"),
          api.clinics(),
          api.list("schedules"),
        ]);
      const selectedClinic = clinicSelect.value;
      staff = currentStaff;
      slots = currentSlots;
      schedules = currentSchedules;
      bookingAppointments = currentAppointments;
      clinics.splice(0, clinics.length, ...currentClinics);
      clinicSelect.innerHTML = `<option value="">Select a clinic</option>${clinics.map((c) => `<option value="${escapeHtml(c.clinic_id)}">${escapeHtml(c.clinic_name)} — ${escapeHtml(c.barangay)}</option>`).join("")}`;
      if (clinics.some((clinic) => clinic.clinic_id === selectedClinic))
        clinicSelect.value = selectedClinic;
      clinicSelect._customSelectRefresh?.();
      refreshServices();
    };
    clinicSelect.addEventListener("change", refreshServices);
    q("#book-service").addEventListener("change", refreshDates);
    q("#book-date").addEventListener("change", refreshSlots);
    q("#book-email").addEventListener("input", refreshSummary);
    q("#book-phone").addEventListener("input", refreshSummary);
    q("#book-reason").addEventListener("input", () => {
      const reason = q("#book-reason").value.trim();
      root.querySelectorAll("[data-visit-reason]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.visitReason === reason)));
      refreshSummary();
    });
    root.querySelectorAll("[data-visit-reason]").forEach((button) => button.addEventListener("click", () => {
      q("#book-reason").value = button.dataset.visitReason;
      root.querySelectorAll("[data-visit-reason]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      refreshSummary();
    }));
    q("#booking-back").addEventListener("click", () => setBookingStep(bookingStep - 1));
    q("#booking-next").addEventListener("click", () => {
      q("#booking-error").classList.remove("is-visible");
      setBookingStep(bookingStep + 1);
    });
    const stopPolling = startPolling(refreshBookingData);
    q("#booking-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      q("#booking-error").textContent = "";
      q("#booking-error").classList.remove("is-visible");
      const submit = q("#booking-submit");
      if (submit.disabled) return;
      submit.disabled = true;
      let committedAppointment = null;
      try {
        const clinic = selectedClinic();
        const slot = selectedSlot();
        const provider =
          slot && staff.find((s) => s.staff_id === slot.staff_id);
        const service = selectedService();
        const email = q("#book-email").value.trim();
        const phone = q("#book-phone").value.trim();
        const reason = q("#book-reason").value.trim();
        const latest = await api.list("appointments");
        const eligibility = canBook(clinic, provider, latest, slot, patientId);
        const validationError = !clinic
          ? "Choose a clinic."
          : !service
            ? "Choose an available service at the selected clinic."
            : !(clinic.services || []).includes(service) ||
                !serviceIsSupported(clinic, service)
              ? "The selected service is not available at this clinic. Choose another service."
              : !validEmailAddress(email)
                ? "Enter a valid email address so the clinic can contact you."
                : !validContactNumber(phone)
                  ? "Enter a valid contact number so the clinic can reach you."
                  : !reason
                    ? "Enter a reason for your visit or choose one of the suggested reasons."
                    : !slot
                      ? "Choose an available appointment date and time."
                      : "";
        if (validationError) {
          q("#booking-error").textContent = validationError;
          q("#booking-error").classList.add("is-visible");
          submit.disabled = false;
          return;
        }
        if (!eligibility.ok) {
          q("#booking-error").textContent = eligibility.message;
          q("#booking-error").classList.add("is-visible");
          submit.disabled = false;
          await refreshBookingData();
          return;
        }
        let reference = "";
        const createdAt = new Date().toISOString();
        const newAppointment = {
          appointment_id: `apt_${Date.now()}`,
          reference_number: reference,
          patient_id: patientId,
          clinic_id: clinic.clinic_id,
          staff_id: provider.staff_id,
          slot_id: slot.slot_id,
          appointment_date: slot.slot_date,
          appointment_time: slot.start_time,
          service_name: service,
          visit_reason: reason,
          contact_email: email,
          contact_number: phone,
          appointment_status: "Pending",
          status_history: [{ status: "Pending", at: createdAt, note: "Request sent to clinic for review." }],
          created_at: createdAt,
        };
        const savedAppointment = await api.create("appointments", newAppointment);
        reference = savedAppointment.reference_number;
        committedAppointment = savedAppointment;
        await api.update(
          "slots",
          slot.slot_id,
          { slot_status: "Booked" },
          "slot_id",
        );
        await saveNotification(
          patientId,
          `Your request ${reference} was sent to ${clinic.clinic_name}.`,
        );
        try {
          await api.notify(
            "system_admin",
            `New appointment request ${reference} for ${clinic.clinic_name}.`,
            "Appointment request",
            { reference_type: "appointment", reference_id: savedAppointment.appointment_id, clinic_id: clinic.clinic_id },
          );
        } catch (notificationError) {
          console.warn("The admin appointment notification could not be saved.", notificationError);
        }
        stopPolling();
        root.innerHTML = `<div class="card success-state"><div class="success-check">✓</div><h2>Appointment request sent</h2><p>Your reference is ${escapeHtml(reference)}. This request is pending; the clinic must approve it before it becomes confirmed.</p><a class="btn btn-primary" href="../appointments/appointments.html">View appointments</a></div>`;
      } catch (error) {
        console.error(error);
        if (committedAppointment) {
          stopPolling();
          root.innerHTML = `<div class="card success-state"><div class="success-check">✓</div><h2>Appointment request saved</h2><p>Your request ${escapeHtml(committedAppointment.reference_number)} is stored as Pending. A supporting update could not be saved: ${escapeHtml(error.message)}.</p><a class="btn btn-primary" href="../appointments/appointments.html">View appointments</a></div>`;
          return;
        }
        q("#booking-error").textContent =
          `Your request could not be sent: ${error.message}`;
        q("#booking-error").classList.add("is-visible");
        submit.disabled = false;
      }
    });
    refreshServices();
    refreshSummary();
    return;
  }

  if (feature === "appointments") {
    root.innerHTML = `<div class="tabs">${["Upcoming", "Pending", "Confirmed", "Completed", "Cancelled"].map((status, index) => `<button class="tab ${index === 0 ? "active" : ""}" data-status="${status}">${status}</button>`).join("")}</div><div class="toolbar"><input class="input" id="appointment-search" type="search" placeholder="Search clinic, service, or reference"><input class="input" id="appointment-date-filter" type="date" aria-label="Filter appointments by date"></div><div class="list" id="appointments-list"></div>`;
    const requestedStatus = new URLSearchParams(location.search).get("status");
    const validStatuses = [
      "Upcoming",
      "Pending",
      "Confirmed",
      "Completed",
      "Cancelled",
    ];
    let activeStatus = validStatuses.includes(requestedStatus)
      ? requestedStatus
      : "Upcoming";
    const dismissedKey = `lapitcare_dismissed_appointments_${patientId}`;
    const readDismissed = () => {
      try {
        return new Set(JSON.parse(localStorage.getItem(dismissedKey) || "[]"));
      } catch {
        return new Set();
      }
    };
    root
      .querySelectorAll(".tab")
      .forEach((tab) =>
        tab.classList.toggle("active", tab.dataset.status === activeStatus),
      );
    const render = async (status) => {
      const current = (await api.list("appointments")).filter(
        (a) => a.patient_id === patientId,
      );
      const relevant = status === "Upcoming" ? ["Pending", "Confirmed", "Cancellation Requested", "Reschedule Requested"] : status === "Pending" ? ["Pending", "Cancellation Requested"] : status === "Confirmed" ? ["Confirmed", "Reschedule Requested"] : [status];
      const dismissed = readDismissed();
      const searchText = root.querySelector("#appointment-search").value.trim().toLowerCase();
      const dateFilter = root.querySelector("#appointment-date-filter").value;
      const rows = current.filter(
        (a) =>
          relevant.includes(a.appointment_status) &&
          !(status === "Cancelled" && dismissed.has(a.appointment_id)) &&
          (!dateFilter || a.appointment_date === dateFilter) &&
          (!searchText || `${a.reference_number} ${clinicName(a.clinic_id, clinics)} ${a.service_name || ""}`.toLowerCase().includes(searchText)) &&
          (status !== "Upcoming" || manilaDateTime(a.appointment_date, a.appointment_time).getTime() > Date.now()),
      );
      const feedbackRows = await api.list("feedback");
      root.querySelector("#appointments-list").innerHTML = rows.length
        ? rows
            .map((a) => {
              const hasFeedback = feedbackRows.some(
                (feedback) => feedback.appointment_id === a.appointment_id,
              );
              const history = Array.isArray(a.status_history) ? a.status_history : [{ status: a.appointment_status, at: a.updated_at || a.created_at, note: "Current status" }];
              const cancellationRequested = a.appointment_status === "Cancellation Requested";
              const rescheduleRequested = a.appointment_status === "Reschedule Requested";
              return `<article class="card appointment-card" data-appointment-id="${escapeHtml(a.appointment_id)}">
        <div><p class="eyebrow">${escapeHtml(a.reference_number)}</p><h3>${escapeHtml(clinicName(a.clinic_id, clinics))}</h3><p>${escapeHtml(a.service_name || "Appointment")} · ${formatDate(a.appointment_date)} · ${escapeHtml(a.appointment_time)}</p>${a.visit_reason ? `<p class="muted">${escapeHtml(a.visit_reason)}</p>` : ""}${a.requested_reschedule ? `<p class="notice">Requested new time: ${formatDate(a.requested_reschedule.appointment_date)} at ${escapeHtml(a.requested_reschedule.appointment_time)}</p>` : ""}<details class="appointment-detail"><summary>View details & status history</summary><p><strong>Booking reference:</strong> ${escapeHtml(a.reference_number)}</p><p><strong>Contact:</strong> ${escapeHtml(a.contact_number || "Not provided")}</p><p><strong>Cancellation reason:</strong> ${escapeHtml(a.cancellation_reason || "None")}</p><ol>${history.map((entry) => `<li>${escapeHtml(entry.status)}${entry.at ? ` · ${escapeHtml(new Date(entry.at).toLocaleString())}` : ""}${entry.note ? ` — ${escapeHtml(entry.note)}` : ""}</li>`).join("")}</ol></details></div>
        <div class="actions">${badge(a.appointment_status)}${["Pending", "Confirmed"].includes(a.appointment_status) ? `<button class="btn btn-secondary" data-reschedule="${escapeHtml(a.appointment_id)}">Request reschedule</button><button class="btn btn-danger" data-cancel="${escapeHtml(a.appointment_id)}">${a.appointment_status === "Confirmed" ? "Request cancellation" : "Cancel request"}</button>` : cancellationRequested || rescheduleRequested ? '<span class="muted">Waiting for clinic response</span>' : ""}${a.appointment_status === "Completed" ? `<a class="btn btn-secondary" href="../feedback/feedback.html?appointment_id=${encodeURIComponent(a.appointment_id)}">${hasFeedback ? "View feedback" : "Give feedback"}</a>` : ""}${a.appointment_status === "Cancelled" ? `<a class="btn btn-secondary" href="../booking/booking.html?clinic_id=${encodeURIComponent(a.clinic_id)}">Book again</a><button class="btn btn-ghost" type="button" data-dismiss="${escapeHtml(a.appointment_id)}">Dismiss</button>` : ""}</div></article>`;
            })
            .join("")
        : '<div class="empty"><div class="empty-icon">▣</div>No appointments in this category.</div>';
      root.querySelectorAll("[data-dismiss]").forEach((button) =>
        button.addEventListener("click", () => {
          dismissed.add(button.dataset.dismiss);
          localStorage.setItem(dismissedKey, JSON.stringify([...dismissed]));
          render(status);
        }),
      );
      root.querySelectorAll("[data-cancel]").forEach((button) =>
        button.addEventListener("click", async () => {
          const appointment = current.find(
            (a) => a.appointment_id === button.dataset.cancel,
          );
          const clinic = clinics.find(
            (c) => c.clinic_id === appointment.clinic_id,
          );
          const pendingRequest = appointment.appointment_status === "Pending";
          if (!pendingRequest && !canModify(appointment, clinic)) {
            toast(
              `Changes close ${clinic.cancellation_window_hours || 12} hours before the appointment.`,
            );
            return;
          }
          let cancellationReason = pendingRequest ? "Patient cancelled the pending request." : await formModal("Request appointment cancellation", "Share a short reason so the clinic understands your request.", { label: "Reason (optional)", type: "textarea", maxlength: 500 }, "Continue");
          if (!pendingRequest && cancellationReason === null) return;
          cancellationReason = cancellationReason || "Patient requested cancellation.";
          modal(
            "Cancel appointment?",
            pendingRequest ? "This will cancel the pending request and release the slot." : "The clinic will review your cancellation request. The appointment is not cancelled until the clinic responds.",
            async () => {
              const nextStatus = pendingRequest ? "Cancelled" : "Cancellation Requested";
              const history = [...(appointment.status_history || []), { status: nextStatus, at: new Date().toISOString(), note: cancellationReason }];
              await api.update("appointments", appointment.appointment_id, { appointment_status: nextStatus, cancellation_reason: cancellationReason, status_history: history }, "appointment_id");
              if (pendingRequest) await api.update("slots", appointment.slot_id, { slot_status: "Available" }, "slot_id");
              await saveNotification(
                clinic.clinic_id,
                `Appointment ${appointment.reference_number}: ${pendingRequest ? "the patient cancelled the pending request." : "the patient requested cancellation."}`,
              );
              await saveNotification(
                patientId,
                pendingRequest ? `Your appointment ${appointment.reference_number} was cancelled.` : `Your cancellation request for ${appointment.reference_number} was sent to the clinic.`,
              );
              if (!pendingRequest) {
                try {
                  await api.notify("system_admin", `Cancellation requested for ${appointment.reference_number} at ${clinic.clinic_name}.`, "Appointment cancellation request", { reference_type: "appointment", reference_id: appointment.appointment_id, clinic_id: clinic.clinic_id });
                } catch (notificationError) {
                  console.warn("The admin cancellation notification could not be saved.", notificationError);
                }
              }
              await render(activeStatus);
            },
          );
        }),
      );
      root.querySelectorAll("[data-reschedule]").forEach((button) =>
        button.addEventListener("click", async () => {
          const appointment = current.find(
            (a) => a.appointment_id === button.dataset.reschedule,
          );
          const clinic = clinics.find(
            (c) => c.clinic_id === appointment.clinic_id,
          );
          if (!canModify(appointment, clinic)) {
            toast(
              `Changes close ${clinic.cancellation_window_hours || 12} hours before the appointment.`,
            );
            return;
          }
          const providers = await api.list("staff");
          const [slotsNow, appointmentsNow] = await Promise.all([
            api.list("slots"),
            api.list("appointments"),
          ]);
          const openSlots = slotsNow.filter(
            (slot) =>
              slot.clinic_id === clinic.clinic_id &&
              slot.slot_status === "Available" &&
              isFutureSlot(slot) &&
              providers.some(
                (provider) =>
                  provider.staff_id === slot.staff_id &&
                  provider.duty_status === "On Duty",
              ) &&
              !appointmentsNow.some(
                (other) =>
                  other.slot_id === slot.slot_id &&
                  other.appointment_status !== "Cancelled",
              ),
          );
          if (!openSlots.length) {
            toast("There are no available clinic schedules to reschedule to.");
            return;
          }
          const choices = openSlots.slice(0, 12);
          const selectedSlotId = await formModal("Request a new appointment time", `Choose a schedule for ${clinic.clinic_name}. The clinic must approve this change; your current booking remains in place until then.`, { label: "Available schedule", type: "select", required: true, options: [{ value: "", label: "Select a new time" }, ...choices.map((slot) => ({ value: slot.slot_id, label: `${formatDate(slot.slot_date)} · ${slot.start_time} · ${staffName(slot.staff_id, providers)}` }))] }, "Send request");
          if (!selectedSlotId) return;
          const target = choices.find((slot) => slot.slot_id === selectedSlotId);
          if (!target) return;
          const requestedSchedule = {
            slot_id: target.slot_id,
            staff_id: target.staff_id,
            appointment_date: target.slot_date,
            appointment_time: target.start_time,
          };
          await api.update(
            "appointments",
            appointment.appointment_id,
            {
              appointment_status: "Reschedule Requested",
              requested_reschedule: requestedSchedule,
              status_history: [...(appointment.status_history || []), { status: "Reschedule Requested", at: new Date().toISOString(), note: `Patient requested ${formatDate(target.slot_date)} at ${target.start_time}.` }],
            },
            "appointment_id",
          );
          await saveNotification(
            clinic.clinic_id,
            `Appointment ${appointment.reference_number} was rescheduled by the patient.`,
          );
          await saveNotification(
            patientId,
            `Your reschedule request for ${appointment.reference_number} was sent to the clinic.`,
          );
          try {
            await api.notify("system_admin", `Reschedule requested for ${appointment.reference_number} at ${clinic.clinic_name}.`, "Appointment reschedule request", { reference_type: "appointment", reference_id: appointment.appointment_id, clinic_id: clinic.clinic_id });
          } catch (notificationError) {
            console.warn("The admin reschedule notification could not be saved.", notificationError);
          }
          await render(activeStatus);
        }),
      );
    };
    root.querySelectorAll(".tab").forEach((tab) =>
      tab.addEventListener("click", () => {
        activeStatus = tab.dataset.status;
        root
          .querySelectorAll(".tab")
          .forEach((item) => item.classList.toggle("active", item === tab));
        render(activeStatus);
      }),
    );
    root.querySelectorAll("#appointment-search, #appointment-date-filter").forEach((input) => input.addEventListener(input.type === "search" ? "input" : "change", () => render(activeStatus)));
    await render(activeStatus);
    const selectedAppointmentId = new URLSearchParams(location.search).get("appointment_id");
    if (selectedAppointmentId) {
      const selectedCard = root.querySelector(`[data-appointment-id="${CSS.escape(selectedAppointmentId)}"]`);
      const details = selectedCard?.querySelector(".appointment-detail");
      if (details) {
        details.open = true;
        selectedCard.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
    startPolling(() => render(activeStatus));
    return;
  }

  if (feature === "notifications") {
    const render = async () => {
      let allNotes = await api.list("notifications");
      for (const appointment of await api.list("appointments")) {
        if (
          appointment.patient_id !== patientId ||
          appointment.appointment_status !== "Confirmed"
        )
          continue;
        const startsAt = new Date(
          `${appointment.appointment_date}T${appointment.appointment_time}`,
        ).getTime();
        if (
          startsAt < Date.now() ||
          startsAt - Date.now() > 24 * 60 * 60 * 1000
        )
          continue;
        if (
          allNotes.some(
            (note) =>
              note.recipient_id === patientId &&
              note.notification_type === "Appointment reminder" &&
              note.message.includes(appointment.reference_number),
          )
        )
          continue;
        await saveNotification(
          patientId,
          `Reminder: appointment ${appointment.reference_number} is scheduled for ${formatDate(appointment.appointment_date)} at ${appointment.appointment_time}.`,
          "Appointment reminder",
        );
        allNotes = await api.list("notifications");
      }
      const notes = allNotes
        .filter((n) => n.recipient_id === patientId)
        .reverse();
      root.innerHTML = `<div class="actions notice-actions"><button class="btn btn-secondary" id="mark-read">Mark all as read</button></div><div class="list">
        ${notes.map((n) => `<article class="list-item ${n.read ? "" : "unread"}"><div class="avatar">${icon("bell")}</div><div class="grow"><strong>${escapeHtml(n.notification_type)}</strong><p>${escapeHtml(n.message)}</p><small class="muted">${formatDate(n.created_at.slice(0, 10))}</small></div>${n.read ? '<span class="muted">Read</span>' : `<button class="btn btn-ghost" type="button" data-read-note="${escapeHtml(n.notification_id)}">Mark read</button>`}<button class="btn btn-secondary" type="button" data-open-note="${escapeHtml(n.notification_id)}">Open</button></article>`).join("") || '<div class="empty">No notifications yet.</div>'}</div>`;
      root.querySelectorAll("[data-read-note]").forEach((button) => button.addEventListener("click", async () => {
        await api.update("notifications", button.dataset.readNote, { read: true }, "notification_id");
        await render();
      }));
      root.querySelectorAll("[data-open-note]").forEach((button) => button.addEventListener("click", async () => {
        const note = notes.find((item) => item.notification_id === button.dataset.openNote);
        if (note && !note.read) await api.update("notifications", note.notification_id, { read: true }, "notification_id");
        const appointmentsNow = await api.list("appointments");
        const match = appointmentsNow.find((appointment) => appointment.patient_id === patientId && note?.message.includes(appointment.reference_number));
        location.href = match ? `../appointments/appointments.html?status=${encodeURIComponent(match.appointment_status === "Cancelled" ? "Cancelled" : match.appointment_status === "Completed" ? "Completed" : "Upcoming")}` : "../clinics/clinics.html";
      }));
      root.querySelector("#mark-read").addEventListener("click", async () => {
        for (const note of notes.filter((n) => !n.read))
          await api.update(
            "notifications",
            note.notification_id,
            { read: true },
            "notification_id",
          );
        toast("All notifications marked as read.");
        render();
      });
    };
    await render();
    startPolling(render);
    return;
  }

  if (feature === "profile") {
    let profilePhoto = safeProfilePhoto(patient.profile_photo);
    root.innerHTML = `<form class="card profile-form" id="profile-form"><div class="profile-form-intro"><p class="eyebrow">Patient account</p><h2>Make your profile yours</h2><p class="muted">Keep your contact details current so clinics can reach you about appointments.</p></div><section class="profile-photo-editor"><div class="profile-photo-preview" id="profile-photo-preview">${
      profilePhoto
        ? `<img src="${escapeHtml(profilePhoto)}" alt="Patient profile photo">`
        : escapeHtml(
            patient.name
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join(""),
          )
    }</div><div class="profile-photo-controls"><label for="profile-photo">Profile photo</label><input class="input" id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp"><small class="muted">JPG, PNG, or WebP; up to 5 MB. Images are resized before saving.</small><button class="btn btn-ghost" type="button" id="remove-profile-photo">Remove photo</button><p class="muted" id="profile-photo-status" role="status"></p></div></section>
      <section class="profile-edit-section"><div class="profile-section-heading"><span>01</span><div><h3>Personal information</h3><p>Your name as it appears in your care account.</p></div></div><div class="grid grid-2"><div class="field"><label for="name">Full name</label><input class="input" id="name" value="${escapeHtml(patient.name)}" autocomplete="name" required maxlength="120"></div><div class="field"><label>Account type</label><input class="input" value="Patient" readonly aria-readonly="true"></div></div></section>
      <section class="profile-edit-section" id="account-settings"><div class="profile-section-heading"><span>02</span><div><h3>Contact details</h3><p>Used for account access and appointment updates.</p></div></div><div class="grid grid-2"><div class="field"><label for="email">Email address</label><input class="input" id="email" value="${escapeHtml(patient.email)}" type="email" autocomplete="email" required></div><div class="field"><label for="mobile">Mobile number</label><input class="input" id="mobile" value="${escapeHtml(patient.mobile_number)}" type="tel" autocomplete="tel" pattern="[0-9+() -]{7,20}" title="Enter a valid phone number" required></div></div></section>
      <section class="profile-edit-section"><div class="profile-section-heading"><span>03</span><div><h3>Location</h3><p>Helps you find care nearby. No location access is requested.</p></div></div><div class="grid grid-2"><div class="field"><label for="barangay">Barangay</label><input class="input" id="barangay" value="${escapeHtml(patient.barangay || "")}" autocomplete="address-level3"></div><div class="field"><label for="city">City / municipality</label><input class="input" id="city" value="${escapeHtml(patient.city || "")}" autocomplete="address-level2"></div><div class="field"><label for="province">Province</label><input class="input" id="province" value="${escapeHtml(patient.province || "")}" autocomplete="address-level1"></div></div></section>
      <div class="profile-form-footer"><p class="muted">Your role and sign-in credentials are protected from profile editing.</p><button class="btn btn-primary" id="profile-save">Save changes</button></div></form>`;
    root
      .querySelector("#profile-photo")
      .addEventListener("change", async (event) => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        if (!file) return;
        const status = root.querySelector("#profile-photo-status");
        status.textContent = "Preparing image…";
        try {
          profilePhoto = await compressProfilePhoto(file);
          root.querySelector("#profile-photo-preview").innerHTML =
            `<img src="${escapeHtml(profilePhoto)}" alt="Patient profile photo preview">`;
          status.textContent = "Photo ready to save.";
        } catch (error) {
          input.value = "";
          status.textContent = error.message;
        }
      });
    root
      .querySelector("#remove-profile-photo")
      .addEventListener("click", () => {
        profilePhoto = "";
        root.querySelector("#profile-photo").value = "";
        root.querySelector("#profile-photo-preview").textContent = patient.name
          .split(" ")
          .map((part) => part[0])
          .slice(0, 2)
          .join("");
        root.querySelector("#profile-photo-status").textContent =
          "The photo will be removed when you save.";
      });
    root.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const saveButton = root.querySelector("#profile-save");
      saveButton.disabled = true;
      saveButton.textContent = "Saving…";
      try {
        const email = root.querySelector("#email").value.trim();
        const mobile = root.querySelector("#mobile").value.trim();
        const duplicate = await api.accountIdentityInUse(email, mobile, session.user_id, patientId);
        if (duplicate.email || duplicate.mobile) {
          toast(duplicate.email ? "That email address is already used by another account." : "That mobile number is already used by another account.");
          return;
        }
        const changes = {
          name: root.querySelector("#name").value.trim(),
          email,
          mobile_number: mobile,
          barangay: root.querySelector("#barangay").value.trim(),
          city: root.querySelector("#city").value.trim(),
          province: root.querySelector("#province").value.trim(),
          profile_photo: profilePhoto || null,
        };
        await api.update("patients", patientId, changes, "patient_id");
        await api.update(
          "users",
          session.user_id,
          { name: changes.name, email, mobile_number: mobile },
          "user_id",
        );
        setSession({ ...session, name: changes.name });
        renderSidebarProfilePhoto(changes.name, profilePhoto);
        renderHeaderProfile(changes.name, profilePhoto);
        toast("Profile changes saved.");
      } catch (error) {
        toast(`Profile changes could not be saved: ${error.message}`);
      } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Save changes";
      }
    });
    return;
  }

  if (feature === "feedback") {
    const completed = mine.filter(canLeaveFeedback);
    const feedback = await api.list("feedback");
    const feedbackParams = new URLSearchParams(location.search);
    const appointmentId = feedbackParams.get("appointment_id");
    const requestedClinicId = feedbackParams.get("clinic_id");
    const eligible = completed.filter(
      (a) => !feedback.some((f) => f.appointment_id === a.appointment_id),
    );
    const selectedEligible = eligible.find(
      (appointment) => appointment.appointment_id === appointmentId,
    ) || eligible.find((appointment) => appointment.clinic_id === requestedClinicId);
    const submittedFeedback = feedback.filter(
      (item) => item.patient_id === patientId,
    );
    const requestedFeedback = submittedFeedback.find(
      (item) => item.appointment_id === appointmentId,
    );
    root.innerHTML = `${requestedFeedback ? `<section class="card selected-feedback"><p class="eyebrow">Feedback for ${escapeHtml(clinicName(requestedFeedback.clinic_id, clinics))}</p><h2>Your review</h2><div class="rating">${"★".repeat(Number(requestedFeedback.rating) || 0)}${"☆".repeat(Math.max(0, 5 - (Number(requestedFeedback.rating) || 0)))}</div><p>${escapeHtml(requestedFeedback.comment || "")}</p><small class="muted">${formatDate(requestedFeedback.created_at?.slice(0, 10))}</small></section>` : ""}<div class="grid grid-2"><section class="card feedback-card"><h2>How was your completed visit?</h2>${
      eligible.length
        ? `<form id="feedback-form">
      <div class="field"><label for="feedback-appointment">Completed appointment</label><select class="select" id="feedback-appointment" required>${eligible.map((a) => `<option value="${escapeHtml(a.appointment_id)}" ${a.appointment_id === selectedEligible?.appointment_id ? "selected" : ""}>${escapeHtml(clinicName(a.clinic_id, clinics))} — ${formatDate(a.appointment_date)}</option>`).join("")}</select></div>
      <fieldset class="rating-field"><legend>Rating</legend>${[1, 2, 3, 4, 5].map((value) => `<label><input type="radio" name="rating" value="${value}" required><span>★</span></label>`).join("")}</fieldset>
      <div class="field"><label for="feedback-comment">Comment</label><textarea class="textarea" id="feedback-comment" required placeholder="Share a helpful, respectful comment"></textarea></div>
      <button class="btn btn-primary">Submit feedback</button></form>`
        : '<div class="empty">Feedback is available once for each completed appointment.</div>'
    }</section><section class="card"><h2>Your submitted feedback</h2><div class="list">${submittedFeedback.map((item) => `<article class="list-item"><div><strong>${escapeHtml(clinicName(item.clinic_id, clinics))}</strong><div class="rating">${"★".repeat(Number(item.rating) || 0)}${"☆".repeat(Math.max(0, 5 - (Number(item.rating) || 0)))}</div><p>${escapeHtml(item.comment || "")}</p><small class="muted">${formatDate(item.created_at?.slice(0, 10))}</small></div></article>`).join("") || '<div class="empty">You haven’t submitted feedback yet.</div>'}</div></section></div>`;
    root
      .querySelector("#feedback-form")
      ?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const appointment = eligible.find(
          (a) =>
            a.appointment_id ===
            root.querySelector("#feedback-appointment").value,
        );
        await api.create("feedback", {
          feedback_id: `fb_${Date.now()}`,
          appointment_id: appointment.appointment_id,
          patient_id: patientId,
          clinic_id: appointment.clinic_id,
          rating: Number(new FormData(event.currentTarget).get("rating")),
          comment: root.querySelector("#feedback-comment").value.trim(),
          created_at: new Date().toISOString(),
        });
        root.innerHTML =
          '<div class="card success-state"><div class="success-check">✓</div><h2>Thank you for your feedback</h2><p>Your experience helps other patients make informed choices.</p></div>';
      });
  }
}

async function renderClinicPreviewMap(elementId, locations) {
  const L = await loadLeaflet();
  let map = previewMaps.get(elementId);
  if (!map) {
    map = L.map(elementId).setView([7.8257, 123.437], 13);
    map._lapitcareMarkers = new Map();
    previewMaps.set(elementId, map);
    if ("ResizeObserver" in window) {
      map._lapitcareResizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
      map._lapitcareResizeObserver.observe(document.getElementById(elementId));
    }
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
    }).addTo(map);
  } else {
    map._lapitcareMarkers.forEach((marker) => map.removeLayer(marker));
    map._lapitcareMarkers.clear();
  }
  const points = [];
  for (const { clinic, href } of locations) {
    if (
      clinic.latitude === null || clinic.latitude === undefined || clinic.latitude === "" ||
      clinic.longitude === null || clinic.longitude === undefined || clinic.longitude === "" ||
      !Number.isFinite(Number(clinic.latitude)) ||
      !Number.isFinite(Number(clinic.longitude))
    )
      continue;
    const point = [Number(clinic.latitude), Number(clinic.longitude)];
    points.push(point);
    const marker = L.marker(point)
      .addTo(map)
      .bindPopup(
        `${safeProfilePhoto(clinic.profile_photo) ? `<img class="map-clinic-image" src="${escapeHtml(clinic.profile_photo)}" alt="">` : ""}<strong>${escapeHtml(clinic.clinic_name)}</strong><br>${escapeHtml(clinic.address || "Address unavailable")}, ${escapeHtml(clinic.barangay || "")}<br>${escapeHtml(clinic.approval_status || clinic.clinic_status || "")}<br><a href="${href}">View details</a>`,
      );
    map._lapitcareMarkers.set(clinic.clinic_id, marker);
    marker.on("click", () => {
      document
        .querySelectorAll(".clinic-card-selected")
        .forEach((card) => card.classList.remove("clinic-card-selected"));
      document
        .querySelector(`[data-clinic-id="${CSS.escape(clinic.clinic_id)}"]`)
        ?.classList.add("clinic-card-selected");
      document
        .querySelector(`[data-clinic-id="${CSS.escape(clinic.clinic_id)}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }
  if (points.length > 1) map.fitBounds(points, { padding: [24, 24] });
  else if (points.length === 1) map.setView(points[0], 14);
  else map.setView([7.8257, 123.437], 13);
  map.invalidateSize();
  return map;
}

async function clinicPage(feature, session) {
  const root = document.querySelector("#page-content");
  const clinic = await api.get("clinics", session.clinic_id, "clinic_id");
  if (!clinic)
    throw new Error(
      "This clinic administrator account is not linked to a clinic.",
    );
  renderSidebarProfilePhoto(clinic.clinic_name, clinic.profile_photo);
  const clinicNameLabel = document.querySelector("#profile-clinic-name");
  if (clinicNameLabel) clinicNameLabel.textContent = clinic.clinic_name;
  const isApproved =
    clinic.approval_status === "Approved" && clinic.verified === true;
  const registrationStatus =
    clinic.approval_status === "Pending"
      ? "Pending Review"
      : clinic.registration_status || clinic.approval_status;
  if (await renderClinicAdminPage(feature, session, clinic)) return;
  if (!isApproved && !["dashboard", "profile"].includes(feature)) {
    root.innerHTML = `<div class="card registration-status-card"><p class="eyebrow">Clinic registration</p><h2>Tools unlock after review</h2><p>Your clinic is <strong>${escapeHtml(registrationStatus)}</strong>. Appointments, schedules, services, and status controls remain unavailable until a mock administrator approves the registration.</p><div class="actions"><a class="btn btn-primary" href="../dashboard/dashboard.html">View registration status</a><a class="btn btn-secondary" href="../profile/profile.html">View clinic profile</a></div></div>`;
    return;
  }
  const cid = clinic.clinic_id;
  const [allStaff, allAppointments, allSlots] = await Promise.all([
    api.list("staff"),
    api.list("appointments"),
    api.list("slots"),
  ]);
  const ownStaff = allStaff.filter((s) => s.clinic_id === cid);
  const ownAppointments = allAppointments.filter((a) => a.clinic_id === cid);
  const ownSlots = allSlots.filter((s) => s.clinic_id === cid);

  if (feature === "dashboard") {
    if (!isApproved) {
      root.innerHTML = `<div class="card registration-status-card registration-success-card">
        <p class="eyebrow">Clinic registration submitted successfully</p><h2>${escapeHtml(clinic.clinic_name)}</h2>
        <p><span class="badge status-pending">${escapeHtml(registrationStatus)}</span></p>
        <p>Your clinic profile has been saved in this browser and is awaiting a simulated review. Uploaded supporting documents are available for review but are not verified.</p>
        <p><strong>Official clinic email:</strong> ${escapeHtml(clinic.email || "Not provided")}<br><strong>Clinic contact:</strong> ${escapeHtml(clinic.contact_number || "Not provided")}<br><strong>Location:</strong> ${escapeHtml(clinic.address || "Not provided")}</p>
        <a class="btn btn-primary" href="../profile/profile.html">View clinic profile</a>
      </div>`;
      return;
    }
    root.innerHTML = `<div class="grid grid-4"><a class="card stat-card dashboard-link" href="../appointments/appointments.html"><span class="stat-label">Today’s appointments</span><div class="stat-value">${ownAppointments.filter((a) => a.appointment_date === today()).length}</div><span class="muted">Review today’s schedule →</span></a>
      <a class="card stat-card dashboard-link" href="../appointments/appointments.html"><span class="stat-label">Pending requests</span><div class="stat-value">${ownAppointments.filter((a) => a.appointment_status === "Pending").length}</div><span class="muted">Requests awaiting review →</span></a>
      <a class="card stat-card dashboard-link" href="../staff/staff.html"><span class="stat-label">Personnel on duty</span><div class="stat-value">${ownStaff.filter((s) => s.duty_status === "On Duty").length} / ${ownStaff.length}</div><span class="muted">${ownStaff.filter((s) => s.duty_status === "On Duty" && staffRole(s) === "Doctor").length} doctors · ${ownStaff.filter((s) => s.duty_status === "On Duty" && staffRole(s) !== "Doctor").length} other staff · Manage team →</span></a>
      <a class="card stat-card dashboard-link" href="../schedules/schedules.html"><span class="stat-label">Open slots</span><div class="stat-value">${ownSlots.filter((s) => s.slot_status === "Available" && isFutureSlot(s) && ownStaff.some((provider) => provider.staff_id === s.staff_id && provider.duty_status === "On Duty") && !allAppointments.some((appointment) => appointment.slot_id === s.slot_id && appointment.appointment_status !== "Cancelled")).length}</div><span class="muted">Manage clinic schedules →</span></a></div>
      <div class="grid grid-2 dashboard-panels"><div class="card"><div class="clinic-card-top"><div><p class="eyebrow">Clinic status</p><h2>${escapeHtml(clinic.clinic_name)}</h2></div>${badge(clinic.clinic_status)}</div>
      <p>${Number(clinic.queue_count || 0)} patients in queue · ${Number(clinic.estimated_wait_minutes || 0)} min estimated wait</p><a class="btn btn-teal" href="../status-queue/status-queue.html">Update status</a></div>
      <div class="card"><h2 class="section-title">Appointment requests</h2><p>${ownAppointments.filter((a) => a.appointment_status === "Pending").length} pending review</p><div class="dashboard-shortcuts"><a class="btn btn-primary" href="../appointments/appointments.html">Manage appointments</a><a class="btn btn-secondary" href="../profile/profile.html">Clinic profile</a><a class="btn btn-secondary" href="../services/services.html">Services & specialties</a><a class="btn btn-secondary" href="../notifications/notifications.html">Notifications</a></div></div></div>`;
    root.insertAdjacentHTML(
      "beforeend",
      `<div class="card dashboard-map-card"><h2 class="section-title">Your clinic location</h2><div class="dashboard-map" id="clinic-dashboard-map"></div><p class="form-error" id="clinic-map-error" role="status"></p><a class="btn btn-secondary" href="../profile/profile.html">Edit clinic location</a></div>`,
    );
    renderClinicPreviewMap("clinic-dashboard-map", [
      { clinic, href: "../profile/profile.html" },
    ]).catch((error) => {
      const message = root.querySelector("#clinic-map-error");
      if (message)
        message.textContent = `Map preview unavailable: ${error.message}`;
    });
    return;
  }

  if (feature === "profile") {
    if (!isApproved) {
      const logo = safeProfilePhoto(clinic.profile_photo);
      const documents = Array.isArray(clinic.registration_documents)
        ? clinic.registration_documents
        : [];
      const missingReviewFields = [
        ["Clinic name", clinic.clinic_name], ["Clinic type", clinic.clinic_type],
        ["Address", clinic.address], ["Official clinic email", clinic.email],
        ["Clinic phone", clinic.contact_number], ["Authorized representative", clinic.representative_name],
        ["Service description", clinic.service_description || clinic.services?.length],
      ].filter(([, value]) => !value).map(([label]) => label);
      let adminSettings = {};
      try { adminSettings = JSON.parse(localStorage.getItem("lapitcare_admin_settings") || "{}"); } catch { adminSettings = {}; }
      root.innerHTML = `<section class="card registration-status-card">
        <p class="eyebrow">Clinic profile · registration status</p><h2>${escapeHtml(clinic.clinic_name)}</h2>
        <p><span class="badge status-pending">${escapeHtml(registrationStatus)}</span></p>
        ${logo ? `<img class="pending-clinic-logo" src="${escapeHtml(logo)}" alt="${escapeHtml(clinic.clinic_name)} logo">` : ""}
        <dl class="registration-profile-list">
          <div><dt>Clinic type</dt><dd>${escapeHtml(clinic.clinic_type || "Not provided")}</dd></div>
          <div><dt>Specialties</dt><dd>${escapeHtml((clinic.specialties || []).join(", ") || "Not provided")}</dd></div>
          <div><dt>Services</dt><dd>${escapeHtml(clinic.service_description || (clinic.services || []).join(", "))}</dd></div>
          <div><dt>Address</dt><dd>${escapeHtml(clinic.address || "Not provided")}</dd></div>
          <div><dt>Official clinic email</dt><dd>${escapeHtml(clinic.email || "Not provided")}</dd></div>
          <div><dt>Clinic contact</dt><dd>${escapeHtml(clinic.contact_number || "Not provided")}</dd></div>
          <div><dt>Website / social link</dt><dd>${clinic.website_url ? `<a href="${escapeHtml(clinic.website_url)}" target="_blank" rel="noopener">${escapeHtml(clinic.website_url)}</a>` : "Not provided"}</dd></div>
          <div><dt>Operating hours</dt><dd>${escapeHtml(clinic.operating_hours || "Not provided")}</dd></div>
          <div><dt>Authorized representative</dt><dd>${escapeHtml(clinic.representative_name || "Not provided")}${clinic.representative_position ? ` · ${escapeHtml(clinic.representative_position)}` : ""}</dd></div>
          <div><dt>License / registration</dt><dd>${escapeHtml(clinic.license_number || "Not provided")}${clinic.license_authority ? ` · ${escapeHtml(clinic.license_authority)}` : ""}</dd></div>
        </dl>
        <h3>Supporting documents</h3><p class="muted">Files are stored locally and have not been verified.</p>
        <ul>${documents.map((file) => `<li>${escapeHtml(file.name)} · ${escapeHtml(file.verification_status || "Not verified")}</li>`).join("") || "<li>No supporting documents submitted.</li>"}</ul>
      </section>`;
      return;
    }
    let clinicPhoto = safeProfilePhoto(clinic.profile_photo);
    root.innerHTML = `<form class="card profile-form" id="clinic-profile"><section class="profile-photo-editor"><div class="profile-photo-preview" id="clinic-photo-preview">${
      clinicPhoto
        ? `<img src="${escapeHtml(clinicPhoto)}" alt="Clinic profile photo">`
        : escapeHtml(
            clinic.clinic_name
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join(""),
          )
    }</div><div class="profile-photo-controls"><label for="clinic-photo">Clinic profile photo or logo</label><input class="input" id="clinic-photo" type="file" accept="image/jpeg,image/png,image/webp"><small class="muted">JPG, PNG, or WebP; up to 5 MB. Images are resized before saving.</small><button class="btn btn-ghost" type="button" id="remove-clinic-photo">Remove photo</button><p class="muted" id="clinic-photo-status" role="status"></p></div></section><div class="grid grid-2">
      <div class="field"><label for="clinic-name">Clinic name</label><input class="input" id="clinic-name" value="${escapeHtml(clinic.clinic_name)}" required></div>
      <div class="field"><label for="contact">Contact number</label><input class="input" id="contact" value="${escapeHtml(clinic.contact_number)}" required></div>
      <div class="field"><label for="address">Address</label><input class="input" id="address" value="${escapeHtml(clinic.address)}" required></div>
      <div class="field"><label for="barangay">Barangay</label><input class="input" id="barangay" value="${escapeHtml(clinic.barangay)}" required></div>
      <div class="field"><label for="hours">Operating hours</label><input class="input" id="hours" value="${escapeHtml(clinic.operating_hours)}" required></div>
      <div class="field"><label for="latitude">Map latitude</label><input class="input" id="latitude" type="number" step="any" value="${Number(clinic.latitude)}" required></div>
      <div class="field"><label for="longitude">Map longitude</label><input class="input" id="longitude" type="number" step="any" value="${Number(clinic.longitude)}" required></div></div>
      <button class="btn btn-primary" type="submit">Save clinic profile</button></form>`;
    root
      .querySelector("#clinic-photo")
      .addEventListener("change", async (event) => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        if (!file) return;
        const status = root.querySelector("#clinic-photo-status");
        status.textContent = "Preparing image…";
        try {
          clinicPhoto = await compressProfilePhoto(file);
          root.querySelector("#clinic-photo-preview").innerHTML =
            `<img src="${escapeHtml(clinicPhoto)}" alt="Clinic profile photo preview">`;
          status.textContent = "Photo ready to save.";
        } catch (error) {
          input.value = "";
          status.textContent = error.message;
        }
      });
    root.querySelector("#remove-clinic-photo").addEventListener("click", () => {
      clinicPhoto = "";
      root.querySelector("#clinic-photo").value = "";
      root.querySelector("#clinic-photo-preview").textContent =
        clinic.clinic_name
          .split(" ")
          .map((part) => part[0])
          .slice(0, 2)
          .join("");
      root.querySelector("#clinic-photo-status").textContent =
        "The photo will be removed when you save.";
    });
    root.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const latitude = Number(root.querySelector("#latitude").value);
      const longitude = Number(root.querySelector("#longitude").value);
      if (
        latitude < 7.7 ||
        latitude > 7.95 ||
        longitude < 123.3 ||
        longitude > 123.6
      ) {
        toast("Enter a map location within Pagadian City.");
        return;
      }
      const saveButton = root.querySelector('button[type="submit"]');
      saveButton.disabled = true;
      try {
        await api.update(
          "clinics",
          cid,
          {
            clinic_name: root.querySelector("#clinic-name").value.trim(),
            contact_number: root.querySelector("#contact").value.trim(),
            address: root.querySelector("#address").value.trim(),
            barangay: root.querySelector("#barangay").value.trim(),
            operating_hours: root.querySelector("#hours").value.trim(),
            latitude,
            longitude,
            profile_photo: clinicPhoto || null,
          },
          "clinic_id",
        );
        renderSidebarProfilePhoto(
          root.querySelector("#clinic-name").value.trim(),
          clinicPhoto,
        );
        toast("Clinic profile saved and published.");
      } catch (error) {
        toast(`Clinic profile could not be saved: ${error.message}`);
      } finally {
        saveButton.disabled = false;
      }
    });
    return;
  }

  if (feature === "services") {
    const [specialties, services] = await Promise.all([
      api.list("specialties"),
      api.list("services"),
    ]);
    root.innerHTML = `<div class="grid grid-2"><form class="card" id="specialties-form"><h2>Specialties</h2><div class="check-list">${specialties
      .filter((s) => s.enabled)
      .map(
        (s) =>
          `<label><input type="checkbox" value="${escapeHtml(s.specialty_name)}" ${clinic.specialties.includes(s.specialty_name) ? "checked" : ""}> ${escapeHtml(s.specialty_name)}</label>`,
      )
      .join(
        "",
      )}</div><button class="btn btn-primary">Save specialties</button></form>
      <form class="card" id="services-form"><h2>Services</h2><div class="check-list">${services
        .filter((s) => s.enabled)
        .map(
          (s) =>
            `<label><input type="checkbox" value="${escapeHtml(s.service_name)}" ${clinic.services.includes(s.service_name) ? "checked" : ""}> ${escapeHtml(s.service_name)}</label>`,
        )
        .join("")}</div>
      <div class="field"><label for="custom-service">Add service</label><input class="input" id="custom-service" placeholder="Service name"></div><button class="btn btn-primary">Save services</button></form></div>`;
    root
      .querySelector("#specialties-form")
      .addEventListener("submit", async (event) => {
        event.preventDefault();
        const selected = [
          ...event.currentTarget.querySelectorAll("input:checked"),
        ].map((input) => input.value);
        if (!selected.length) {
          toast("Select at least one specialty.");
          return;
        }
        await api.update(
          "clinics",
          cid,
          { specialties: selected },
          "clinic_id",
        );
        toast("Clinic specialties updated.");
      });
    root
      .querySelector("#services-form")
      .addEventListener("submit", async (event) => {
        event.preventDefault();
        const selected = [
          ...event.currentTarget.querySelectorAll("input:checked"),
        ].map((input) => input.value);
        const custom = root.querySelector("#custom-service").value.trim();
        if (custom) selected.push(custom);
        if (!selected.length) {
          toast("Select or add at least one service.");
          return;
        }
        await api.update(
          "clinics",
          cid,
          { services: [...new Set(selected)] },
          "clinic_id",
        );
        toast("Clinic services updated.");
      });
    return;
  }

  if (feature === "staff") {
    document.querySelector("#page-actions").innerHTML =
      '<button class="btn btn-primary" id="add-staff">Add staff member</button>';
    const specialties = (await api.list("specialties")).filter(
      (item) =>
        item.enabled && clinic.specialties.includes(item.specialty_name),
    );
    const roles = [
      "Doctor",
      "Nurse",
      "Medical assistant",
      "Receptionist",
      "Technician",
      "Other",
    ];
    const render = async () => {
      const staff = (await api.list("staff")).filter(
        (s) => s.clinic_id === cid,
      );
      root.innerHTML = `<form class="card staff-editor hidden" id="staff-editor"><h2 id="staff-editor-title">Add staff member</h2>
        <div class="grid grid-2"><div class="field"><label for="staff-name">Full name</label><input class="input" id="staff-name" required maxlength="100"></div>
        <div class="field"><label for="staff-role">Role</label><select class="select" id="staff-role" required>${roles.map((role) => `<option>${escapeHtml(role)}</option>`).join("")}</select></div>
        <div class="field"><label for="staff-specialty">Specialty / area</label><select class="select" id="staff-specialty" required><option value="">Select one</option><option value="Clinic support">Clinic support</option>${specialties.map((item) => `<option value="${escapeHtml(item.specialty_name)}">${escapeHtml(item.specialty_name)}</option>`).join("")}</select></div>
        <div class="field"><label for="staff-duty">Duty status</label><select class="select" id="staff-duty">${["Off Duty", "On Duty", "On Leave", "Unavailable"].map((status) => `<option>${status}</option>`).join("")}</select></div></div>
        <div class="actions"><button class="btn btn-primary" id="save-staff">Save staff member</button><button class="btn btn-secondary" type="button" id="cancel-staff">Cancel</button></div></form>
        <div class="grid grid-3">${
          staff
            .map(
              (
                s,
              ) => `<article class="card staff-card"><div class="avatar">${escapeHtml(
                s.staff_name
                  .split(" ")
                  .slice(1)
                  .map((x) => x[0])
                  .slice(0, 2)
                  .join(""),
              )}</div>
        <h3>${escapeHtml(s.staff_name)}</h3><p class="muted">${escapeHtml(staffRole(s))} · ${escapeHtml(s.specialty_name)}</p><div class="field"><label for="duty-${escapeHtml(s.staff_id)}">Duty status</label>
        <select class="select duty-select" id="duty-${escapeHtml(s.staff_id)}" data-id="${escapeHtml(s.staff_id)}">${["On Duty", "Off Duty", "On Leave", "Unavailable"].map((status) => `<option ${status === s.duty_status ? "selected" : ""}>${status}</option>`).join("")}</select></div>
        <div class="actions"><button class="btn btn-secondary" data-edit-staff="${escapeHtml(s.staff_id)}">Edit</button><button class="btn btn-danger" data-remove="${escapeHtml(s.staff_id)}">Remove</button></div></article>`,
            )
            .join("") || '<div class="empty">No staff profiles yet.</div>'
        }</div>`;
      const editor = root.querySelector("#staff-editor");
      const roleSelect = root.querySelector("#staff-role");
      const specialtySelect = root.querySelector("#staff-specialty");
      const updateRoleFields = () => {
        const supportOption = [...specialtySelect.options].find(
          (option) => option.value === "Clinic support",
        );
        supportOption.disabled = roleSelect.value === "Doctor";
        specialtySelect.required = roleSelect.value === "Doctor";
        if (roleSelect.value !== "Doctor" && !specialtySelect.value)
          specialtySelect.value = "Clinic support";
        if (
          roleSelect.value === "Doctor" &&
          specialtySelect.value === "Clinic support"
        )
          specialtySelect.value = "";
        specialtySelect._customSelectRefresh?.();
      };
      roleSelect.addEventListener("change", updateRoleFields);
      updateRoleFields();
      const resetEditor = () => {
        editor.reset();
        editor.dataset.staffId = "";
        updateRoleFields();
        editor.classList.add("hidden");
        root.querySelector("#staff-editor-title").textContent =
          "Add staff member";
        root.querySelector("#save-staff").textContent = "Save staff member";
      };
      root
        .querySelector("#cancel-staff")
        .addEventListener("click", resetEditor);
      editor.addEventListener("submit", async (event) => {
        event.preventDefault();
        const record = {
          staff_name: root.querySelector("#staff-name").value.trim(),
          staff_role: root.querySelector("#staff-role").value,
          specialty_name: root.querySelector("#staff-specialty").value,
          duty_status: root.querySelector("#staff-duty").value,
        };
        const id = editor.dataset.staffId;
        if (id) await api.update("staff", id, record, "staff_id");
        else
          await api.create("staff", {
            staff_id: `stf_${Date.now()}`,
            clinic_id: cid,
            ...record,
          });
        toast(id ? "Staff profile updated." : "Staff member added.");
        await render();
      });
      root.querySelectorAll(".duty-select").forEach((select) =>
        select.addEventListener("change", async () => {
          await api.update(
            "staff",
            select.dataset.id,
            { duty_status: select.value },
            "staff_id",
          );
          toast("Staff duty status updated.");
        }),
      );
      root.querySelectorAll("[data-remove]").forEach((button) =>
        button.addEventListener("click", () =>
          modal(
            "Remove staff profile?",
            "Existing appointment records will be retained.",
            async () => {
              await api.remove("staff", button.dataset.remove, "staff_id");
              await render();
            },
          ),
        ),
      );
      root.querySelectorAll("[data-edit-staff]").forEach((button) =>
        button.addEventListener("click", () => {
          const provider = staff.find(
            (s) => s.staff_id === button.dataset.editStaff,
          );
          editor.dataset.staffId = provider.staff_id;
          root.querySelector("#staff-name").value = provider.staff_name;
          root.querySelector("#staff-role").value = staffRole(provider);
          root.querySelector("#staff-role")._customSelectRefresh?.();
          root.querySelector("#staff-specialty").value =
            provider.specialty_name;
          root.querySelector("#staff-specialty")._customSelectRefresh?.();
          root.querySelector("#staff-duty").value = provider.duty_status;
          root.querySelector("#staff-duty")._customSelectRefresh?.();
          updateRoleFields();
          root.querySelector("#staff-editor-title").textContent =
            "Edit staff member";
          root.querySelector("#save-staff").textContent = "Save changes";
          editor.classList.remove("hidden");
          editor.scrollIntoView({ behavior: "smooth", block: "start" });
        }),
      );
    };
    await render();
    document.querySelector("#add-staff").addEventListener("click", () => {
      const editor = root.querySelector("#staff-editor");
      editor.classList.remove("hidden");
      editor.scrollIntoView({ behavior: "smooth", block: "start" });
      root.querySelector("#staff-name").focus();
    });
    return;
  }

  if (feature === "schedules") {
    document.querySelector("#page-actions").innerHTML =
      '<button class="btn btn-primary" id="create-slot">Create slot</button>';
    let scheduleMonth = new Date(today() + "T00:00:00");
    scheduleMonth.setDate(1);
    let selectedScheduleDate = today();
    let scheduleInitialized = false;
    const render = async () => {
      const slots = (await api.list("slots"))
        .filter((slot) => slot.clinic_id === cid)
        .sort((a, b) => `${a.slot_date}${a.start_time}`.localeCompare(`${b.slot_date}${b.start_time}`));
      if (!scheduleInitialized) {
        const firstUpcoming = slots.find((slot) => slot.slot_date >= today());
        if (firstUpcoming) {
          selectedScheduleDate = firstUpcoming.slot_date;
          scheduleMonth = new Date(`${selectedScheduleDate}T00:00:00`);
          scheduleMonth.setDate(1);
        }
        scheduleInitialized = true;
      }
      const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const monthTitle = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric" }).format(scheduleMonth);
      const monthKey = `${scheduleMonth.getFullYear()}-${String(scheduleMonth.getMonth() + 1).padStart(2, "0")}`;
      const offset = (new Date(scheduleMonth.getFullYear(), scheduleMonth.getMonth(), 1).getDay() + 6) % 7;
      const dayCount = new Date(scheduleMonth.getFullYear(), scheduleMonth.getMonth() + 1, 0).getDate();
      const slotsByDate = new Map();
      slots.forEach((slot) => slotsByDate.set(slot.slot_date, [...(slotsByDate.get(slot.slot_date) || []), slot]));
      const blanks = Array.from({ length: offset }, () => '<span class="schedule-calendar-blank" aria-hidden="true"></span>').join("");
      const days = Array.from({ length: dayCount }, (_, index) => {
        const number = index + 1;
        const date = `${monthKey}-${String(number).padStart(2, "0")}`;
        const count = (slotsByDate.get(date) || []).length;
        return `<button type="button" class="schedule-calendar-day ${date === selectedScheduleDate ? "is-selected " : ""}${count ? "has-slots" : ""}" data-schedule-date="${date}" aria-pressed="${date === selectedScheduleDate}" aria-label="${escapeHtml(formatDate(date))}, ${count} schedules"><span>${number}</span>${count ? `<small>${count} slot${count === 1 ? "" : "s"}</small>` : ""}</button>`;
      }).join("");
      const selectedSlots = slotsByDate.get(selectedScheduleDate) || [];
      const slotCards = selectedSlots.map((slot) => {
        const provider = allStaff.find((item) => item.staff_id === slot.staff_id);
        const canToggle = ["Available", "Unavailable"].includes(slot.slot_status);
        return `<article class="schedule-slot-card"><div class="schedule-slot-heading"><div><span class="eyebrow">Appointment time</span><h3>${escapeHtml(formatTime(slot.start_time))}</h3></div>${badge(slot.slot_status)}</div><dl><div><dt>Provider</dt><dd>${escapeHtml(provider?.staff_name || "Provider not listed")}</dd></div><div><dt>Specialty</dt><dd>${escapeHtml(provider?.specialty_name || "Not listed")}</dd></div></dl>${canToggle ? `<button type="button" class="btn btn-secondary" data-slot-id="${escapeHtml(slot.slot_id)}" data-next-status="${slot.slot_status === "Available" ? "Unavailable" : "Available"}">${slot.slot_status === "Available" ? "Close this time" : "Reopen this time"}</button>` : '<p class="field-help">This time is linked to a booking.</p>'}</article>`;
      }).join("");
      root.innerHTML = `<div class="schedule-workspace"><section class="card schedule-calendar-card"><div class="schedule-calendar-heading"><div><p class="eyebrow">Clinic availability</p><h2>Schedule calendar</h2><p class="muted">Select a date to review its appointment times and providers.</p></div><div class="schedule-calendar-controls"><button type="button" class="btn btn-secondary" id="schedule-today">Today</button><button type="button" class="icon-btn" id="schedule-previous" aria-label="Previous month">&#8249;</button><button type="button" class="icon-btn" id="schedule-next" aria-label="Next month">&#8250;</button></div></div><div class="schedule-month-title" aria-live="polite">${escapeHtml(monthTitle)}</div><div class="calendar-weekdays schedule-weekdays" aria-hidden="true">${weekdayNames.map((day) => `<span>${day}</span>`).join("")}</div><div class="schedule-calendar-grid">${blanks}${days}</div><div class="schedule-calendar-legend"><span><i class="is-available"></i> Published schedule</span><span><i class="is-selected"></i> Selected date</span></div></section><aside class="card schedule-day-panel"><p class="eyebrow">Selected day</p><h2>${escapeHtml(formatDate(selectedScheduleDate))}</h2><p class="muted">${selectedSlots.length} schedule${selectedSlots.length === 1 ? "" : "s"} listed for this date.</p><div class="schedule-day-list">${slotCards || '<div class="empty schedule-empty"><strong>No schedules for this day</strong><p>Create a time slot to make it available for patient requests.</p><button type="button" class="btn btn-primary" data-create-schedule>Create a schedule</button></div>'}</div></aside></div>`;
      root.querySelector("#schedule-previous").addEventListener("click", () => { scheduleMonth = new Date(scheduleMonth.getFullYear(), scheduleMonth.getMonth() - 1, 1); render(); });
      root.querySelector("#schedule-next").addEventListener("click", () => { scheduleMonth = new Date(scheduleMonth.getFullYear(), scheduleMonth.getMonth() + 1, 1); render(); });
      root.querySelector("#schedule-today").addEventListener("click", () => { selectedScheduleDate = today(); scheduleMonth = new Date(today() + "T00:00:00"); scheduleMonth.setDate(1); render(); });
      root.querySelectorAll("[data-schedule-date]").forEach((button) => button.addEventListener("click", () => { selectedScheduleDate = button.dataset.scheduleDate; render(); }));
      root.querySelector("[data-create-schedule]")?.addEventListener("click", () => document.querySelector("#create-slot").click());
      root.querySelectorAll("[data-slot-id]").forEach((button) => button.addEventListener("click", async () => {
        await api.update("slots", button.dataset.slotId, { slot_status: button.dataset.nextStatus }, "slot_id");
        await render();
      }));
    };
    document.querySelector("#create-slot").addEventListener("click", async () => {
      const eligible = (await api.list("staff")).filter((staffMember) => staffMember.clinic_id === cid && staffMember.duty_status === "On Duty");
      if (!eligible.length) {
        toast("Add an on-duty staff member before creating schedules.");
        return;
      }
      const timeChoices = Array.from({ length: 96 }, (_, index) => {
        const minutes = index * 15;
        const hours = Math.floor(minutes / 60);
        const minute = String(minutes % 60).padStart(2, "0");
        const value = `${String(hours).padStart(2, "0")}:${minute}`;
        return { value, label: `${hours % 12 || 12}:${minute} ${hours >= 12 ? "PM" : "AM"}` };
      });
      const form = await formModal("Create appointment schedule", "Choose an upcoming date, on-duty team member, and start time.", [
        { name: "date", label: "Schedule date", type: "date", required: true, value: today(), min: today() },
        { name: "staffId", label: "On-duty team member", type: "select", required: true, options: [{ value: "", label: "Choose a team member" }, ...eligible.map((staffMember) => ({ value: staffMember.staff_id, label: `${staffMember.staff_name} \u00b7 ${staffRole(staffMember)}` }))] },
        { name: "time", label: "Start time", type: "select", required: true, options: [{ value: "", label: "Choose a start time" }, ...timeChoices], value: "09:00" },
      ], "Create schedule");
      if (!form) return;
      const { date, staffId, time } = form;
      if (date < today()) { toast("Choose today or a future date."); return; }
      const duplicate = (await api.list("slots")).some((slot) => slot.staff_id === staffId && slot.slot_date === date && slot.start_time === time);
      if (duplicate) { toast("That staff member already has a slot at this time."); return; }
      await api.create("slots", { slot_id: `slot_${Date.now()}`, clinic_id: cid, staff_id: staffId, slot_date: date, start_time: time, slot_status: "Available" });
      selectedScheduleDate = date;
      scheduleMonth = new Date(`${date}T00:00:00`);
      scheduleMonth.setDate(1);
      await render();
    });
    await render();
    return;
  }

  if (feature === "appointments") {
    root.innerHTML = `<div class="toolbar"><select class="select" id="status-filter"><option value="">All statuses</option>${["Pending", "Confirmed", "Cancellation Requested", "Reschedule Requested", "Completed", "Cancelled", "Rejected", "No-show"].map((s) => `<option>${s}</option>`).join("")}</select></div><div class="table-wrap"><table class="table"><thead><tr><th>Reference</th><th>Patient / contact</th><th>Service & visit details</th><th>Schedule</th><th>Status</th><th>Actions</th></tr></thead><tbody id="clinic-appointments"></tbody></table></div>`;
    const patients = await api.list("patients");
    const render = async () => {
      const apps = (await api.list("appointments")).filter(
        (a) =>
          a.clinic_id === cid &&
          (!root.querySelector("#status-filter").value ||
            a.appointment_status ===
              root.querySelector("#status-filter").value),
      );
      root.querySelector("#clinic-appointments").innerHTML =
        apps
          .map((a) => {
            const patient = patients.find((p) => p.patient_id === a.patient_id);
            const controls = a.appointment_status === "Cancellation Requested"
              ? `<button class="btn btn-danger" data-action="Cancelled" data-id="${escapeHtml(a.appointment_id)}">Approve cancellation</button><button class="btn btn-secondary" data-action="Confirmed" data-id="${escapeHtml(a.appointment_id)}">Decline cancellation</button>`
              : a.appointment_status === "Reschedule Requested"
                ? `<button class="btn btn-teal" data-reschedule-decision="approve" data-id="${escapeHtml(a.appointment_id)}">Approve new time</button><button class="btn btn-secondary" data-reschedule-decision="decline" data-id="${escapeHtml(a.appointment_id)}">Decline request</button>`
              :
              a.appointment_status === "Pending"
                ? `<button class="btn btn-teal" data-action="Confirmed" data-id="${escapeHtml(a.appointment_id)}">Confirm</button><button class="btn btn-danger" data-action="Rejected" data-id="${escapeHtml(a.appointment_id)}">Reject</button><button class="btn btn-secondary" data-action="Cancelled" data-id="${escapeHtml(a.appointment_id)}">Cancel</button>`
                : a.appointment_status === "Confirmed"
                  ? `<button class="btn btn-teal" data-action="Completed" data-id="${escapeHtml(a.appointment_id)}">Complete</button><button class="btn btn-danger" data-action="No-show" data-id="${escapeHtml(a.appointment_id)}">No-show</button><button class="btn btn-secondary" data-reschedule="${escapeHtml(a.appointment_id)}">Reschedule</button><button class="btn btn-secondary" data-action="Cancelled" data-id="${escapeHtml(a.appointment_id)}">Cancel</button>`
                  : "";
            const requestedTime = a.requested_reschedule ? `<br><small>Requested: ${formatDate(a.requested_reschedule.appointment_date)} ${escapeHtml(a.requested_reschedule.appointment_time)}</small>` : "";
            return `<tr><td><strong>${escapeHtml(a.reference_number)}</strong></td><td>${escapeHtml(patient?.name || a.patient_id)}${a.contact_number ? `<br><small>${escapeHtml(a.contact_number)}</small>` : ""}${a.contact_email ? `<br><small>${escapeHtml(a.contact_email)}</small>` : ""}</td><td><strong>${escapeHtml(a.service_name || "Service not specified")}</strong>${a.visit_reason ? `<br><small>${escapeHtml(a.visit_reason)}</small>` : ""}</td><td>${formatDate(a.appointment_date)} ${escapeHtml(a.appointment_time)}${requestedTime}</td><td>${badge(a.appointment_status)}</td><td><div class="actions">${controls}</div></td></tr>`;
          })
          .join("") ||
        '<tr><td colspan="6">No appointments match this filter.</td></tr>';
      root.querySelectorAll("[data-action]").forEach((button) =>
        button.addEventListener("click", async () => {
          const appointment = apps.find(
            (a) => a.appointment_id === button.dataset.id,
          );
          const nextStatus = button.dataset.action;
          const note = appointment.appointment_status === "Cancellation Requested"
            ? (nextStatus === "Cancelled" ? "Clinic approved the patient cancellation request." : "Clinic declined the patient cancellation request.")
            : `Clinic updated booking to ${nextStatus}.`;
          const history = [...(appointment.status_history || []), { status: nextStatus, at: new Date().toISOString(), note }];
          await api.update(
            "appointments",
            appointment.appointment_id,
            { appointment_status: nextStatus, status_history: history, ...(appointment.appointment_status === "Cancellation Requested" && nextStatus === "Confirmed" ? { cancellation_reason: "Clinic declined the cancellation request." } : {}) },
            "appointment_id",
          );
          if (["Rejected", "Cancelled"].includes(nextStatus))
            await api.update(
              "slots",
              appointment.slot_id,
              { slot_status: "Available" },
              "slot_id",
            );
          await saveNotification(
            appointment.patient_id,
            `Your appointment ${appointment.reference_number} is now ${nextStatus}.`,
          );
          toast(`Appointment marked ${nextStatus}.`);
          await render();
        }),
      );
      root.querySelectorAll("[data-reschedule-decision]").forEach((button) => button.addEventListener("click", async () => {
        const appointment = apps.find((item) => item.appointment_id === button.dataset.id);
        const requested = appointment?.requested_reschedule;
        if (!appointment || !requested) return;
        const decision = button.dataset.rescheduleDecision;
        const [slotsNow, appointmentsNow] = await Promise.all([api.list("slots"), api.list("appointments")]);
        const requestedSlot = slotsNow.find((slot) => slot.slot_id === requested.slot_id);
        const stillAvailable = requestedSlot?.slot_status === "Available" && !appointmentsNow.some((item) => item.appointment_id !== appointment.appointment_id && item.slot_id === requested.slot_id && item.appointment_status !== "Cancelled");
        if (decision === "approve" && !stillAvailable) {
          toast("That requested time is no longer available. Ask the patient to choose another time.");
          return;
        }
        const nextStatus = decision === "approve" ? "Confirmed" : "Confirmed";
        const note = decision === "approve" ? `Clinic approved the requested time ${formatDate(requested.appointment_date)} at ${requested.appointment_time}.` : "Clinic declined the reschedule request; the original booking remains confirmed.";
        if (decision === "approve") {
          await api.update("slots", appointment.slot_id, { slot_status: "Available" }, "slot_id");
          await api.update("slots", requested.slot_id, { slot_status: "Booked" }, "slot_id");
        }
        await api.update("appointments", appointment.appointment_id, {
          appointment_status: nextStatus,
          ...(decision === "approve" ? { slot_id: requested.slot_id, staff_id: requested.staff_id, appointment_date: requested.appointment_date, appointment_time: requested.appointment_time } : {}),
          requested_reschedule: null,
          status_history: [...(appointment.status_history || []), { status: nextStatus, at: new Date().toISOString(), note }],
        }, "appointment_id");
        await saveNotification(appointment.patient_id, `The clinic ${decision === "approve" ? "approved" : "declined"} your reschedule request for ${appointment.reference_number}.`);
        toast(decision === "approve" ? "New appointment time approved." : "Reschedule request declined.");
        await render();
      }));
      root.querySelectorAll("[data-reschedule]").forEach((button) =>
        button.addEventListener("click", async () => {
          const appointment = apps.find(
            (a) => a.appointment_id === button.dataset.reschedule,
          );
          const [slots, appointmentsNow, staffNow] = await Promise.all([
            api.list("slots"),
            api.list("appointments"),
            api.list("staff"),
          ]);
          const free = slots.filter(
            (s) =>
              s.clinic_id === cid &&
              s.slot_status === "Available" &&
              isFutureSlot(s) &&
              s.slot_id !== appointment.slot_id &&
              staffNow.some(
                (provider) =>
                  provider.staff_id === s.staff_id &&
                  provider.duty_status === "On Duty",
              ) &&
              !appointmentsNow.some(
                (other) =>
                  other.slot_id === s.slot_id &&
                  other.appointment_status !== "Cancelled",
              ),
          );
          if (!free.length) {
            toast("There are no available schedules to reschedule to.");
            return;
          }
          const selectedId = await formModal("Reschedule appointment", "Choose an available time for this patient.", { label: "Available schedule", type: "select", required: true, options: [{ value: "", label: "Choose a schedule" }, ...free.slice(0, 15).map((s) => ({ value: s.slot_id, label: `${formatDate(s.slot_date)} · ${s.start_time} · ${staffName(s.staff_id, staffNow)}` }))] }, "Apply schedule");
          const target = free.find((s) => s.slot_id === selectedId);
          if (!target) return;
          await api.update(
            "slots",
            appointment.slot_id,
            { slot_status: "Available" },
            "slot_id",
          );
          await api.update(
            "slots",
            target.slot_id,
            { slot_status: "Booked" },
            "slot_id",
          );
          await api.update(
            "appointments",
            appointment.appointment_id,
            {
              slot_id: target.slot_id,
              staff_id: target.staff_id,
              appointment_date: target.slot_date,
              appointment_time: target.start_time,
              status_history: [...(appointment.status_history || []), { status: appointment.appointment_status, at: new Date().toISOString(), note: `Clinic rescheduled to ${formatDate(target.slot_date)} at ${target.start_time}.` }],
            },
            "appointment_id",
          );
          await saveNotification(
            appointment.patient_id,
            `Your appointment ${appointment.reference_number} was rescheduled to ${formatDate(target.slot_date)} at ${target.start_time}.`,
          );
          await render();
        }),
      );
    };
    root.querySelector("#status-filter").addEventListener("change", render);
    await render();
    startPolling(render);
    return;
  }

  if (feature === "status-queue") {
    root.innerHTML = `<div class="grid grid-2"><form class="card" id="status-form"><h2>Clinic availability</h2>
      <div class="field"><label for="clinic-status">Current status</label><select class="select" id="clinic-status">${["Open", "Limited Services", "Closed"].map((status) => `<option ${clinic.clinic_status === status ? "selected" : ""}>${status}</option>`).join("")}</select></div>
      <div class="field"><label for="queue">Queue count</label><input class="input" type="number" min="0" id="queue" value="${Number(clinic.queue_count || 0)}" required></div>
      <div class="field"><label for="wait">Estimated waiting time (minutes)</label><input class="input" type="number" min="0" id="wait" value="${Number(clinic.estimated_wait_minutes || 0)}" required></div><button class="btn btn-primary">Publish update</button></form>
      <div class="card"><p class="eyebrow">Patient preview</p><h2>${escapeHtml(clinic.clinic_name)}</h2>${badge(clinic.clinic_status)}<div class="stat-value">${Number(clinic.queue_count || 0)}</div><p>people currently in queue</p></div></div>`;
    root.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      await api.update(
        "clinics",
        cid,
        {
          clinic_status: root.querySelector("#clinic-status").value,
          queue_count: Number(root.querySelector("#queue").value),
          estimated_wait_minutes: Number(root.querySelector("#wait").value),
        },
        "clinic_id",
      );
      toast("Public clinic status updated.");
    });
    return;
  }

  if (feature === "notifications") {
    const notes = (await api.list("notifications"))
      .filter((n) => n.recipient_id === cid)
      .reverse();
    root.innerHTML = `<div class="actions notice-actions"><button class="btn btn-secondary" id="mark-read">Mark all as read</button></div><div class="list">${notes.map((n) => `<article class="list-item ${n.read ? "" : "unread"}"><div class="avatar">${icon("bell")}</div><div class="grow"><strong>${escapeHtml(n.notification_type)}</strong><p>${escapeHtml(n.message)}</p><small class="muted">${formatDate(n.created_at.slice(0, 10))}</small></div></article>`).join("") || '<div class="empty">No notifications yet.</div>'}</div>`;
    root.querySelector("#mark-read").addEventListener("click", async () => {
      for (const note of notes.filter((n) => !n.read))
        await api.update(
          "notifications",
          note.notification_id,
          { read: true },
          "notification_id",
        );
      toast("All notifications marked as read.");
      location.reload();
    });
  }
}

async function adminPage(feature, session) {
  const root = document.querySelector("#page-content");
  const logAdminAction = async (action, entityType, entityId, reason = "") => {
    const logs = await api.list("activity_logs");
    await api.create("activity_logs", {
      log_id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      user_id: session.user_id,
      user_name: session.name,
      action,
      entity_type: entityType,
      entity_id: entityId,
      reason,
      created_at: new Date().toISOString(),
    });
  };
  const [clinics, patients, appointments, supportReports] = await Promise.all([
    api.clinics({ verified: false }),
    api.list("patients"),
    api.list("appointments"),
    api.list("support_reports"),
  ]);
  if (feature === "dashboard") {
    const recentAdminActivity = (await api.list("activity_logs"))
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5);
    const recentRegistrations = [
      ...clinics.map((item) => ({
        name: item.clinic_name,
        role: "Clinic",
        status: item.approval_status || "Pending Review",
        created_at: item.registration_submitted_at || item.created_at,
      })),
      ...patients.map((item) => ({
        name: item.name,
        role: "Patient",
        status: item.account_status || "Active",
        created_at: item.created_at,
      })),
    ]
      .filter((item) => item.created_at)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5);
    const pending = clinics.filter((clinic) => clinic.approval_status === "Pending");
    const approvedClinics = clinics.filter((clinic) => clinic.verified && clinic.approval_status === "Approved");
    const pendingAppointments = appointments.filter((appointment) => appointment.appointment_status === "Pending");
    const firstName = (session.name || "Administrator").trim().split(/\s+/)[0];
    root.innerHTML = `<section class="admin-welcome"><div><p class="eyebrow">System administration</p><h2>Welcome back, ${escapeHtml(firstName)}</h2><p>Monitor clinic onboarding, patient access, and platform activity from one workspace.</p></div><div class="actions"><a class="btn btn-primary" href="../clinic-approvals/clinic-approvals.html">Review registrations${pending.length ? ` <span class="admin-action-count">${pending.length}</span>` : ""}</a><a class="btn btn-secondary" href="../reports/reports.html">Open reports</a></div></section>
      <section class="admin-overview-stats" aria-label="Platform summary">
        <a class="card admin-stat admin-stat-alert" href="../clinic-approvals/clinic-approvals.html"><span>Awaiting review</span><strong>${pending.length}</strong><small>Clinic registrations</small></a>
        <a class="card admin-stat admin-stat-approved" href="../clinics/clinics.html?view=approved"><span>Approved clinics</span><strong>${approvedClinics.length}</strong><small>Active public listings</small></a>
        <a class="card admin-stat" href="../clinics/clinics.html"><span>Clinic accounts</span><strong>${clinics.length}</strong><small>All application statuses</small></a>
        <a class="card admin-stat" href="../support/support.html"><span>Open issues</span><strong>${supportReports.filter((report) => !["Resolved", "Closed"].includes(report.report_status)).length}</strong><small>Support reports to review</small></a>
        <a class="card admin-stat admin-stat-patients" href="../patients/patients.html"><span>Patient accounts</span><strong>${patients.length}</strong><small>Registered patients</small></a>
        <a class="card admin-stat admin-stat-appointments" href="../reports/reports.html"><span>Appointments</span><strong>${appointments.length}</strong><small>${pendingAppointments.length} pending clinic response</small></a>
      </section>
      <div class="admin-overview-grid"><section class="card admin-map-panel"><div class="dashboard-section-head"><div><p class="eyebrow">Network coverage</p><h2 class="section-title">Clinic locations</h2><p class="muted">Registered facilities across review and approved states.</p></div><a href="../clinics/clinics.html">View clinics</a></div><div class="dashboard-map" id="admin-dashboard-map"></div><p class="form-error" id="admin-map-error" role="status"></p></section>
      <section class="card admin-review-panel"><div class="dashboard-section-head"><div><p class="eyebrow">Needs attention</p><h2 class="section-title">Clinic registrations</h2></div><a href="../clinic-approvals/clinic-approvals.html">Review all</a></div>${pending.length ? `<div class="admin-review-list">${pending.slice(0, 4).map((clinic) => `<a href="../clinic-approvals/clinic-approvals.html?id=${encodeURIComponent(clinic.clinic_id)}"><span class="admin-review-avatar">${escapeHtml(clinic.clinic_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join(""))}</span><span><strong>${escapeHtml(clinic.clinic_name)}</strong><small>${escapeHtml([clinic.city, clinic.province].filter(Boolean).join(", ") || clinic.barangay || "Location not listed")}</small></span><span class="admin-review-arrow">›</span></a>`).join("")}</div>` : `<div class="admin-empty-state"><strong>Review queue is clear</strong><p>New clinic registrations will appear here.</p></div>`}</section></div>
      <section class="card admin-quick-links"><div><p class="eyebrow">Platform tools</p><h2 class="section-title">Common tasks</h2></div><div class="admin-quick-link-grid"><a href="../patients/patients.html"><span>${icon("user")}</span><strong>Manage accounts</strong><small>Patient and clinic records</small></a><a href="../support/support.html"><span>${icon("report")}</span><strong>Resolve issues</strong><small>${supportReports.filter((report) => !["Resolved", "Closed"].includes(report.report_status)).length} open support reports</small></a><a href="../platform-map/platform-map.html"><span>${icon("clinic")}</span><strong>Platform map</strong><small>Review submitted clinic locations</small></a><a href="../activity-logs/activity-logs.html"><span>${icon("log")}</span><strong>Activity logs</strong><small>Inspect administrative changes</small></a></div></section><section class="grid grid-2 admin-latest-grid"><article class="card"><p class="eyebrow">Support queue</p><h2 class="section-title">Open issue reports</h2>${supportReports.filter((r) => !["Resolved", "Closed"].includes(r.report_status)).slice(0, 4).map((r) => `<a class="admin-latest-row" href="../support/support.html"><span><strong>${escapeHtml(r.subject || "Support request")}</strong><small>${escapeHtml(r.report_category || "General")} · ${escapeHtml(r.created_at || "")}</small></span>${badge(r.report_status || "Received")}</a>`).join("") || '<p class="muted">No unresolved support reports.</p>'}<a class="btn btn-ghost" href="../support/support.html">Open support workspace</a></article><article class="card"><p class="eyebrow">Recent registrations</p><h2 class="section-title">New platform accounts</h2>${recentRegistrations.map((item) => `<div class="admin-latest-row"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.role)} · ${escapeHtml(item.created_at)}</small></span>${badge(item.status || "Registered")}</div>`).join("") || '<p class="muted">Registration timestamps are not present for the current seed records. New dated registrations will appear here.</p>'}<a class="btn btn-ghost" href="../patients/patients.html">Manage accounts</a></article><article class="card"><p class="eyebrow">Audit trail</p><h2 class="section-title">Recent platform activity</h2>${recentAdminActivity.map((item) => `<div class="admin-latest-row"><span><strong>${escapeHtml(item.action || "Platform update")}</strong><small>${escapeHtml(item.user_name || "Administrator")} · ${escapeHtml(item.entity_type || "record")} · ${escapeHtml(item.created_at || "")}</small></span></div>`).join("") || '<p class="muted">Administrative actions will appear here as they occur.</p>'}<a class="btn btn-ghost" href="../activity-logs/activity-logs.html">View activity log</a></article></section>`;
    renderClinicPreviewMap(
      "admin-dashboard-map",
      clinics.map((clinic) => ({
        clinic,
        href:
          clinic.approval_status === "Pending"
            ? `../clinic-approvals/clinic-approvals.html?id=${encodeURIComponent(clinic.clinic_id)}`
            : "../clinics/clinics.html",
      })),
    ).catch((error) => {
      const message = root.querySelector("#admin-map-error");
      if (message)
        message.textContent = `Map preview unavailable: ${error.message}`;
    });
    return;
  }
  if (feature === "profile") {
    const account = await api.get("users", session.user_id, "user_id");
    if (!account)
      throw new Error("The administrator account could not be found.");
    root.innerHTML = `<form class="card profile-form" id="admin-profile"><div class="field"><label for="admin-name">Display name</label><input class="input" id="admin-name" value="${escapeHtml(account.name || "")}" required maxlength="100"></div>
      <div class="field"><label for="admin-email">Email address</label><input class="input" id="admin-email" value="${escapeHtml(account.email || "")}" type="email" readonly><small class="muted">Contact an administrator to change the system account email.</small></div>
      <button class="btn btn-primary">Save profile</button></form>`;
    root
      .querySelector("#admin-profile")
      .addEventListener("submit", async (event) => {
        event.preventDefault();
        const name = root.querySelector("#admin-name").value.trim();
        if (!name) return;
        await api.update("users", account.user_id, { name }, "user_id");
        setSession({ ...session, name });
        await logAdminAction("Updated administrator profile", "user", account.user_id);
        toast("Profile changes saved.");
      });
    return;
  }
  if (feature === "notifications") {
    const notifications = (await api.list("notifications"))
      .filter((note) =>
        ["system_admin", session.user_id].includes(note.recipient_id),
      )
      .reverse();
    const notificationTarget = (note) => note.reference_type === "appointment" && note.reference_id
      ? `../appointments/appointments.html?appointment_id=${encodeURIComponent(note.reference_id)}`
      : note.reference_type === "clinic" && note.reference_id
      ? `../clinic-approvals/clinic-approvals.html?id=${encodeURIComponent(note.reference_id)}`
      : note.reference_type === "patient" && note.reference_id
        ? `../patients/patients.html?id=${encodeURIComponent(note.reference_id)}`
        : note.reference_type === "support_report" && note.reference_id
          ? `../support/support.html?id=${encodeURIComponent(note.reference_id)}`
          : "";
    root.innerHTML = `<div class="actions notice-actions"><button class="btn btn-secondary" id="mark-read">Mark all as read</button></div><div class="list">
      ${notifications.map((note) => `<article class="list-item ${note.read ? "" : "unread"}" data-admin-notification="${escapeHtml(note.notification_id)}"><div class="avatar">${icon("bell")}</div><div class="grow"><strong>${escapeHtml(note.notification_type)}</strong><p>${escapeHtml(note.message)}</p><small class="muted">${escapeHtml(new Date(note.created_at).toLocaleString())}</small>${notificationTarget(note) ? `<p><a href="${notificationTarget(note)}">Open related record</a></p>` : ""}</div>${note.read ? "" : '<button class="btn btn-ghost" data-notification-read>Mark read</button><span class="unread-dot"></span>'}</article>`).join("") || '<div class="empty">No system notifications yet.</div>'}</div>`;
    root.querySelectorAll("[data-notification-read]").forEach((button) => button.addEventListener("click", async () => { const article = button.closest("[data-admin-notification]"); const id = article.dataset.adminNotification; await api.update("notifications", id, { read: true }, "notification_id"); const note = notifications.find((item) => item.notification_id === id); if (note) note.read = true; article.classList.remove("unread"); button.remove(); article.querySelector(".unread-dot")?.remove(); const unread = notifications.filter((item) => !item.read).length; const count = document.querySelector("#header-unread-count"); count.textContent = unread > 99 ? "99+" : String(unread); count.hidden = unread === 0; }));
    root.querySelector("#mark-read").addEventListener("click", async () => {
      for (const note of notifications.filter((item) => !item.read))
        await api.update(
          "notifications",
          note.notification_id,
          { read: true },
          "notification_id",
        );
      toast("All notifications marked as read.");
      location.reload();
    });
    return;
  }
  if (feature === "clinic-approvals") {
    const view = new URLSearchParams(location.search).get("view");
    const pending = clinics.filter((c) => view === "follow-up" ? ["Needs Correction", "Rejected", "Deactivated"].includes(c.approval_status) : c.approval_status === "Pending");
    const requestedApprovalId = new URLSearchParams(location.search).get("id");
    const initialApprovalId = pending.some((clinic) => clinic.clinic_id === requestedApprovalId) ? requestedApprovalId : pending[0]?.clinic_id;
    root.innerHTML = `<div class="grid approvals-grid"><section class="card admin-approval-queue"><div class="dashboard-section-head"><div><p class="eyebrow">System oversight</p><h2>Pending registrations</h2><p class="muted">${pending.length} clinic${pending.length === 1 ? "" : "s"} waiting for a decision.</p></div></div><label class="admin-approval-search">Search registrations<input class="input" id="approval-search" type="search" placeholder="Clinic name, city, or specialty"></label><div class="list" id="approval-list">${pending.map((c) => `<button class="approval-item ${c.clinic_id === initialApprovalId ? "selected" : ""}" data-id="${escapeHtml(c.clinic_id)}"><span class="avatar">${escapeHtml(c.clinic_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join(""))}</span><span><strong>${escapeHtml(c.clinic_name)}</strong><small>${escapeHtml([c.city, c.province].filter(Boolean).join(", ") || c.barangay || "Location not listed")} · ${escapeHtml(c.specialties?.[0] || "Specialty not listed")}</small></span><span>→</span></button>`).join("") || '<div class="empty">No pending registrations.</div>'}</div></section><section class="card approval-detail-panel" id="approval-detail"><div class="empty">Select a registration to review its details.</div></section></div>`;
    root.querySelector("#approval-search")?.addEventListener("input", (event) => {
      const query = event.currentTarget.value.trim().toLowerCase();
      root.querySelectorAll(".approval-item").forEach((button) => { button.hidden = !button.textContent.toLowerCase().includes(query); });
    });
    const approvalQueueHeading = root.querySelector(".admin-approval-queue h2");
    if (approvalQueueHeading && view === "follow-up") approvalQueueHeading.textContent = "Application follow-up";
    root.querySelector("#approval-list")?.insertAdjacentHTML("beforebegin", `<div class="toolbar"><select class="select" id="approval-type"><option value="">All clinic types</option>${[...new Set(pending.map((c) => c.clinic_type).filter(Boolean))].map((type) => `<option>${escapeHtml(type)}</option>`).join("")}</select><label>Submitted <input class="input" id="approval-date" type="date"></label></div>`);
    const filterApplications = () => {
      const query = root.querySelector("#approval-search").value.trim().toLowerCase();
      const clinicType = root.querySelector("#approval-type").value;
      const submittedOn = root.querySelector("#approval-date").value;
      root.querySelectorAll(".approval-item").forEach((button) => {
        const clinic = pending.find((item) => item.clinic_id === button.dataset.id);
        const text = `${clinic.clinic_name} ${clinic.city || ""} ${clinic.province || ""} ${clinic.barangay || ""} ${(clinic.specialties || []).join(" ")}`.toLowerCase();
        const date = String(clinic.registration_submitted_at || clinic.created_at || "").slice(0, 10);
        button.hidden = Boolean((query && !text.includes(query)) || (clinicType && clinic.clinic_type !== clinicType) || (submittedOn && date !== submittedOn));
      });
    };
    root.querySelectorAll("#approval-search,#approval-type,#approval-date").forEach((el) => { el.addEventListener("input", filterApplications); el.addEventListener("change", filterApplications); });
    let approvalMap;
    let activeApprovalId;
    const show = (id) => {
      const clinic = pending.find((c) => c.clinic_id === id);
      if (!clinic) return;
      const hasMapPin =
        clinic.latitude !== null &&
        clinic.latitude !== undefined &&
        clinic.longitude !== null &&
        clinic.longitude !== undefined &&
        Number.isFinite(Number(clinic.latitude)) &&
        Number.isFinite(Number(clinic.longitude));
      const documents = Array.isArray(clinic.registration_documents)
        ? clinic.registration_documents
        : [];
      const missingReviewFields = [
        ["Clinic name", clinic.clinic_name],
        ["Clinic type", clinic.clinic_type],
        ["Address", clinic.address],
        ["Official clinic email", clinic.email],
        ["Clinic phone", clinic.contact_number],
        ["Authorized representative", clinic.representative_name],
        ["Service description", clinic.service_description || clinic.services?.length],
      ]
        .filter(([, value]) => !value)
        .map(([label]) => label);
      let adminSettings = {};
      try {
        adminSettings = JSON.parse(
          localStorage.getItem("lapitcare_admin_settings") || "{}",
        );
      } catch (error) {
        console.error("Admin review settings could not be loaded.", error);
      }
      activeApprovalId = id;
      const approvalUrl = new URL(location.href);
      approvalUrl.searchParams.set("id", id);
      history.replaceState(null, "", approvalUrl);
      approvalMap?.remove();
      approvalMap = null;
      root
        .querySelectorAll("[data-id]")
        .forEach((button) =>
          button.classList.toggle("selected", button.dataset.id === id),
        );
      root.querySelector("#approval-detail").innerHTML =
        `<p class="eyebrow">Registration review · Pending Review</p><h2>${escapeHtml(clinic.clinic_name)}</h2>
        <dl class="registration-profile-list"><div><dt>Clinic type</dt><dd>${escapeHtml(clinic.clinic_type || "Not provided")}</dd></div>
        <div><dt>Authorized representative</dt><dd>${escapeHtml(clinic.representative_name || "Not provided")}${clinic.representative_position ? ` · ${escapeHtml(clinic.representative_position)}` : ""}</dd></div>
        <div><dt>Official clinic contact</dt><dd>${escapeHtml(clinic.email || "Not provided")} · ${escapeHtml(clinic.contact_number || "Not provided")}</dd></div>
        <div><dt>Address</dt><dd>${escapeHtml(clinic.address || "Not provided")}</dd></div>
        <div><dt>Website / social link</dt><dd>${clinic.website_url ? `<a href="${escapeHtml(clinic.website_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(clinic.website_url)}</a>` : "Not provided"}</dd></div>
        <div><dt>Specialties</dt><dd>${escapeHtml((clinic.specialties || []).join(", ") || "Not provided")}</dd></div>
        <div><dt>Services</dt><dd>${escapeHtml(clinic.service_description || (clinic.services || []).join(", ") || "Not provided")}</dd></div>
        <div><dt>Operating hours</dt><dd>${escapeHtml(clinic.operating_hours || "Not provided")}</dd></div>
        <div><dt>License / registration</dt><dd>${escapeHtml(clinic.license_number || "Not provided")}${clinic.license_authority ? ` · ${escapeHtml(clinic.license_authority)}` : ""}${clinic.license_expiry ? ` · Expires ${escapeHtml(clinic.license_expiry)}` : ""}</dd></div>
        <div><dt>Submitted</dt><dd>${escapeHtml(clinic.registration_submitted_at || "Not provided")}</dd></div></dl>
        <section class="notice"><strong>Application completeness</strong>${missingReviewFields.length ? `<p>Check these missing fields: ${missingReviewFields.map(escapeHtml).join(", ")}.</p>` : `<p>All core information fields are present. Review the submitted content and documents manually.</p>`}</section>
        ${adminSettings.registrationRequirements ? `<section class="notice"><strong>Configured review checklist</strong><p>${escapeHtml(adminSettings.registrationRequirements)}</p><small>This is an administrator reminder, not an automated verification.</small></section>` : ""}
        <h3>Supporting documents</h3><p class="muted">Uploaded files have not been verified.</p><ul>${documents.map((file) => `<li><a href="${escapeHtml(file.data_url || "#")}" download="${escapeHtml(file.name || "clinic-document")}">${escapeHtml(file.name || "Supporting document")}</a> · ${escapeHtml(file.verification_status || "Not verified")}</li>`).join("") || "<li>No supporting documents submitted.</li>"}</ul>
        <h3>Review history</h3>${(clinic.review_history || []).slice().reverse().map((entry) => `<p><strong>${escapeHtml(entry.decision)}</strong> · ${escapeHtml(entry.reviewer || "Reviewer unavailable")} · ${escapeHtml(entry.created_at || "Time unavailable")}<br><small>${escapeHtml(entry.reason || "No review note")}</small></p>`).join("") || `<p class="muted">No prior decisions recorded.</p>`}
        ${hasMapPin ? `<div class="approval-map" id="approval-map" role="img" aria-label="Map pin for ${escapeHtml(clinic.clinic_name)}"></div><p class="muted">Submitted map pin: ${Number(clinic.latitude).toFixed(5)}, ${Number(clinic.longitude).toFixed(5)}</p><p class="form-error" id="approval-map-error" role="status"></p>` : '<p class="muted">No optional map pin was submitted. Review the street address above.</p>'}
        ${clinic.reviewer_feedback ? `<div class="notice"><strong>Previous review feedback</strong><p>${escapeHtml(clinic.reviewer_feedback)}</p></div>` : ""}
        <div class="actions">${clinic.approval_status === "Pending" ? '<button class="btn btn-teal" data-approve>Approve clinic</button><button class="btn btn-secondary" data-correction>Request corrections</button><button class="btn btn-danger" data-reject>Reject</button>' : '<button class="btn btn-secondary" data-reopen>Return to pending review</button>'}</div>`;
      if (hasMapPin) loadLeaflet()
        .then((L) => {
          if (!root.querySelector("#approval-map") || activeApprovalId !== id)
            return;
          approvalMap = L.map("approval-map").setView(
            [Number(clinic.latitude), Number(clinic.longitude)],
            16,
          );
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap",
          }).addTo(approvalMap);
          L.marker([Number(clinic.latitude), Number(clinic.longitude)])
            .addTo(approvalMap)
            .bindPopup(
              `<strong>${escapeHtml(clinic.clinic_name)}</strong><br>${escapeHtml(clinic.address)}, ${escapeHtml(clinic.barangay)}`,
            )
            .openPopup();
        })
        .catch((error) => {
          const message = root.querySelector("#approval-map-error");
          if (message && activeApprovalId === id)
            message.textContent = `The map could not be loaded: ${error.message}. The submitted coordinates are shown above.`;
        });
      root.querySelector("[data-approve]")?.addEventListener("click", () =>
        modal(
          "Approve this clinic?",
          "Its verified listing will become visible to patients.",
          async () => {
            await api.update(
              "clinics",
              id,
              {
                approval_status: "Approved",
                registration_status: "Approved",
                verified: true,
                clinic_status: "Closed",
                reviewer_feedback: "",
                review_history: [...(clinic.review_history || []), { decision: "Approved", reviewer: session.name, reason: "Application review completed", created_at: new Date().toISOString() }],
              },
              "clinic_id",
            );
            await logAdminAction("Approved clinic application", "clinic", id, "Application review completed");
            const users = await api.list("users");
            for (const user of users.filter((u) => u.clinic_id === id))
              await api.update(
                "users",
                user.user_id,
                { account_status: "Active" },
                "user_id",
              );
            await saveNotification(
              id,
              "Your clinic registration has been approved.",
              "Registration update",
            );
            location.reload();
          },
        ),
      );
      root
        .querySelector("[data-reject]")
        ?.addEventListener("click", async () => {
          const reason = await formModal("Reject clinic registration", "Provide a clear reason. This message will be sent to the clinic account.", { label: "Rejection reason", type: "textarea", required: true, maxlength: 500 }, "Reject registration");
          if (!reason) return;
          await api.update(
            "clinics",
            id,
            {
              approval_status: "Rejected",
              registration_status: "Rejected",
              verified: false,
              rejection_reason: reason,
              review_history: [...(clinic.review_history || []), { decision: "Rejected", reviewer: session.name, reason, created_at: new Date().toISOString() }],
            },
            "clinic_id",
          );
          await logAdminAction("Rejected clinic application", "clinic", id, reason);
          // Keep the representative account active so they can sign in, read the
          // rejection reason, and contact support. Clinic operations remain
          // blocked by the rejected registration status.
          await saveNotification(
            id,
            `Your clinic registration was rejected: ${reason}`,
            "Registration update",
          );
          location.reload();
        });
      root.querySelector("[data-correction]")?.addEventListener("click", async () => {
        const feedback = await formModal("Request clinic corrections", "List the specific information the clinic should update.", { label: "Required corrections", type: "textarea", required: true, maxlength: 1000 }, "Send correction request");
        if (!feedback) return;
        await api.update("clinics", id, { approval_status: "Needs Correction", registration_status: "Needs Correction", verified: false, reviewer_feedback: feedback, review_history: [...(clinic.review_history || []), { decision: "Needs Correction", reviewer: session.name, reason: feedback, created_at: new Date().toISOString() }] }, "clinic_id");
        for (const user of (await api.list("users")).filter((item) => item.clinic_id === id)) if (user.account_status === "Deactivated") await api.update("users", user.user_id, { account_status: "Active" }, "user_id");
        await logAdminAction("Requested clinic corrections", "clinic", id, feedback);
        await saveNotification(id, `Please update your clinic application: ${feedback}`, "Registration update");
        location.reload();
      });
      root.querySelector("[data-reopen]")?.addEventListener("click", async () => {
        const note = await formModal("Return application to review", "This reopens the application as Pending. Add an optional note for the audit log.", { label: "Administrative note (optional)", type: "textarea", required: false, maxlength: 500 }, "Return to review");
        if (note === null) return;
        await api.update("clinics", id, { approval_status: "Pending", registration_status: "Pending", verified: false }, "clinic_id");
        for (const user of (await api.list("users")).filter((item) => item.clinic_id === id)) await api.update("users", user.user_id, { account_status: "Active" }, "user_id");
        await logAdminAction("Reopened clinic application", "clinic", id, note);
        await saveNotification(id, "Your clinic application has been returned to pending review.", "Registration update");
        location.reload();
      });
    };
    root
      .querySelectorAll("[data-id]")
      .forEach((button) =>
        button.addEventListener("click", () => show(button.dataset.id)),
      );
    show(initialApprovalId);
    return;
  }
  if (feature === "clinics") {
    const clinicView = new URLSearchParams(location.search).get("view");
    root.innerHTML = `<section class="admin-page-intro"><p class="muted">Search clinic accounts, check facility details, and follow verification decisions from one workspace.</p><a class="btn btn-primary" href="../clinic-approvals/clinic-approvals.html">Review applications</a></section><div class="toolbar admin-clinic-filters"><input class="input" id="clinic-search" placeholder="Search clinic, representative, email, phone, ID, or area"><select class="select" id="clinic-state"><option value="">All review states</option><option>Pending</option><option>Approved</option><option>Needs Correction</option><option>Rejected</option><option>Suspended</option><option>Deactivated</option></select><label>Submitted <input class="input" id="clinic-date" type="date"></label></div><section class="admin-record-layout"><div class="table-wrap"><table class="table admin-clinic-table"><thead><tr><th>Clinic</th><th>Representative</th><th>Location</th><th>Review</th><th>Listing</th><th>Actions</th></tr></thead><tbody id="clinic-rows"></tbody></table></div><aside class="card" id="clinic-account-detail"><p class="muted">Select View to inspect clinic contacts, services, and review history.</p></aside></section>`;
    const render = () => {
      const query = root.querySelector("#clinic-search").value.toLowerCase();
      const state = root.querySelector("#clinic-state").value;
      const submittedOn = root.querySelector("#clinic-date").value;
      const visible = clinics.filter(
        (c) =>
          (clinicView !== "approved" || c.approval_status === "Approved") &&
          (!state || c.approval_status === state) &&
          (!submittedOn || String(c.registration_submitted_at || c.created_at || "").slice(0, 10) === submittedOn) &&
          (!query ||
            `${c.clinic_name} ${c.representative_name} ${c.email} ${c.contact_number} ${c.clinic_id} ${c.barangay} ${c.city} ${c.province}`
              .toLowerCase()
              .includes(query)),
      );
      root.querySelector("#clinic-rows").innerHTML =
        visible
          .map(
            (
              c,
            ) => `<tr><td><strong>${escapeHtml(c.clinic_name)}</strong><br><small>${escapeHtml(c.clinic_type || "Clinic")}</small></td><td>${escapeHtml(c.representative_name || "Not listed")}</td><td>${escapeHtml([c.barangay, c.city, c.province].filter(Boolean).join(", ") || "Not listed")}</td><td>${badge(c.approval_status || "Unknown")}</td><td>${badge(c.clinic_status || "Unknown")}</td>
        <td><div class="actions"><button class="btn btn-secondary" data-clinic-view="${escapeHtml(c.clinic_id)}">View</button><button class="btn btn-secondary" data-edit="${escapeHtml(c.clinic_id)}">Edit</button>${["Approved", "Suspended"].includes(c.approval_status) ? `<button class="btn ${c.approval_status === "Suspended" ? "btn-teal" : "btn-danger"}" data-toggle="${escapeHtml(c.clinic_id)}">${c.approval_status === "Suspended" ? "Restore" : "Suspend"}</button><button class="btn btn-danger" data-deactivate="${escapeHtml(c.clinic_id)}">Deactivate</button>` : `<a class="btn btn-secondary" href="../clinic-approvals/clinic-approvals.html?${c.approval_status === "Pending" ? "" : "view=follow-up&"}id=${encodeURIComponent(c.clinic_id)}">Review status</a>`}</div></td></tr>`,
          )
          .join("") ||
        '<tr><td colspan="6">No clinics match this filter.</td></tr>';
      root.querySelectorAll("[data-edit]").forEach((button) =>
        button.addEventListener("click", async () => {
          const clinic = clinics.find(
            (c) => c.clinic_id === button.dataset.edit,
          );
          const form = await formModal("Edit clinic information", "Update the clinic’s public listing details.", [
            { name: "name", label: "Clinic name", value: clinic.clinic_name, required: true },
            { name: "contact", label: "Contact number", value: clinic.contact_number || "", required: true, type: "tel" },
            { name: "address", label: "Clinic address", value: clinic.address || "", required: true },
            { name: "hours", label: "Operating hours", value: clinic.operating_hours || "", required: true },
          ], "Save clinic details");
          if (!form) return;
          const changes = {
            clinic_name: form.name,
            contact_number: form.contact,
            address: form.address,
            operating_hours: form.hours,
          };
          if (Object.values(changes).some((value) => !value)) {
            toast("Clinic name, contact, address, and hours are required.");
            return;
          }
          if (!/^\+?[0-9 ()-]{7,20}$/.test(changes.contact) || changes.contact.replace(/\D/g, "").length < 7) {
            toast("Enter a valid clinic contact number.");
            return;
          }
          const linkedAccount = (await api.list("users")).find((user) => user.clinic_id === clinic.clinic_id);
          const identity = await api.accountIdentityInUse("", changes.contact, linkedAccount?.user_id || "", "", clinic.clinic_id);
          if (identity.mobile) {
            toast("Another patient or clinic account already uses that mobile number.");
            return;
          }
          await api.update("clinics", clinic.clinic_id, changes, "clinic_id");
          await logAdminAction("Edited clinic public profile", "clinic", clinic.clinic_id);
          Object.assign(clinic, changes);
          render();
        }),
      );
      root.querySelectorAll("[data-clinic-view]").forEach((button) => button.addEventListener("click", () => {
        const clinic = clinics.find((item) => item.clinic_id === button.dataset.clinicView);
        root.querySelector("#clinic-account-detail").innerHTML = `<p class="eyebrow">Clinic account · ${escapeHtml(clinic.clinic_id)}</p><h2>${escapeHtml(clinic.clinic_name)}</h2><p>${badge(clinic.approval_status || "Unknown")}</p><dl class="registration-profile-list"><div><dt>Type & specialties</dt><dd>${escapeHtml(clinic.clinic_type || "Not provided")} · ${escapeHtml((clinic.specialties || []).join(", ") || "Not provided")}</dd></div><div><dt>Location</dt><dd>${escapeHtml([clinic.address, clinic.barangay, clinic.city, clinic.province].filter(Boolean).join(", ") || "Not provided")}</dd></div><div><dt>Public contact</dt><dd>${escapeHtml(clinic.email || "No email")} · ${escapeHtml(clinic.contact_number || "No phone")}</dd></div><div><dt>Representative</dt><dd>${escapeHtml(clinic.representative_name || "Not provided")}</dd></div><div><dt>Hours</dt><dd>${escapeHtml(clinic.operating_hours || "Not provided")}</dd></div></dl><h3>Review history</h3>${(clinic.review_history || []).map((item) => `<p><strong>${escapeHtml(item.decision)}</strong> · ${escapeHtml(item.reviewer)} · ${escapeHtml(item.created_at)}<br><small>${escapeHtml(item.reason || "No note")}</small></p>`).join("") || `<p class="muted">No recorded review actions.</p>`}<a href="../clinic-approvals/clinic-approvals.html?${clinic.approval_status === "Pending" ? "" : "view=follow-up&"}id=${encodeURIComponent(clinic.clinic_id)}">Open verification record</a>`;
      }));
      root.querySelectorAll("[data-toggle]").forEach((button) =>
        button.addEventListener("click", async () => {
          const clinic = clinics.find(
            (c) => c.clinic_id === button.dataset.toggle,
          );
          const next = ["Suspended", "Deactivated"].includes(
            clinic.approval_status,
          )
            ? "Approved"
            : "Suspended";
          let reason = "";
          if (next === "Suspended") {
            reason = await formModal("Suspend clinic account", "Provide a reason. The clinic will be notified and the public listing will be hidden.", { label: "Reason", type: "textarea", required: true, maxlength: 500 }, "Suspend clinic");
            if (!reason) return;
          } else {
            modal(`Restore ${clinic.clinic_name}?`, "This restores the clinic to approved status and makes the public listing eligible to appear again.", async () => {
              await api.update("clinics", clinic.clinic_id, { approval_status: "Approved", verified: true, suspension_reason: "" }, "clinic_id");
              for (const user of (await api.list("users")).filter((item) => item.clinic_id === clinic.clinic_id)) await api.update("users", user.user_id, { account_status: "Active" }, "user_id");
              await saveNotification(clinic.clinic_id, "Your clinic account was restored.", "Account update");
              await logAdminAction("Restored clinic account", "clinic", clinic.clinic_id);
              location.reload();
            });
            return;
          }
          await api.update(
            "clinics",
            clinic.clinic_id,
            { approval_status: next, verified: next === "Approved", suspension_reason: reason || "" },
            "clinic_id",
          );
          const users = await api.list("users");
          for (const user of users.filter(
            (u) => u.clinic_id === clinic.clinic_id,
          ))
            await api.update(
              "users",
              user.user_id,
              { account_status: next === "Approved" ? "Active" : "Suspended" },
              "user_id",
            );
          await saveNotification(
            clinic.clinic_id,
            `Your clinic account was ${next.toLowerCase()}.`,
            "Account update",
          );
          await logAdminAction(next === "Approved" ? "Restored clinic account" : "Suspended clinic account", "clinic", clinic.clinic_id, reason);
          toast(`Clinic ${next.toLowerCase()}.`);
          location.reload();
        }),
      );
      root.querySelectorAll("[data-deactivate]").forEach((button) =>
        button.addEventListener("click", async () => {
          const clinic = clinics.find(
            (c) => c.clinic_id === button.dataset.deactivate,
          );
          if (clinic.approval_status === "Deactivated") {
            toast("This clinic is already deactivated.");
            return;
          }
          modal(`Deactivate ${clinic.clinic_name}?`, "It will be hidden from patients, and its administrator will no longer be able to sign in. You can reactivate it later.", async () => {
          const reason = await formModal("Deactivate clinic", "Provide the administrative reason for deactivation.", { label: "Reason", type: "textarea", required: true, maxlength: 500 }, "Continue deactivation");
          if (!reason) return;
          await api.update(
            "clinics",
            clinic.clinic_id,
            {
              approval_status: "Deactivated",
              verified: false,
              clinic_status: "Closed",
            },
            "clinic_id",
          );
          const users = await api.list("users");
          for (const user of users.filter(
            (u) => u.clinic_id === clinic.clinic_id,
          ))
            await api.update(
              "users",
              user.user_id,
              { account_status: "Deactivated" },
              "user_id",
            );
          await saveNotification(
            clinic.clinic_id,
            "Your clinic account has been deactivated.",
            "Account update",
          );
          await logAdminAction("Deactivated clinic account", "clinic", clinic.clinic_id, reason);
          location.reload();
          });
        }),
      );
    };
    root
      .querySelectorAll("input,select")
      .forEach((el) => { el.addEventListener("input", render); el.addEventListener("change", render); });
    render();
    const requestedClinic = new URLSearchParams(location.search).get("id");
    if (requestedClinic) root.querySelector(`[data-clinic-view="${CSS.escape(requestedClinic)}"]`)?.click();
    return;
  }
  if (feature === "patients") {
    root.innerHTML = `<p class="muted">Manage account access and contact details needed for support. Sensitive medical details are not shown here.</p><div class="toolbar"><input class="input" id="patient-search" placeholder="Search name, email, mobile, or account ID"><select class="select" id="patient-status"><option value="">All account states</option><option>Active</option><option>Suspended</option><option>Deactivated</option></select><label>Registered <input class="input" id="patient-date" type="date"></label></div><div class="grid admin-monitor-grid"><div class="table-wrap"><table class="table"><thead><tr><th>Patient</th><th>Contact</th><th>Status</th><th>Action</th></tr></thead><tbody id="patient-rows"></tbody></table></div><aside class="card" id="patient-account-detail"><p class="muted">Select View for the account's permitted details and status history.</p></aside></div>`;
    const render = () => {
      const query = root.querySelector("#patient-search").value.toLowerCase();
      const state = root.querySelector("#patient-status").value;
      const registeredOn = root.querySelector("#patient-date").value;
      const visible = patients.filter(
        (p) => (!state || (p.account_status || "Active") === state) && (!registeredOn || String(p.created_at || "").slice(0, 10) === registeredOn) && (!query || `${p.name} ${p.email} ${p.mobile_number} ${p.patient_id}`.toLowerCase().includes(query)),
      );
      root.querySelector("#patient-rows").innerHTML = visible
        .map(
          (p) =>
            `<tr><td><strong>${escapeHtml(p.name)}</strong><br><small>${escapeHtml(p.patient_id)}</small></td><td>${escapeHtml(p.email || "No email")}<br><small>${escapeHtml(p.mobile_number || "No mobile")}</small></td><td>${badge(p.account_status || "Active")}</td><td><div class="actions"><button class="btn btn-secondary" data-patient-view="${escapeHtml(p.patient_id)}">View</button><button class="btn ${p.account_status === "Active" ? "btn-danger" : "btn-teal"}" data-patient="${escapeHtml(p.patient_id)}">${p.account_status === "Active" ? "Suspend" : "Restore"}</button></div></td></tr>`,
        )
        .join("");
      root.querySelectorAll("[data-patient]").forEach((button) =>
        button.addEventListener("click", async () => {
          const patient = patients.find(
            (p) => p.patient_id === button.dataset.patient,
          );
          const next =
            patient.account_status === "Active" ? "Suspended" : "Active";
          let reason = "";
          if (next !== "Active") {
            reason = await formModal("Suspend patient account", "Provide a reason for this administrative restriction.", { label: "Reason", type: "textarea", required: true, maxlength: 500 }, "Suspend account");
            if (!reason) return;
          } else {
            reason = await formModal("Restore patient account", "Confirm that this account should regain access.", { label: "Administrative note (optional)", type: "textarea", required: false, maxlength: 500 }, "Restore account");
            if (reason === null) return;
          }
          await api.update(
            "patients",
            patient.patient_id,
            { account_status: next },
            "patient_id",
          );
          const users = await api.list("users");
          for (const user of users.filter((u) => u.user_id === patient.user_id))
            await api.update(
              "users",
              user.user_id,
              { account_status: next },
              "user_id",
            );
          patient.account_status = next;
          await logAdminAction(next === "Active" ? "Restored patient account" : "Suspended patient account", "patient", patient.patient_id, reason);
          await saveNotification(patient.patient_id, next === "Active" ? "Your account access has been restored." : `Your account has been temporarily restricted. Reason: ${reason}`, "Account update");
          await render();
        }),
      );
      root.querySelectorAll("[data-patient-view]").forEach((button) => button.addEventListener("click", () => {
        const patient = patients.find((item) => item.patient_id === button.dataset.patientView);
        root.querySelector("#patient-account-detail").innerHTML = `<p class="eyebrow">Patient account · ${escapeHtml(patient.patient_id)}</p><h2>${escapeHtml(patient.name || "Patient")}</h2><p>${badge(patient.account_status || "Active")}</p><dl class="registration-profile-list"><div><dt>Email</dt><dd>${escapeHtml(patient.email || "Not provided")}</dd></div><div><dt>Mobile</dt><dd>${escapeHtml(patient.mobile_number || "Not provided")}</dd></div><div><dt>Account created</dt><dd>${escapeHtml(patient.created_at || "Date unavailable")}</dd></div><div><dt>Account reference</dt><dd>${escapeHtml(patient.user_id || patient.patient_id)}</dd></div></dl><h3>Administrative history</h3>${(patient.admin_history || []).map((item) => `<p><strong>${escapeHtml(item.action)}</strong> · ${escapeHtml(item.created_at)}<br><small>${escapeHtml(item.reason || "No note")}</small></p>`).join("") || `<p class="muted">Administrative changes are recorded in Activity Logs.</p>`}`;
      }));
    };
    root.querySelectorAll("input,select").forEach((el) => { el.addEventListener("input", render); el.addEventListener("change", render); });
    render();
    const requestedPatient = new URLSearchParams(location.search).get("id");
    if (requestedPatient) root.querySelector(`[data-patient-view="${CSS.escape(requestedPatient)}"]`)?.click();
    return;
  }
  if (feature === "admin-appointments") {
    const clinicById = new Map(clinics.map((item) => [item.clinic_id, item]));
    const patientById = new Map(patients.map((item) => [item.patient_id, item]));
    root.innerHTML = `<p class="muted">Platform-wide monitoring of shared booking records. Booking decisions remain with clinics unless a support case needs documented intervention.</p><div class="toolbar"><input class="input" id="admin-appointment-search" type="search" placeholder="Reference or patient"><select class="select" id="admin-appointment-status"><option value="">All statuses</option>${[...new Set(appointments.map((a) => a.appointment_status))].map((s) => `<option>${escapeHtml(s)}</option>`).join("")}</select><select class="select" id="admin-appointment-clinic"><option value="">All clinics</option>${clinics.map((c) => `<option value="${escapeHtml(c.clinic_id)}">${escapeHtml(c.clinic_name)}</option>`).join("")}</select><select class="select" id="admin-appointment-service"><option value="">All services</option>${[...new Set(appointments.map((a) => a.service_name || a.service).filter(Boolean))].map((s) => `<option>${escapeHtml(s)}</option>`).join("")}</select><input class="input" id="admin-appointment-date" type="date"></div><div class="grid admin-monitor-grid"><section class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Reference</th><th>Clinic</th><th>Patient</th><th>Date & time</th><th>Status</th><th></th></tr></thead><tbody id="admin-appointment-rows"></tbody></table></div></section><aside class="card" id="admin-appointment-detail"><p class="muted">Select an appointment to inspect its record and status history.</p></aside></div>`;
    const render = () => {
      const query = root.querySelector("#admin-appointment-search").value.trim().toLowerCase();
      const status = root.querySelector("#admin-appointment-status").value;
      const clinicFilter = root.querySelector("#admin-appointment-clinic").value;
      const serviceFilter = root.querySelector("#admin-appointment-service").value;
      const date = root.querySelector("#admin-appointment-date").value;
      const visible = appointments.filter((a) => {
        const clinic = clinicById.get(a.clinic_id), patient = patientById.get(a.patient_id);
        return (!status || a.appointment_status === status) && (!clinicFilter || a.clinic_id === clinicFilter) && (!serviceFilter || (a.service_name || a.service) === serviceFilter) && (!date || a.appointment_date === date) && (!query || `${a.reference_number} ${patient?.name || ""} ${patient?.email || ""}`.toLowerCase().includes(query));
      });
      root.querySelector("#admin-appointment-rows").innerHTML = visible.map((a) => `<tr><td><strong>${escapeHtml(a.reference_number || a.appointment_id)}</strong></td><td>${escapeHtml(clinicById.get(a.clinic_id)?.clinic_name || a.clinic_id)}</td><td>${escapeHtml(patientById.get(a.patient_id)?.name || "Patient record unavailable")}</td><td>${escapeHtml(a.appointment_date || "Date unavailable")}<br><small>${escapeHtml(a.appointment_time || "Time unavailable")}</small></td><td>${badge(a.appointment_status || "Unknown")}</td><td><button class="btn btn-secondary" data-appt="${escapeHtml(a.appointment_id)}">Details</button></td></tr>`).join("") || '<tr><td colspan="6">No matching appointments.</td></tr>';
      root.querySelectorAll("[data-appt]").forEach((button) => button.addEventListener("click", () => {
        const a = appointments.find((item) => item.appointment_id === button.dataset.appt), clinic = clinicById.get(a.clinic_id), patient = patientById.get(a.patient_id);
        const issues = [!clinic && "Clinic record missing", !patient && "Patient record missing", !a.reference_number && "Booking reference missing", !a.appointment_status && "Status missing"].filter(Boolean);
        root.querySelector("#admin-appointment-detail").innerHTML = `<p class="eyebrow">Booking record</p><h2>${escapeHtml(a.reference_number || a.appointment_id)}</h2><dl class="registration-profile-list"><div><dt>Clinic</dt><dd>${escapeHtml(clinic?.clinic_name || a.clinic_id)}</dd></div><div><dt>Patient</dt><dd>${escapeHtml(patient?.name || "Unavailable")}</dd></div><div><dt>Service</dt><dd>${escapeHtml(a.service_name || a.service || "Not recorded")}</dd></div><div><dt>Visit</dt><dd>${escapeHtml(a.appointment_date || "—")} · ${escapeHtml(a.appointment_time || "—")}</dd></div><div><dt>Status</dt><dd>${badge(a.appointment_status || "Unknown")}</dd></div><div><dt>Visit notes</dt><dd>${escapeHtml(a.visit_notes || a.reason_for_visit || a.notes || "None provided")}</dd></div></dl><h3>Record consistency</h3>${issues.length ? `<p class="form-error">${issues.map(escapeHtml).join(" · ")}</p>` : '<p class="muted">No basic reference or linked-record issues found.</p>'}<p class="muted">Status history: ${(a.status_history || []).map((entry) => `${escapeHtml(entry.status)} (${escapeHtml(entry.created_at || "time unavailable")})`).join(" · ") || "No status history recorded."}</p><a href="../clinics/clinics.html">Open clinic accounts</a>`;
      }));
    };
    root.querySelectorAll("input,select").forEach((el) => { el.addEventListener("input", render); el.addEventListener("change", render); }); render();
    const requestedAppointmentId = new URLSearchParams(location.search).get("appointment_id");
    if (requestedAppointmentId) root.querySelector(`[data-appt="${CSS.escape(requestedAppointmentId)}"]`)?.click();
    return;
  }
  if (feature === "platform-map") {
    let view = new URLSearchParams(location.search).get("view") || "map";
    const patientAreaCounts = [...patients.reduce((counts, patient) => {
      const area = [patient.barangay, patient.city, patient.province].filter(Boolean).join(", ") || "Area not provided";
      counts.set(area, (counts.get(area) || 0) + 1);
      return counts;
    }, new Map()).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    root.innerHTML = `<p class="muted">Clinic facilities are pinned from their submitted coordinates. Patient locations are shown as area totals only; private street addresses are not displayed.</p><div class="toolbar"><input class="input" id="map-search" type="search" placeholder="Search clinic or area"><select class="select" id="map-type"><option value="">All clinic types</option>${[...new Set(clinics.map((c) => c.clinic_type).filter(Boolean))].map((s) => `<option>${escapeHtml(s)}</option>`).join("")}</select><select class="select" id="map-status"><option value="">All review statuses</option>${[...new Set(clinics.map((c) => c.approval_status || "Unknown"))].map((s) => `<option>${escapeHtml(s)}</option>`).join("")}</select><button class="btn btn-secondary" id="map-toggle" type="button">${view === "map" ? "Show list" : "Show map"}</button></div><section class="card" id="platform-map-card"><div id="admin-platform-map" class="dashboard-map" style="min-height:430px"></div><p id="platform-map-error" class="form-error" role="status"></p></section><section class="card" id="platform-list-card"><h2 class="section-title">Clinic locations <small class="muted" id="map-result-count"></small></h2><div class="table-wrap"><table class="table"><thead><tr><th>Clinic</th><th>Area</th><th>Status</th><th>Coordinates</th><th>Location check</th><th></th></tr></thead><tbody id="map-clinic-rows"></tbody></table></div></section><section class="card admin-area-summary"><div><p class="eyebrow">Account coverage</p><h2 class="section-title">Patient accounts by area</h2><p class="muted">Aggregated from profile barangay and city fields. No patient marker or street address is shown.</p></div><div class="table-wrap"><table class="table"><thead><tr><th>Area</th><th>Patient accounts</th></tr></thead><tbody>${patientAreaCounts.map(([area, count]) => `<tr><td>${escapeHtml(area)}</td><td>${count}</td></tr>`).join("") || '<tr><td colspan="2">No area information is available.</td></tr>'}</tbody></table></div></section>`;
    const render = () => {
      const q = root.querySelector("#map-search").value.toLowerCase(), state = root.querySelector("#map-status").value, type = root.querySelector("#map-type").value;
      const rows = clinics.filter((c) => (!state || (c.approval_status || "Unknown") === state) && (!type || c.clinic_type === type) && (!q || `${c.clinic_name} ${c.barangay} ${c.city} ${c.province}`.toLowerCase().includes(q)));
      root.querySelector("#map-result-count").textContent = `· ${rows.length} clinics`;
      const hasCoordinates = (c) => c.latitude !== null && c.latitude !== undefined && c.latitude !== "" && c.longitude !== null && c.longitude !== undefined && c.longitude !== "" && Number.isFinite(Number(c.latitude)) && Number.isFinite(Number(c.longitude));
      const pinCount = new Map(); rows.forEach((c) => { if (hasCoordinates(c)) { const key = `${Number(c.latitude).toFixed(4)},${Number(c.longitude).toFixed(4)}`; pinCount.set(key, (pinCount.get(key) || 0) + 1); } });
      root.querySelector("#platform-map-card").hidden = view !== "map"; root.querySelector("#platform-list-card").hidden = view === "map";
      root.querySelector("#map-clinic-rows").innerHTML = rows.map((c) => { const hasPin = hasCoordinates(c); const key = hasPin ? `${Number(c.latitude).toFixed(4)},${Number(c.longitude).toFixed(4)}` : ""; const duplicate = hasPin && pinCount.get(key) > 1; return `<tr data-clinic-id="${escapeHtml(c.clinic_id)}"><td>${escapeHtml(c.clinic_name)}</td><td>${escapeHtml([c.barangay,c.city,c.province].filter(Boolean).join(", ") || "Not listed")}</td><td>${badge(c.approval_status || "Unknown")}</td><td>${hasPin ? `${Number(c.latitude).toFixed(5)}, ${Number(c.longitude).toFixed(5)}` : "Pin missing"}</td><td>${c.location_review_flag ? `Flagged: ${escapeHtml(c.location_review_flag)}` : duplicate ? "Possible shared pin" : hasPin ? "Submitted" : "Needs location review"}</td><td><a class="btn btn-secondary" href="${c.approval_status === "Pending" ? `../clinic-approvals/clinic-approvals.html?id=${encodeURIComponent(c.clinic_id)}` : `../clinics/clinics.html?id=${encodeURIComponent(c.clinic_id)}`}">View record</a><button class="btn btn-secondary" data-flag-location="${escapeHtml(c.clinic_id)}">${c.location_review_flag ? "Update flag" : "Flag location"}</button></td></tr>`; }).join("") || '<tr><td colspan="6">No clinics match these filters.</td></tr>';
      root.querySelectorAll("[data-flag-location]").forEach((button) => button.addEventListener("click", async () => { const clinic = rows.find((item) => item.clinic_id === button.dataset.flagLocation); const reason = await formModal("Flag clinic location for review", "Describe the concern. This records a review flag but does not change the clinic's address or coordinates.", { label: "Location concern", type: "textarea", required: true, maxlength: 500 }, "Save location flag"); if (!reason) return; await api.update("clinics", clinic.clinic_id, { location_review_flag: reason, location_flagged_at: new Date().toISOString(), location_flagged_by: session.user_id }, "clinic_id"); Object.assign(clinic, { location_review_flag: reason }); await logAdminAction("Flagged clinic location", "clinic", clinic.clinic_id, reason); await saveNotification(clinic.clinic_id, `An administrator flagged your listed location for review: ${reason}`, "Location review"); render(); }));
      if (view === "map") renderClinicPreviewMap("admin-platform-map", rows.map((clinic) => ({ clinic, href: clinic.approval_status === "Pending" ? `../clinic-approvals/clinic-approvals.html?id=${encodeURIComponent(clinic.clinic_id)}` : `../clinics/clinics.html?id=${encodeURIComponent(clinic.clinic_id)}` }))).catch((error) => { const message = root.querySelector("#platform-map-error"); if (message) message.textContent = `Map unavailable: ${error.message}. The clinic list is shown instead.`; root.querySelector("#platform-map-card").hidden = true; root.querySelector("#platform-list-card").hidden = false; });
    };
    root.querySelectorAll("#map-search,#map-type,#map-status").forEach((el) => { el.addEventListener("input", render); el.addEventListener("change", render); }); root.querySelector("#map-toggle").addEventListener("click", () => { view = view === "map" ? "list" : "map"; root.querySelector("#map-toggle").textContent = view === "map" ? "Show list" : "Show map"; render(); }); render(); return;
  }
  if (feature === "admin-support") {
    const reports = await api.list("support_reports");
    const users = await api.list("users");
    const submitter = (report) => report.patient_id ? `${patients.find((p) => p.patient_id === report.patient_id)?.name || "Patient"} · Patient` : (report.clinic_id || report.recipient_id) ? `${clinics.find((c) => c.clinic_id === (report.clinic_id || report.recipient_id))?.clinic_name || "Clinic"} · Clinic` : `${users.find((u) => u.user_id === report.user_id)?.name || "Account"} · ${users.find((u) => u.user_id === report.user_id)?.role || "Unknown role"}`;
    const supportRoles = [...new Set(reports.map((r) => r.patient_id ? "Patient" : r.clinic_id || r.recipient_id ? "Clinic" : users.find((u) => u.user_id === r.user_id)?.role || "Unknown"))];
    const supportPriorities = [...new Set(reports.map((r) => r.priority || r.severity).filter(Boolean))];
    root.innerHTML = `<p class="muted">Responses and statuses are shared with the submitter's support history. Internal notes remain administrator-only.</p><div class="actions"><button class="btn btn-primary" id="admin-new-report">Report a platform issue</button></div><div class="toolbar"><input class="input" id="support-search" type="search" placeholder="Search report, subject, or submitter"><select class="select" id="support-status"><option value="">All statuses</option>${[...new Set(reports.map((r) => r.report_status || "Received"))].map((s) => `<option>${escapeHtml(s)}</option>`).join("")}</select><select class="select" id="support-role"><option value="">All submitter roles</option>${supportRoles.map((s) => `<option>${escapeHtml(s)}</option>`).join("")}</select><select class="select" id="support-category"><option value="">All categories</option>${[...new Set(reports.map((r) => r.report_category).filter(Boolean))].map((s) => `<option>${escapeHtml(s)}</option>`).join("")}</select>${supportPriorities.length ? `<select class="select" id="support-priority"><option value="">All priorities</option>${supportPriorities.map((s) => `<option>${escapeHtml(s)}</option>`).join("")}</select>` : ""}<label>Submitted <input class="input" id="support-date" type="date"></label></div><div class="grid admin-monitor-grid"><section class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Report</th><th>Submitter / role</th><th>Category</th><th>Submitted</th><th>Status</th><th></th></tr></thead><tbody id="support-rows"></tbody></table></div></section><aside class="card" id="support-detail"><p class="muted">Choose an issue to review.</p></aside></div>`;
    root.querySelector("#admin-new-report").addEventListener("click", async () => { const values = await formModal("Report a platform issue", "This report is saved in the shared support queue as an administrator submission.", [{name:"report_category",label:"Category",required:true},{name:"subject",label:"Subject",required:true,maxlength:120},{name:"description",label:"Description",type:"textarea",required:true,maxlength:2000}], "Submit report"); if (!values) return; const record={support_report_id:`sup_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,user_id:session.user_id,report_category:values.report_category,subject:values.subject,description:values.description,report_status:"Submitted",resolution_notes:"",created_at:new Date().toISOString()}; await api.create("support_reports",record); reports.push(record); await logAdminAction("Submitted a platform issue","support_report",record.support_report_id); renderSupportQueue(); toast("Your issue was added to the support queue."); });
    const render = () => { const q = root.querySelector("#support-search").value.toLowerCase(), s = root.querySelector("#support-status").value; const rows = reports.filter((r) => (!s || (r.report_status || "Received") === s) && (!q || `${r.support_report_id} ${r.subject} ${r.description} ${submitter(r)} ${r.report_category}`.toLowerCase().includes(q))).sort((a,b) => new Date(a.created_at)-new Date(b.created_at)); root.querySelector("#support-rows").innerHTML = rows.map((r) => `<tr><td><strong>${escapeHtml(r.support_report_id || "Support report")}</strong><br>${escapeHtml(r.subject || "No subject")}</td><td>${escapeHtml(submitter(r))}</td><td>${escapeHtml(r.report_category || "General")}</td><td>${escapeHtml(r.created_at || "Unknown")}</td><td>${badge(r.report_status || "Received")}</td><td><button class="btn btn-secondary" data-report="${escapeHtml(r.support_report_id)}">Review</button></td></tr>`).join("") || '<tr><td colspan="6">No reports match this filter.</td></tr>'; root.querySelectorAll("[data-report]").forEach((button) => button.addEventListener("click", () => { const r = reports.find((item) => item.support_report_id === button.dataset.report); root.querySelector("#support-detail").innerHTML = `<p class="eyebrow">${escapeHtml(r.report_category || "Support issue")} · ${escapeHtml(submitter(r))}</p><h2>${escapeHtml(r.subject || "Support request")}</h2><p>${escapeHtml(r.description || "No description provided.")}</p>${r.attachment?.name ? `<p>Attachment: ${escapeHtml(r.attachment.name)}</p>` : ""}<p class="muted">Current response: ${escapeHtml(r.resolution_notes || "No response yet")}</p><label class="field">Status<select class="select" id="support-next-status">${["Received","Submitted","In Progress","Awaiting Information","Resolved","Closed"].map((s) => `<option ${s === r.report_status ? "selected" : ""}>${s}</option>`).join("")}</select></label><label class="field">User-facing response / resolution<textarea class="input" id="support-response" rows="3">${escapeHtml(r.resolution_notes || "")}</textarea></label><label class="field">Internal admin note<textarea class="input" id="support-internal" rows="2">${escapeHtml(r.internal_notes || "")}</textarea></label><button class="btn btn-primary" id="save-support">Save update</button>`; root.querySelector("#save-support").addEventListener("click", async (event) => { event.currentTarget.disabled = true; const status = root.querySelector("#support-next-status").value, response = root.querySelector("#support-response").value.trim(), internal = root.querySelector("#support-internal").value.trim(); await api.update("support_reports", r.support_report_id, { report_status: status, resolution_notes: response, internal_notes: internal, assigned_admin_id: session.user_id, updated_at: new Date().toISOString() }, "support_report_id"); Object.assign(r, { report_status: status, resolution_notes: response, internal_notes: internal }); await logAdminAction(`Updated support report to ${status}`, "support_report", r.support_report_id, internal || response); const recipient = r.patient_id || r.clinic_id || r.recipient_id || r.user_id; if (recipient) await saveNotification(recipient, `Your support report ${r.support_report_id} is now ${status}.${response ? ` ${response}` : ""}`, "Support update"); toast("Support report updated."); render(); }); })); };
    const renderSupportQueue = () => {
      render();
      const role = root.querySelector("#support-role").value;
      const category = root.querySelector("#support-category").value;
      const priority = root.querySelector("#support-priority")?.value || "";
      const date = root.querySelector("#support-date").value;
      const tableRows = [...root.querySelectorAll("#support-rows tr")];
      tableRows.sort((a, b) => {
        const reportFor = (row) => reports.find((item) => item.support_report_id === row.querySelector("[data-report]")?.dataset.report);
        const left = reportFor(a), right = reportFor(b);
        const leftClosed = !left || ["Resolved", "Closed"].includes(left.report_status);
        const rightClosed = !right || ["Resolved", "Closed"].includes(right.report_status);
        return Number(leftClosed) - Number(rightClosed) || new Date(left?.created_at || 0) - new Date(right?.created_at || 0);
      });
      tableRows.forEach((row) => {
        root.querySelector("#support-rows").append(row);
        const button = row.querySelector("[data-report]");
        if (!button) return;
        const report = reports.find((item) => item.support_report_id === button.dataset.report);
        const reportRole = submitter(report).split(" · ").pop();
        row.hidden = Boolean((role && reportRole !== role) || (category && report.report_category !== category) || (priority && (report.priority || report.severity || "") !== priority) || (date && String(report.created_at || "").slice(0, 10) !== date));
      });
    };
    root.querySelectorAll("input,select").forEach((el) => { el.addEventListener("input", renderSupportQueue); el.addEventListener("change", renderSupportQueue); }); renderSupportQueue();
    const requestedReport = new URLSearchParams(location.search).get("id");
    if (requestedReport) root.querySelector(`[data-report="${CSS.escape(requestedReport)}"]`)?.click();
    return;
  }
  if (feature === "admin-help") {
    const faqs = await api.list("faqs");
    root.innerHTML = `<p class="muted">Published entries are shared with the patient and clinic Help Center.</p><div class="actions"><button class="btn btn-primary" id="add-faq">Add FAQ</button></div><div class="toolbar"><input class="input" id="faq-admin-search" type="search" placeholder="Search help entries"><select class="select" id="faq-admin-audience"><option value="">All audiences</option><option>General</option><option>Patient</option><option>Clinic</option></select></div><div class="card"><div class="list" id="faq-admin-list"></div></div>`;
    const render = () => { const q = root.querySelector("#faq-admin-search").value.toLowerCase(), audience = root.querySelector("#faq-admin-audience").value; const rows = faqs.filter((f) => (!audience || f.audience === audience) && (!q || `${f.question} ${f.answer} ${f.category}`.toLowerCase().includes(q))); root.querySelector("#faq-admin-list").innerHTML = rows.map((f) => `<article class="list-item"><div class="grow"><strong>${escapeHtml(f.question)}</strong><div class="muted">${escapeHtml(f.audience || "General")} · ${escapeHtml(f.category || "General")} · ${f.published === false ? "Unpublished" : "Published"}</div><p>${escapeHtml(f.answer)}</p></div><div class="actions"><button class="btn btn-secondary" data-faq-edit="${escapeHtml(f.faq_id)}">Edit</button><button class="btn btn-secondary" data-faq-publish="${escapeHtml(f.faq_id)}">${f.published === false ? "Publish" : "Unpublish"}</button></div></article>`).join("") || '<p class="empty">No help entries yet.</p>'; root.querySelectorAll("[data-faq-edit]").forEach((b) => b.addEventListener("click", async () => { const f = faqs.find((x) => x.faq_id === b.dataset.faqEdit); const values = await formModal("Edit help entry", "Update the published support answer.", [{name:"question",label:"Question",value:f.question,required:true},{name:"answer",label:"Answer",value:f.answer,type:"textarea",required:true},{name:"audience",label:"Audience",type:"select",value:f.audience || "General",required:true,options:[{value:"General",label:"General"},{value:"Patient",label:"Patient"},{value:"Clinic",label:"Clinic"}]},{name:"category",label:"Category",value:f.category || "General"}], "Save FAQ"); if (!values) return; Object.assign(f, values); await api.update("faqs", f.faq_id, values, "faq_id"); await logAdminAction("Edited FAQ", "faq", f.faq_id); render(); })); root.querySelectorAll("[data-faq-publish]").forEach((b) => b.addEventListener("click", async () => { const f=faqs.find((x)=>x.faq_id===b.dataset.faqPublish); f.published=f.published===false; await api.update("faqs",f.faq_id,{published:f.published},"faq_id"); await logAdminAction(`${f.published?"Published":"Unpublished"} FAQ`,"faq",f.faq_id); render(); })); };
    root.querySelector("#add-faq").addEventListener("click", async () => { const values = await formModal("Add help entry", "Write a short, user-facing answer.", [{name:"question",label:"Question",required:true},{name:"answer",label:"Answer",type:"textarea",required:true},{name:"audience",label:"Audience",type:"select",value:"General",required:true,options:[{value:"General",label:"General"},{value:"Patient",label:"Patient"},{value:"Clinic",label:"Clinic"}]},{name:"category",label:"Category",value:"General"}], "Add FAQ"); if (!values) return; const record={faq_id:`faq_${Date.now()}`,...values,published:true,created_at:new Date().toISOString()}; await api.create("faqs",record); faqs.push(record); await logAdminAction("Created FAQ", "faq", record.faq_id); render(); }); root.querySelectorAll("input,select").forEach((el)=>el.addEventListener("input",render)); render(); return;
  }
  if (feature === "admin-settings") {
    const settings = JSON.parse(localStorage.getItem("lapitcare_admin_settings") || "{}");
    root.innerHTML = `<p class="notice">These preferences apply only to this browser prototype. They do not secure a deployed service or establish real clinic verification.</p><section class="card"><h2>Registration review & booking policy</h2><label class="field">Suggested clinic review requirements<textarea class="input" id="registration-requirements" rows="3" placeholder="Reviewer checklist reminder">${escapeHtml(settings.registrationRequirements || "")}</textarea><small class="muted">Shown to reviewers during application inspection. It is not an automated compliance check.</small></label><label class="field">Patient cancellation notice (hours)<input class="input" id="cancel-window" type="number" min="0" max="720" required value="${Number(settings.cancellationWindow ?? 12)}"><small class="muted">Controls the patient reschedule/cancellation eligibility rule.</small></label><button class="btn btn-primary" id="save-settings">Save settings</button></section><section class="card"><h2>Clinic offerings</h2><p class="muted">Review the specialties and services registered by each clinic in the activity workspace.</p><a class="btn btn-secondary" href="../activity-logs/activity-logs.html">Open Activity Logs</a></section>`;
    root.querySelector("#save-settings").addEventListener("click", async () => { const windowInput = root.querySelector("#cancel-window"); const next={registrationRequirements:root.querySelector("#registration-requirements").value.trim(),cancellationWindow:Number(windowInput.value)}; if (!windowInput.value.trim() || !Number.isFinite(next.cancellationWindow)||next.cancellationWindow<0||next.cancellationWindow>720) return toast("Enter a cancellation window from 0 to 720 hours."); localStorage.setItem("lapitcare_admin_settings",JSON.stringify(next)); await logAdminAction("Updated prototype system settings","settings","lapitcare_admin_settings",JSON.stringify(next)); toast("System settings saved for this browser."); }); return;
  }
  if (feature === "specialties") {
    location.replace("../activity-logs/activity-logs.html");
    return;
  }
  if (feature === "reports") {
    const supportReports = await api.list("support_reports");
    root.innerHTML = `<div class="toolbar"><label>From <input class="input" id="report-from" type="date"></label><label>To <input class="input" id="report-to" type="date"></label><button class="btn btn-secondary" id="csv">Export appointment CSV</button></div>
      <div class="grid grid-3" id="report-stats"></div><div class="grid grid-3"><div class="card report-chart"><h2>Appointments by status</h2><div class="table-wrap"><table class="table"><thead><tr><th>Status</th><th>Count</th></tr></thead><tbody id="report-rows"></tbody></table></div></div><div class="card report-chart"><h2>Appointments by clinic</h2><div class="table-wrap"><table class="table"><thead><tr><th>Clinic</th><th>Count</th></tr></thead><tbody id="report-clinic-rows"></tbody></table></div></div><div class="card report-chart"><h2>Issues by status</h2><div class="table-wrap"><table class="table"><thead><tr><th>Status</th><th>Count</th></tr></thead><tbody id="report-issue-rows"></tbody></table></div></div></div>`;
    const report = () => {
      const from = root.querySelector("#report-from").value;
      const to = root.querySelector("#report-to").value;
      const rows = appointments.filter(
        (a) =>
          (!from || a.appointment_date >= from) &&
          (!to || a.appointment_date <= to),
      );
      const complete = rows.filter(
        (a) => a.appointment_status === "Completed",
      ).length;
      const rate = rows.length ? Math.round((complete / rows.length) * 100) : 0;
      const inRange = (item, dateField = "created_at") => { const date = String(item[dateField] || item.registration_submitted_at || "").slice(0, 10); return (!from || (date && date >= from)) && (!to || (date && date <= to)); };
      const clinicRegistrations = clinics.filter((item) => inRange(item));
      const patientRegistrations = patients.filter((item) => inRange(item));
      const issuesInRange = supportReports.filter((item) => inRange(item));
      root.querySelector("#report-stats").innerHTML =
        `<div class="card stat-card"><span class="stat-label">Appointments</span><div class="stat-value">${rows.length}</div></div><div class="card stat-card"><span class="stat-label">Completion rate</span><div class="stat-value">${rate}%</div></div><div class="card stat-card"><span class="stat-label">Patient registrations</span><div class="stat-value">${patientRegistrations.length}</div></div><div class="card stat-card"><span class="stat-label">Clinic applications</span><div class="stat-value">${clinicRegistrations.length}</div></div><div class="card stat-card"><span class="stat-label">Approved clinics</span><div class="stat-value">${clinicRegistrations.filter((c) => c.verified && c.approval_status === "Approved").length}</div></div><div class="card stat-card"><span class="stat-label">Issue reports</span><div class="stat-value">${issuesInRange.length}</div></div>`;
      const counts = [...new Set(rows.map((a) => a.appointment_status))].sort();
      root.querySelector("#report-rows").innerHTML =
        counts
          .map(
            (status) =>
              `<tr><td>${escapeHtml(status)}</td><td>${rows.filter((a) => a.appointment_status === status).length}</td></tr>`,
          )
          .join("") ||
        '<tr><td colspan="2">No appointments in this date range.</td></tr>';
      const clinicCounts = [...new Set(rows.map((a) => a.clinic_id))].map((id) => ({ name: clinics.find((c) => c.clinic_id === id)?.clinic_name || id || "Unknown clinic", count: rows.filter((a) => a.clinic_id === id).length })).sort((a, b) => b.count - a.count);
      root.querySelector("#report-clinic-rows").innerHTML = clinicCounts.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${item.count}</td></tr>`).join("") || '<tr><td colspan="2">No clinic bookings in this range.</td></tr>';
      const issueRows = supportReports.filter((item) => inRange(item));
      const issueStatuses = [...new Set(issueRows.map((item) => item.report_status || "Received"))].sort();
      root.querySelector("#report-issue-rows").innerHTML = issueStatuses.map((status) => `<tr><td>${escapeHtml(status)}</td><td>${issueRows.filter((item) => (item.report_status || "Received") === status).length}</td></tr>`).join("") || '<tr><td colspan="2">No issue reports in this range.</td></tr>';
    };
    root
      .querySelectorAll("input")
      .forEach((el) => el.addEventListener("change", report));
    root.querySelector("#csv").addEventListener("click", () => {
      const from = root.querySelector("#report-from").value;
      const to = root.querySelector("#report-to").value;
      const rows = appointments.filter(
        (a) =>
          (!from || a.appointment_date >= from) &&
          (!to || a.appointment_date <= to),
      );
      const csv = [
        "reference_number,clinic_id,patient_id,appointment_date,appointment_time,status",
        ...rows.map((a) =>
          [
            a.reference_number,
            a.clinic_id,
            a.patient_id,
            a.appointment_date,
            a.appointment_time,
            a.appointment_status,
          ]
            .map((value) => `"${String(value).replaceAll('"', '""')}"`)
            .join(","),
        ),
      ].join("\r\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "lapitcare-appointments.csv";
      link.click();
      URL.revokeObjectURL(url);
    });
    report();
    return;
  }
  if (feature === "activity-logs") {
    const logs = await api.list("activity_logs");
    root.innerHTML = `<div class="toolbar"><input class="input" id="log-search" placeholder="Filter by account, clinic, service, or action"><select class="select" id="log-entity"><option value="">All entities</option>${[...new Set(logs.map((l) => l.entity_type))].map((type) => `<option>${escapeHtml(type)}</option>`).join("")}</select></div>
      <section class="card admin-catalog-log"><div><p class="eyebrow">Current clinic offerings</p><h2 class="section-title">Registered specialties & services</h2><p class="muted">A current shared-data snapshot. Changes made by clinics are also recorded in the activity stream below.</p></div><div class="table-wrap"><table class="table"><thead><tr><th>Clinic</th><th>Review status</th><th>Specialties</th><th>Services</th></tr></thead><tbody id="catalog-rows"></tbody></table></div></section>
      <section class="card admin-activity-log"><h2 class="section-title">Activity stream</h2><div class="table-wrap"><table class="table"><thead><tr><th>Timestamp</th><th>Acting account</th><th>Action</th><th>Affected record</th><th>Reason / note</th></tr></thead><tbody id="log-rows"></tbody></table></div></section>`;
    const render = () => {
      const query = root.querySelector("#log-search").value.toLowerCase();
      const type = root.querySelector("#log-entity").value;
      const filtered = logs.filter(
        (log) =>
          (!type || log.entity_type === type) &&
          (!query ||
            `${log.user_name} ${log.action} ${log.entity_id} ${log.reason}`.toLowerCase().includes(query)),
      );
      root.querySelector("#log-rows").innerHTML =
        filtered
          .map(
            (log) =>
              `<tr><td>${escapeHtml(log.created_at)}</td><td>${escapeHtml(log.user_name)}</td><td>${escapeHtml(log.action)}</td><td>${badge(escapeHtml(log.entity_type))}<br><small>${escapeHtml(log.entity_id || "Record not captured")}</small></td><td>${escapeHtml(log.reason || "—")}</td></tr>`,
          )
          .join("") || '<tr><td colspan="5">No matching activity.</td></tr>';
      const clinicRows = clinics.filter((clinic) => !query || `${clinic.clinic_name} ${clinic.clinic_id} ${(clinic.specialties || []).join(" ")} ${(clinic.services || []).join(" ")}`.toLowerCase().includes(query));
      root.querySelector("#catalog-rows").innerHTML = clinicRows.map((clinic) => `<tr><td><strong>${escapeHtml(clinic.clinic_name)}</strong><br><small>${escapeHtml(clinic.clinic_id)}</small></td><td>${badge(clinic.approval_status || "Unknown")}</td><td>${(clinic.specialties || []).map(escapeHtml).join(", ") || "Not listed"}</td><td>${[...(clinic.services || []), ...(clinic.service_catalog || []).map((service) => service.name).filter((name) => !(clinic.services || []).includes(name))].map(escapeHtml).join(", ") || "Not listed"}</td></tr>`).join("") || '<tr><td colspan="4">No clinic offerings match this search.</td></tr>';
    };
    root
      .querySelectorAll("input,select")
      .forEach((el) => el.addEventListener("input", render));
    render();
  }
}

export async function initRolePage(role, feature) {
  let session = guard(role);
  if (!session) return;
  shell(role, feature, session);
  try {
    session = await api.currentUser();
    setSession(session);
    session = getSession();
    const account = await api.get("users", session.user_id, "user_id");
    if (
      !account ||
      account.role !== role ||
      account.account_status !== "Active"
    ) {
      clearSession();
      document.querySelector("#page-content").innerHTML =
        `<div class="notice">This account is no longer active. <a href="${appPath("/auth/patient/login.html")}">Sign in again</a>.</div>`;
      return;
    }
    if (role === "Patient") await patientPage(feature, session);
    else if (role === "Clinic Administrator")
      await clinicPage(feature, session);
    else await adminPage(feature, session);
  } catch (error) {
    console.error(error);
    setPageError(error);
  }
}
