import { api } from "./api.js";
import { badge, formModal, modal, toast } from "./ui.js";
import { loadLeaflet } from "./map.js";
import { startPolling } from "./polling.js";

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const dateToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
const fmtDate = (date) => date ? new Date(`${date}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "Date not set";
const fmtTime = (time) => { const [h, m] = String(time || "").split(":").map(Number); return Number.isFinite(h) ? `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}` : "Time not set"; };
const staffRole = (staff) => staff.staff_role || "Healthcare Provider";
const statusText = (clinic) => {
  const approval = String(clinic.approval_status || "").toLowerCase();
  const registration = String(clinic.registration_status || "").toLowerCase();
  if (approval === "approved") return "Approved";
  if (approval === "rejected" || registration === "rejected") return "Rejected";
  if (approval === "needs correction" || registration === "needs correction") return "Needs Correction";
  if (approval === "pending" || registration === "pending review") return "Pending Review";
  return clinic.registration_status || clinic.approval_status || "Needs Correction";
};
const approved = (clinic) => clinic.approval_status === "Approved" && clinic.verified === true;
const canReviewAllAppointments = (session) =>
  session?.demo_appointment_access === true &&
  session?.user_id === "usr_clinic_01" &&
  session?.clinic_id === "cln_001" &&
  session?.role === "Clinic Administrator";
const clinicHref = (page, query = "") => `../${page}/${page}.html${query}`;
const saveNotification = async (recipientId, message, type = "Clinic update", context = {}) => api.create("notifications", {
  notification_id: `not_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  recipient_id: recipientId,
  notification_type: type,
  message,
  ...context,
  read: false,
  created_at: new Date().toISOString(),
});
const logClinicActivity = async (session, clinic, action, entityType, entityId, reason) => {
  try {
    await api.create("activity_logs", {
      log_id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      user_id: session.user_id,
      user_name: session.name,
      action,
      entity_type: entityType,
      entity_id: entityId,
      reason: `Clinic: ${clinic.clinic_name}. ${reason}`,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("The clinic change could not be added to Activity Logs.", error);
  }
};
const logClinicCatalogChange = (session, clinic, action, services) => logClinicActivity(session, clinic, action, "clinic_catalog", clinic.clinic_id, `Specialties: ${(clinic.specialties || []).join(", ") || "None listed"}. Services: ${services.join(", ") || "None listed"}.`);
const setStatus = async (appointment, status, note, patientMessage = "", session, clinic) => {
  const current = await api.get("appointments", appointment.appointment_id, "appointment_id");
  if (!current || current.clinic_id !== appointment.clinic_id || current.appointment_status !== appointment.appointment_status) throw new Error("This appointment has changed. Refresh the list and try again.");
  const history = [...(current.status_history || []), { status, at: new Date().toISOString(), note }];
  await api.update("appointments", current.appointment_id, { appointment_status: status, status_history: history }, "appointment_id");
  if (["Rejected", "Cancelled"].includes(status) && current.slot_id) await api.update("slots", current.slot_id, { slot_status: "Available" }, "slot_id");
  await saveNotification(current.patient_id, patientMessage || `Your appointment ${current.reference_number || "request"} is now ${status}.`, "Appointment update");
  await logClinicActivity(session, clinic, `Appointment ${status.toLowerCase()}`, "appointment", current.appointment_id, `${current.reference_number || current.appointment_id}: ${note}`);
};

export async function renderClinicAdminPage(feature, session, clinic) {
  const root = $("#page-content");
  const subtitles = { dashboard: "Today's clinic activity, the next patient visits, and items needing attention.", appointments: "Review patient requests, manage confirmed visits, and inspect appointment history.", staff: "Maintain staff records, roles, assignments, and availability.", services: "Manage the clinic services patients can request.", schedules: "Coordinate public clinic hours, provider shifts, and available appointment times.", profile: "Maintain public clinic details and registration documents. Approval status is controlled by platform review.", reports: "Review appointment activity and staffing coverage from shared mock records.", notifications: "Clinic appointment, account, and schedule updates.", help: "Search help topics about clinic operations and registration.", "report-issue": "Send an issue to the LapitCare support queue.", "support-reports": "Track issues submitted by this clinic account." };
  const subtitle = $("#page-subtitle");
  if (subtitle) subtitle.textContent = subtitles[feature] || "Manage your clinic workspace.";
  const cid = clinic.clinic_id;
  const roleLink = $("#profile-clinic-name");
  if (roleLink) roleLink.textContent = clinic.clinic_name;
  const status = statusText(clinic);
  const isApproved = approved(clinic);
  const openWhilePending = ["dashboard", "profile", "help", "report-issue", "support-reports", "notifications"];
  if (!isApproved && !openWhilePending.includes(feature)) {
    root.innerHTML = `<section class="card clinic-review-gate"><p class="eyebrow">Clinic access</p><span class="clinic-approval-pill">${esc(status)}</span><h2>Clinic tools are limited while your registration is reviewed</h2><p>Profile corrections, help, and support remain available. Appointment, service, schedule, and public listing controls unlock after administrator review.</p><div class="actions"><a class="btn btn-primary" href="../dashboard/dashboard.html">View overview</a><a class="btn btn-secondary" href="../profile/profile.html">Review clinic profile</a></div></section>`;
    return true;
  }

  if (feature === "dashboard") {
    await renderOverview(root, clinic, cid, session);
    return true;
  }
  if (feature === "appointments") {
    await renderAppointments(root, clinic, cid, session);
    return true;
  }
  if (feature === "staff") {
    await renderStaff(root, clinic, cid);
    return true;
  }
  if (feature === "services") {
    await renderServices(root, clinic, cid, session);
    return true;
  }
  if (feature === "schedules") {
    await renderSchedules(root, clinic, cid);
    return true;
  }
  if (feature === "profile") {
    await renderProfile(root, clinic, cid, session);
    return true;
  }
  if (feature === "status-queue") {
    renderClinicStatus(root, clinic, cid);
    return true;
  }
  if (feature === "notifications") {
    await renderNotifications(root, cid);
    return true;
  }
  if (feature === "reports") {
    await renderReports(root, clinic, cid);
    return true;
  }
  if (["help", "report-issue", "support-reports"].includes(feature)) {
    await renderSupport(root, feature, cid, session);
    return true;
  }
  return false;
}

async function renderOverview(root, clinic, cid, session) {
  const [appointments, staff, slots, notes, patients, services] = await Promise.all([api.list("appointments"), api.list("staff"), api.list("slots"), api.list("notifications"), api.list("patients"), api.list("services")]);
  const mine = canReviewAllAppointments(session)
    ? appointments
    : appointments.filter((item) => item.clinic_id === cid);
  const ownStaff = staff.filter((item) => item.clinic_id === cid);
  const ownSlots = slots.filter((item) => item.clinic_id === cid);
  const today = dateToday();
  const todayBookings = mine.filter((item) => item.appointment_date === today && ["Pending", "Confirmed"].includes(item.appointment_status));
  const pending = mine.filter((item) => item.appointment_status === "Pending");
  const confirmed = mine.filter((item) => item.appointment_status === "Confirmed");
  const cancelled = mine.filter((item) => item.appointment_status === "Cancelled");
  const next = mine.filter((item) => item.appointment_date >= today && ["Pending", "Confirmed"].includes(item.appointment_status)).sort((a, b) => `${a.appointment_date}${a.appointment_time}`.localeCompare(`${b.appointment_date}${b.appointment_time}`)).slice(0, 4);
  const duty = ownStaff.filter((item) => item.duty_status === "On Duty");
  const recent = notes.filter((item) => item.recipient_id === cid).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 4);
  const activeServices = (clinic.services || []).filter((name) => clinic.service_catalog?.find((item) => item.name === name)?.active !== false);
  const alerts = [!activeServices.length ? "No active services are available for booking." : "", !ownSlots.some((slot) => slot.slot_status === "Available" && slot.slot_date >= today) ? "No future appointment times are published." : "", !duty.length ? "No staff member is marked on duty." : ""].filter(Boolean);
  const initials = clinic.clinic_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("");
  const representativeName = clinic.representative_name || session?.name || "Clinic administrator";
  const firstName = representativeName.trim().split(/\s+/)[0] || "there";
  const locationLabel = [clinic.barangay, clinic.city, clinic.province].filter(Boolean).join(", ") || clinic.address || "Location not listed";
  const quickActions = approved(clinic)
    ? `<a class="btn btn-primary" href="${clinicHref("appointments", "?view=requests")}">Review requests${pending.length ? ` <span class="clinic-action-count">${pending.length}</span>` : ""}</a><a class="btn btn-secondary" href="${clinicHref("appointments", "?view=calendar")}">Open calendar</a><a class="btn btn-ghost" href="${clinicHref("staff", "?action=add")}">Add staff</a>`
    : `<a class="btn btn-primary" href="${clinicHref("profile")}">Review clinic profile</a><a class="btn btn-secondary" href="${clinicHref("help")}">FAQs & support</a><a class="btn btn-ghost" href="${clinicHref("report-issue")}">Report an issue</a>`;
  root.innerHTML = `<section class="clinic-welcome"><div class="clinic-welcome-heading"><div class="clinic-overview-logo">${clinic.profile_photo ? `<img src="${esc(clinic.profile_photo)}" alt="${esc(clinic.clinic_name)} logo">` : esc(initials)}</div><div class="clinic-welcome-copy"><p class="eyebrow">${esc(clinic.clinic_name)}</p><h2>Welcome back, ${esc(firstName)}</h2><p>${esc(locationLabel)} · Manage today's care and clinic operations.</p></div><div class="clinic-overview-status"><span class="clinic-approval-pill ${approved(clinic) ? "is-approved" : ""}">${esc(approved(clinic) ? "Approved" : statusText(clinic))}</span>${badge(clinic.clinic_status || "Open")}</div></div><div class="clinic-welcome-actions"><p class="eyebrow">Quick actions</p><div class="actions">${quickActions}</div></div></section>${!approved(clinic) ? `<div class="clinic-priority-alert clinic-review-status-banner"><span><strong>Registration: ${esc(statusText(clinic))}</strong><small>${esc(clinic.review_feedback || "Your public booking tools will be available after administrator review.")}</small></span><a class="btn btn-secondary" href="${clinicHref("profile")}">Review profile</a></div>` : ""}
  ${pending.length ? `<a class="clinic-priority-alert" href="${clinicHref("appointments", "?view=requests")}"><span><strong>${pending.length} appointment request${pending.length === 1 ? "" : "s"} need review</strong><small>Review patient details and decide on each request.</small></span><span class="btn btn-primary">Review requests</span></a>` : ""}
  <section class="clinic-overview-stats" aria-label="Clinic appointment summary"><a class="card clinic-overview-stat stat-today" href="${clinicHref("appointments", `?view=calendar&mode=day&date=${today}`)}"><span>Today's appointments</span><strong>${todayBookings.length}</strong><small>${todayBookings.filter((a) => a.appointment_status === "Confirmed").length} confirmed · ${todayBookings.filter((a) => a.appointment_status === "Pending").length} pending</small></a><a class="card clinic-overview-stat stat-pending" href="${clinicHref("appointments", "?view=requests&status=Pending")}"><span>Pending requests</span><strong>${pending.length}</strong><small>Awaiting a decision</small></a><a class="card clinic-overview-stat stat-confirmed" href="${clinicHref("appointments", "?view=all&status=Confirmed")}"><span>Confirmed bookings</span><strong>${confirmed.length}</strong><small>Upcoming patient visits</small></a><a class="card clinic-overview-stat stat-cancelled" href="${clinicHref("appointments", "?view=all&status=Cancelled")}"><span>Cancellations</span><strong>${cancelled.length}</strong><small>Cancelled appointments</small></a></section>
  <div class="clinic-dashboard-workspace"><section class="card clinic-dashboard-map-card"><div class="dashboard-section-head"><div><p class="eyebrow">Clinic location</p><h2 class="section-title">Your clinic & nearby providers</h2><p class="muted">Your clinic is highlighted; other markers show approved clinics.</p></div><a class="btn btn-ghost" href="${clinicHref("profile")}#location">Edit location</a></div><div class="clinic-map-legend"><span><i class="is-current"></i>Your clinic</span><span><i></i>Approved clinic</span></div><div class="clinic-dashboard-map" id="clinic-dashboard-map" role="application" aria-label="Map showing your clinic and other approved clinics"></div><p class="form-error" id="clinic-dashboard-map-error" role="status"></p></section><section class="card clinic-next-appointments"><div class="dashboard-section-head"><div><p class="eyebrow">Schedule</p><h2 class="section-title">Next appointments</h2></div><a class="btn btn-ghost" href="${clinicHref("appointments", "?view=calendar")}">Open calendar</a></div><div class="clinic-next-list">${next.map((appointment) => { const person = patients.find((item) => item.patient_id === appointment.patient_id); return `<article class="clinic-next-item"><div class="clinic-next-date"><strong>${new Date(`${appointment.appointment_date}T00:00`).getDate()}</strong><span>${new Date(`${appointment.appointment_date}T00:00`).toLocaleDateString("en-PH", { month: "short" })}</span></div><div><strong>${esc(person?.name || "Patient")}</strong><p>${esc(appointment.service_name || "Service not specified")} · ${esc(fmtTime(appointment.appointment_time))}</p><small>${esc(appointment.reference_number || "Booking")}</small></div>${badge(appointment.appointment_status)}</article>`; }).join("") || `<div class="empty clinic-next-empty"><strong>No upcoming appointments</strong><p>New patient requests will appear here.</p></div>`}</div><a class="btn btn-secondary" href="${clinicHref("appointments")}">View appointments</a></section><section class="card clinic-recent-updates"><div class="dashboard-section-head"><div><p class="eyebrow">Recent activity</p><h2 class="section-title">Clinic updates</h2></div><a href="${clinicHref("notifications")}">View notifications</a></div><div class="clinic-activity-list">${recent.map((note) => `<article><i class="${note.read ? "is-read" : ""}"></i><div><strong>${esc(note.notification_type || "Clinic update")}</strong><p>${esc(note.message)}</p></div><small>${esc(new Date(note.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" }))}</small></article>`).join("") || `<p class="muted">No recent clinic activity yet.</p>`}</div></section><aside class="clinic-overview-aside"><section class="card clinic-operations-card"><div class="dashboard-section-head"><div><p class="eyebrow">Team coverage</p><h2 class="section-title">Staff today</h2></div><a href="${clinicHref("staff")}">Manage</a></div><strong class="clinic-staff-count">${duty.length}<small> of ${ownStaff.length} marked on duty</small></strong><div class="clinic-on-duty-list">${duty.slice(0, 4).map((item) => `<div><i></i><span><strong>${esc(item.staff_name)}</strong><small>${esc(item.specialty_name || staffRole(item))}</small></span></div>`).join("") || `<p class="muted">No team members are marked on duty.</p>`}</div></section><section class="card clinic-alerts-card"><div class="dashboard-section-head"><div><p class="eyebrow">Operations</p><h2 class="section-title">Needs attention</h2></div></div>${alerts.length ? `<ul>${alerts.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : `<p class="clinic-all-clear">Services and appointment availability are set up.</p>`}<div class="clinic-quick-actions"><a class="btn btn-secondary" href="${clinicHref("services")}">Manage services</a><a class="btn btn-ghost" href="${clinicHref("profile")}">Edit clinic profile</a><a class="btn btn-ghost" href="${clinicHref("schedules")}">Manage schedule</a></div></section></aside></div>`;
  renderClinicDashboardMap(root, clinic, cid).catch((error) => {
    const message = root.querySelector("#clinic-dashboard-map-error");
    if (message) message.textContent = `Map preview unavailable: ${error.message}`;
  });
  // Keep counts visibly connected to the clinic's shared catalog, without implying staff authentication.
  void services;
}

async function renderClinicDashboardMap(root, clinic, cid) {
  const [L, approvedClinics] = await Promise.all([loadLeaflet(), api.clinics()]);
  const element = root.querySelector("#clinic-dashboard-map");
  if (!element) return;
  const map = L.map(element, { scrollWheelZoom: false }).setView([7.8257, 123.437], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  }).addTo(map);
  const locations = [
    ...approvedClinics.filter((item) => item.clinic_id !== cid),
    clinic,
  ].filter((item) => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)));
  const points = [];
  for (const location of locations) {
    const ownClinic = location.clinic_id === cid;
    const point = [Number(location.latitude), Number(location.longitude)];
    points.push(point);
    const marker = L.marker(point, ownClinic ? {
      icon: L.divIcon({ className: "clinic-map-marker-wrap", html: '<span class="clinic-map-marker is-current" aria-hidden="true"></span>', iconSize: [24, 24], iconAnchor: [12, 12] }),
      zIndexOffset: 1000,
    } : {}).addTo(map);
    const detailsLink = ownClinic
      ? `${clinicHref("profile")}#location`
      : `../clinic-detail/clinic-detail.html?id=${encodeURIComponent(location.clinic_id)}`;
    marker.bindPopup(`<div class="clinic-map-popup"><span class="clinic-map-popup-label">${ownClinic ? "Your clinic" : "Approved clinic"}</span><strong>${esc(location.clinic_name)}</strong><p>${esc(location.address || [location.barangay, location.city, location.province].filter(Boolean).join(", ") || "Address not listed")}</p><a href="${detailsLink}">${ownClinic ? "Edit clinic location" : "View clinic details"}</a></div>`);
  }
  if (points.length > 1) map.fitBounds(points, { padding: [30, 30], maxZoom: 13 });
  else if (points.length === 1) map.setView(points[0], 14);
  map.invalidateSize();
  requestAnimationFrame(() => map.invalidateSize({ pan: false }));
}

async function renderAppointments(root, clinic, cid, session) {
  const demoGlobalAccess = canReviewAllAppointments(session);
  const params = new URLSearchParams(location.search);
  let view = ["requests", "calendar", "history", "all"].includes(params.get("view")) ? params.get("view") : "requests";
  let calendarMode = ["day", "week", "month"].includes(params.get("mode")) ? params.get("mode") : "week";
  let calendarDate = params.get("date") || dateToday();
  const initialStatus = params.get("status") || "";
  const initialDate = params.get("filter_date") || "";
  const [patients, services, staff] = await Promise.all([api.list("patients"), api.list("services"), api.list("staff")]);
  const [allAppointments, clinics] = await Promise.all([
    api.list("appointments"),
    demoGlobalAccess ? api.clinics() : Promise.resolve([clinic]),
  ]);
  const clinicById = new Map(clinics.map((item) => [item.clinic_id, item]));
  const clinicNameById = new Map(clinics.map((item) => [item.clinic_id, item.clinic_name]));
  const serviceNames = demoGlobalAccess
    ? [...new Set(allAppointments.map((item) => item.service_name).filter(Boolean))]
    : clinic.services || [];
  const staffOptions = demoGlobalAccess
    ? staff
    : staff.filter((item) => item.clinic_id === cid);
  root.innerHTML = `${demoGlobalAccess ? `<div class="notice"><strong>Demo clinic access</strong><p>This demo account can review pending appointments across clinics.</p></div>` : ""}<div class="clinic-view-tabs" role="tablist" aria-label="Appointment views"><button type="button" role="tab" id="appointment-tab-requests" aria-controls="clinic-appointment-view" data-view="requests">Pending Requests</button><button type="button" role="tab" id="appointment-tab-calendar" aria-controls="clinic-appointment-view" data-view="calendar">Calendar</button><button type="button" role="tab" id="appointment-tab-history" aria-controls="clinic-appointment-view" data-view="history">History</button><button type="button" role="tab" id="appointment-tab-all" aria-controls="clinic-appointment-view" data-view="all">All Appointments</button></div><section class="card clinic-filter-panel"><label>Search appointments<input class="input" id="appt-search" type="search" placeholder="${demoGlobalAccess ? "Patient, clinic, or booking reference" : "Patient name or booking reference"}"></label><label>Status<select class="select" id="appt-status"><option value="">All statuses</option>${["Pending", "Confirmed", "Rejected", "Completed", "Cancelled", "Cancellation Requested", "Reschedule Requested", "No-show"].map((item) => `<option value="${esc(item)}" ${initialStatus === item ? "selected" : ""}>${esc(item)}</option>`).join("")}</select></label><label>Service<select class="select" id="appt-service"><option value="">All services</option>${serviceNames.map((name) => `<option>${esc(name)}</option>`).join("")}</select></label><label>Assigned staff<select class="select" id="appt-staff"><option value="">All staff</option>${staffOptions.map((item) => `<option value="${esc(item.staff_id)}">${esc(item.staff_name)}</option>`).join("")}</select></label><label>Date<input class="input" id="appt-date" type="date" value="${esc(initialDate)}"></label></section><div id="clinic-appointment-view" role="tabpanel" aria-live="polite" tabindex="0"></div>`;
  root.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => { view = button.dataset.view; params.set("view", view); params.delete("status"); params.delete("filter_date"); history.replaceState(null, "", `${location.pathname}?${params.toString()}`); const statusSelect = root.querySelector("#appt-status"); statusSelect.value = ""; statusSelect.dispatchEvent(new Event("change", { bubbles: true })); const dateFilter = root.querySelector("#appt-date"); dateFilter.value = ""; dateFilter.dispatchEvent(new Event("change", { bubbles: true })); render(); });
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const tabs = [...root.querySelectorAll("[data-view]")];
      const index = tabs.indexOf(button);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
      tabs[next]?.focus();
      tabs[next]?.click();
    });
  });
  const render = async () => {
    root.querySelectorAll("[data-view]").forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      if (active) root.querySelector("#clinic-appointment-view")?.setAttribute("aria-labelledby", button.id);
    });
    const [allAppointmentRows, currentPatients, currentClinics] = await Promise.all([
      api.list("appointments"),
      api.list("patients"),
      demoGlobalAccess ? api.clinics() : Promise.resolve([clinic]),
    ]);
    patients.splice(0, patients.length, ...currentPatients);
    clinicById.clear();
    clinicNameById.clear();
    for (const item of currentClinics) {
      clinicById.set(item.clinic_id, item);
      clinicNameById.set(item.clinic_id, item.clinic_name);
    }
    const appointments = allAppointmentRows
      .filter((item) => demoGlobalAccess || item.clinic_id === cid)
      .sort((a, b) => `${a.appointment_date}${a.appointment_time}`.localeCompare(`${b.appointment_date}${b.appointment_time}`));
    const search = root.querySelector("#appt-search").value.trim().toLowerCase();
    const statusFilter = root.querySelector("#appt-status").value;
    const serviceFilter = root.querySelector("#appt-service").value;
    const dateFilter = root.querySelector("#appt-date").value;
    const staffFilter = root.querySelector("#appt-staff").value;
    const subset = appointments.filter((a) => (!search || `${a.reference_number} ${patients.find((p) => p.patient_id === a.patient_id)?.name || ""} ${clinicNameById.get(a.clinic_id) || (demoGlobalAccess ? `Clinic ${a.clinic_id}` : "")}`.toLowerCase().includes(search)) && (!statusFilter || a.appointment_status === statusFilter) && (!serviceFilter || a.service_name === serviceFilter) && (!staffFilter || a.staff_id === staffFilter) && (!dateFilter || a.appointment_date === dateFilter) && (view !== "requests" || ["Pending", "Cancellation Requested", "Reschedule Requested"].includes(a.appointment_status)) && (view !== "history" || ["Rejected", "Completed", "Cancelled", "No-show"].includes(a.appointment_status)) && (view !== "calendar" || a.appointment_date >= dateToday()));
    const host = root.querySelector("#clinic-appointment-view");
    if (view === "calendar") {
      host.innerHTML = renderAppointmentCalendar(subset, patients, calendarMode, calendarDate, clinicNameById, demoGlobalAccess);
      host.querySelectorAll("[data-calendar-mode]").forEach((button) => button.addEventListener("click", () => { calendarMode = button.dataset.calendarMode; params.set("mode", calendarMode); history.replaceState(null, "", `${location.pathname}?${params.toString()}`); render(); }));
      host.querySelector("[data-calendar-previous]")?.addEventListener("click", () => { calendarDate = shiftCalendarDate(calendarDate, calendarMode, -1); params.set("date", calendarDate); history.replaceState(null, "", `${location.pathname}?${params.toString()}`); render(); });
      host.querySelector("[data-calendar-next]")?.addEventListener("click", () => { calendarDate = shiftCalendarDate(calendarDate, calendarMode, 1); params.set("date", calendarDate); history.replaceState(null, "", `${location.pathname}?${params.toString()}`); render(); });
      host.querySelector("[data-calendar-today]")?.addEventListener("click", () => { calendarDate = dateToday(); params.set("date", calendarDate); history.replaceState(null, "", `${location.pathname}?${params.toString()}`); render(); });
      host.querySelectorAll("[data-calendar-date]").forEach((button) => button.addEventListener("click", () => { calendarDate = button.dataset.calendarDate; params.set("date", calendarDate); history.replaceState(null, "", `${location.pathname}?${params.toString()}`); render(); }));
    } else {
      host.innerHTML = `<div class="clinic-appointment-list">${subset.map((a) => appointmentCard(a, patients, clinicNameById.get(a.clinic_id) || (demoGlobalAccess ? `Clinic ${a.clinic_id}` : ""), demoGlobalAccess)).join("") || `<div class="empty"><strong>${view === "requests" ? "No pending appointment requests" : "No appointments found"}</strong><p>New patient requests will appear here.</p></div>`}</div>`;
    }
    bindAppointmentActions(host, subset, clinic, patients, services, render, session, {
      demoGlobalAccess,
      clinicById,
    });
  };
  root.querySelectorAll("#appt-search,#appt-status,#appt-service,#appt-staff,#appt-date").forEach((input) => input.addEventListener("input", render));
  startPolling(render);
}

function shiftCalendarDate(value, mode, direction) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + (mode === "month" ? 0 : mode === "week" ? 7 * direction : direction));
  if (mode === "month") { date.setDate(1); date.setMonth(date.getMonth() + direction); }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function renderAppointmentCalendar(appointments, patients, mode, focusDate, clinicNameById, demoGlobalAccess) {
  const focus = new Date(`${focusDate}T00:00:00`);
  const monthTitle = focus.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
  const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const controls = `<section class="card clinic-calendar-controls"><div><p class="eyebrow">Appointment calendar</p><h2>${mode === "month" ? monthTitle : mode === "day" ? fmtDate(focusDate) : `Week of ${fmtDate(focusDate)}`}</h2></div><div class="clinic-calendar-control-actions"><div class="clinic-calendar-modes">${["day", "week", "month"].map((item) => `<button type="button" data-calendar-mode="${item}" class="${mode === item ? "is-active" : ""}">${item[0].toUpperCase()}${item.slice(1)}</button>`).join("")}</div><button type="button" class="btn btn-ghost" data-calendar-previous aria-label="Previous ${mode}">‹</button><button type="button" class="btn btn-ghost" data-calendar-today>Today</button><button type="button" class="btn btn-ghost" data-calendar-next aria-label="Next ${mode}">›</button></div></section>`;
  if (mode === "month") {
    const first = new Date(focus.getFullYear(), focus.getMonth(), 1);
    const count = new Date(focus.getFullYear(), focus.getMonth() + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    const cells = `${Array.from({ length: offset }, () => `<span class="clinic-month-blank"></span>`).join("")}${Array.from({ length: count }, (_, index) => { const day = dateKey(new Date(focus.getFullYear(), focus.getMonth(), index + 1)); const countForDay = appointments.filter((item) => item.appointment_date === day).length; return `<button type="button" class="clinic-month-cell ${day === focusDate ? "is-selected" : ""}" data-calendar-date="${day}"><strong>${index + 1}</strong>${countForDay ? `<small>${countForDay} booking${countForDay === 1 ? "" : "s"}</small>` : ""}</button>`; }).join("")}`;
    const selected = appointments.filter((item) => item.appointment_date === focusDate);
    return `${controls}<section class="card clinic-month-calendar"><div class="clinic-month-weekdays">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((item) => `<span>${item}</span>`).join("")}</div><div class="clinic-month-grid">${cells}</div></section><section class="card clinic-calendar-day"><h2>${esc(fmtDate(focusDate))}</h2><div class="clinic-appointment-list">${selected.map((item) => appointmentCard(item, patients, clinicNameById.get(item.clinic_id) || (demoGlobalAccess ? `Clinic ${item.clinic_id}` : ""), demoGlobalAccess)).join("") || `<p class="muted">No appointments on this date.</p>`}</div></section>`;
  }
  let start = new Date(focus);
  if (mode === "week") start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const days = Array.from({ length: mode === "day" ? 1 : 7 }, (_, index) => { const date = new Date(start); date.setDate(date.getDate() + index); const key = dateKey(date); const rows = appointments.filter((item) => item.appointment_date === key); return `<section class="card clinic-calendar-day ${key === focusDate ? "is-focused" : ""}"><button type="button" class="clinic-calendar-date-button" data-calendar-date="${key}"><strong>${esc(date.toLocaleDateString("en-PH", { weekday: "long" }))}</strong><span>${esc(fmtDate(key))}</span></button><div class="clinic-appointment-list">${rows.map((item) => appointmentCard(item, patients, clinicNameById.get(item.clinic_id) || (demoGlobalAccess ? `Clinic ${item.clinic_id}` : ""), demoGlobalAccess)).join("") || `<p class="muted">No appointments</p>`}</div></section>`; }).join("");
  return `${controls}<div class="clinic-calendar-list ${mode === "day" ? "is-day-view" : ""}">${days}</div>`;
}

function appointmentCard(a, patients, clinicName, demoGlobalAccess = false) {
  const patient = patients.find((p) => p.patient_id === a.patient_id);
  const actions = a.appointment_status === "Pending" ? `<button class="btn btn-primary" data-confirm-appointment="${esc(a.appointment_id)}">${demoGlobalAccess ? "Approve" : "Accept"}</button>${demoGlobalAccess ? "" : `<button class="btn btn-danger" data-reject-appointment="${esc(a.appointment_id)}">Reject</button>`}` : demoGlobalAccess ? "" : a.appointment_status === "Cancellation Requested" ? `<button class="btn btn-danger" data-approve-cancel-request="${esc(a.appointment_id)}">Approve cancellation</button><button class="btn btn-secondary" data-decline-cancel-request="${esc(a.appointment_id)}">Keep confirmed</button>` : a.appointment_status === "Reschedule Requested" ? `<button class="btn btn-primary" data-approve-reschedule-request="${esc(a.appointment_id)}">Review new time</button><button class="btn btn-secondary" data-decline-reschedule-request="${esc(a.appointment_id)}">Keep original time</button>` : a.appointment_status === "Confirmed" ? `<button class="btn btn-secondary" data-complete-appointment="${esc(a.appointment_id)}">Mark completed</button><button class="btn btn-ghost" data-reschedule-clinic="${esc(a.appointment_id)}">Reschedule</button><button class="btn btn-ghost" data-cancel-appointment="${esc(a.appointment_id)}">Cancel booking</button>` : "";
  return `<article class="card clinic-appointment-card"><div class="clinic-appointment-main"><div class="clinic-appointment-date"><strong>${esc(new Date(`${a.appointment_date}T00:00`).toLocaleDateString("en-PH", { day: "2-digit" }))}</strong><span>${esc(new Date(`${a.appointment_date}T00:00`).toLocaleDateString("en-PH", { month: "short" }))}</span></div><div><p class="eyebrow">${esc(a.reference_number || "Appointment")}</p><h3>${esc(patient?.name || "Patient")}</h3>${clinicName ? `<p><strong>${esc(clinicName)}</strong></p>` : ""}<p>${esc(a.service_name || "Service not specified")} · ${esc(fmtDate(a.appointment_date))} at ${esc(fmtTime(a.appointment_time))}</p><small>${esc(a.visit_reason || "No visit note provided")}</small></div>${badge(a.appointment_status)}</div><div class="clinic-appointment-actions"><button class="btn btn-ghost" data-appointment-detail="${esc(a.appointment_id)}">Details</button>${actions}</div></article>`;
}

async function bindAppointmentActions(host, appointments, clinic, patients, services, render, session, options = {}) {
  const findAppointment = (button) => appointments.find((item) => item.appointment_id === button.dataset.confirmAppointment || item.appointment_id === button.dataset.rejectAppointment || item.appointment_id === button.dataset.completeAppointment || item.appointment_id === button.dataset.cancelAppointment || item.appointment_id === button.dataset.appointmentDetail || item.appointment_id === button.dataset.rescheduleClinic || item.appointment_id === button.dataset.approveCancelRequest || item.appointment_id === button.dataset.declineCancelRequest || item.appointment_id === button.dataset.approveRescheduleRequest || item.appointment_id === button.dataset.declineRescheduleRequest);
  host.querySelectorAll("[data-appointment-detail]").forEach((button) => button.addEventListener("click", () => {
    const appointment = findAppointment(button);
    if (!appointment) return;
    const patient = patients.find((p) => p.patient_id === appointment.patient_id);
    const details = document.createElement("div");
    details.className = "modal-backdrop clinic-detail-backdrop";
    details.innerHTML = `<section class="modal clinic-appointment-detail" role="dialog" aria-modal="true"><p class="eyebrow">Appointment details</p><h2>${esc(appointment.reference_number || "Booking")}</h2><dl><div><dt>Patient</dt><dd>${esc(patient?.name || "Patient")}</dd></div><div><dt>Service</dt><dd>${esc(appointment.service_name || "Not listed")}</dd></div><div><dt>Date & time</dt><dd>${esc(fmtDate(appointment.appointment_date))} · ${esc(fmtTime(appointment.appointment_time))}</dd></div><div><dt>Contact</dt><dd>${esc(appointment.contact_number || "Not supplied")} · ${esc(appointment.contact_email || "Not supplied")}</dd></div><div><dt>Visit notes</dt><dd>${esc(appointment.visit_reason || "No notes provided")}</dd></div><div><dt>Status history</dt><dd><ol>${(appointment.status_history || [{ status: appointment.appointment_status, at: appointment.created_at, note: "Booking record" }]).map((item) => `<li><strong>${esc(item.status)}</strong> · ${esc(new Date(item.at).toLocaleString("en-PH"))}<br>${esc(item.note || "")}</li>`).join("")}</ol></dd></div></dl><button class="btn btn-secondary" data-close-detail>Close</button></section>`;
    document.body.append(details);
    details.querySelector("[data-close-detail]").addEventListener("click", () => details.remove());
    details.addEventListener("click", (event) => { if (event.target === details) details.remove(); });
  }));
  host.querySelectorAll("[data-confirm-appointment]").forEach((button) => button.addEventListener("click", () => modal("Accept appointment request?", "The request will become confirmed after the appointment time and staff availability are rechecked.", async () => {
    const appointment = findAppointment(button);
    if (!approved(clinic)) throw new Error("This clinic is not approved to confirm appointments.");
    const [allAppointments, slots, staff, schedules] = await Promise.all([api.list("appointments"), api.list("slots"), api.list("staff"), api.list("schedules")]);
    const current = await api.get("appointments", appointment.appointment_id, "appointment_id");
    if (!current || current.appointment_status !== "Pending") throw new Error("This request is no longer pending.");
    if (options.demoGlobalAccess) {
      const appointmentClinic = options.clinicById.get(current.clinic_id) || {
        clinic_id: current.clinic_id,
        clinic_name: `Clinic ${current.clinic_id}`,
      };
      const slot = slots.find((item) => item.slot_id === current.slot_id);
      const confirmedAt = new Date().toISOString();
      await api.update("appointments", current.appointment_id, {
        appointment_status: "Confirmed",
        status_history: [...(current.status_history || []), {
          status: "Confirmed",
          at: confirmedAt,
          note: "Approved by the LapitCare demo clinic account.",
        }],
      }, "appointment_id");
      if (slot?.slot_status === "Available") {
        await api.update("slots", slot.slot_id, { slot_status: "Booked" }, "slot_id");
      }
      await saveNotification(
        current.patient_id,
        `Your appointment ${current.reference_number || "request"} has been confirmed.`,
        "Appointment confirmed",
        {
          clinic_id: current.clinic_id,
          reference_type: "appointment",
          reference_id: current.appointment_id,
        },
      );
      await logClinicActivity(
        session,
        appointmentClinic,
        "Appointment confirmed",
        "appointment",
        current.appointment_id,
        `${current.reference_number || current.appointment_id}: Approved by the LapitCare demo clinic account.`,
      );
      toast("Appointment approved.");
      await render();
      return;
    }
    const slot = slots.find((item) => item.slot_id === current.slot_id);
    const provider = staff.find((item) => item.staff_id === current.staff_id);
    if (!slot || slot.clinic_id !== clinic.clinic_id || slot.slot_date !== current.appointment_date || slot.start_time !== current.appointment_time || !["Booked", "Available"].includes(slot.slot_status)) throw new Error("The requested slot is no longer valid.");
    if (current.appointment_date < dateToday()) throw new Error("Past appointments cannot be accepted.");
    if (!provider || provider.clinic_id !== clinic.clinic_id || provider.duty_status !== "On Duty") throw new Error("The assigned provider is unavailable. Reschedule this request before accepting.");
    if (provider.assigned_services?.length && !provider.assigned_services.includes(current.service_name)) throw new Error("The assigned provider is not assigned to this service.");
    const weekday = new Date(`${current.appointment_date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Manila" });
    if ((clinic.closures || []).some((closure) => current.appointment_date >= closure.start_date && current.appointment_date <= closure.end_date)) throw new Error("The clinic is closed on this appointment date.");
    const clinicHours = clinic.operating_schedule?.[weekday];
    if (clinicHours && (clinicHours.closed || current.appointment_time < clinicHours.open || current.appointment_time >= clinicHours.close)) throw new Error("The appointment falls outside current clinic operating hours.");
    if ((clinic.staff_unavailability || []).some((leave) => leave.staff_id === current.staff_id && current.appointment_date >= leave.start_date && current.appointment_date <= leave.end_date)) throw new Error("The assigned provider is on leave for this appointment date.");
    const providerShifts = schedules.filter((item) => item.clinic_id === clinic.clinic_id && item.staff_id === provider.staff_id);
    const shiftCovers = !providerShifts.length || providerShifts.some((shift) => (shift.weekday || "").toLowerCase().includes(weekday.toLowerCase()) && current.appointment_time >= shift.start_time && current.appointment_time < shift.end_time);
    if (!shiftCovers) throw new Error("The assigned provider is not scheduled for this date and time.");
    if (allAppointments.some((item) => item.appointment_id !== current.appointment_id && item.slot_id === current.slot_id && ["Pending", "Confirmed", "Completed"].includes(item.appointment_status))) throw new Error("This time is already assigned to another booking.");
    await api.update("appointments", current.appointment_id, { appointment_status: "Confirmed", status_history: [...(current.status_history || []), { status: "Confirmed", at: new Date().toISOString(), note: "Clinic accepted the request after checking availability." }] }, "appointment_id");
    if (slot.slot_status === "Available") await api.update("slots", slot.slot_id, { slot_status: "Booked" }, "slot_id");
    await saveNotification(current.patient_id, `Your appointment ${current.reference_number} has been confirmed.`, "Appointment confirmed");
    await logClinicActivity(session, clinic, "Appointment confirmed", "appointment", current.appointment_id, `${current.reference_number || current.appointment_id}: Clinic accepted the request after checking availability.`);
    toast("Appointment confirmed.");
    await render();
  })));
  host.querySelectorAll("[data-reject-appointment]").forEach((button) => button.addEventListener("click", async () => {
    const appointment = findAppointment(button);
    const reason = await formModal("Decline appointment request", "Add a clear reason for the patient. The slot will be released.", { name: "reason", label: "Reason", type: "textarea", required: true, maxlength: 300 }, "Decline request");
    if (!reason) return;
    await setStatus(appointment, "Rejected", reason, `Your request ${appointment.reference_number} was declined. Reason: ${reason}`, session, clinic);
    toast("Request declined and patient notified.");
    await render();
  }));
  host.querySelectorAll("[data-complete-appointment]").forEach((button) => button.addEventListener("click", () => modal("Complete this appointment?", "This closes the appointment record and prevents further booking changes.", async () => { const appointment = findAppointment(button); if (appointment.appointment_date > dateToday()) throw new Error("A future appointment cannot be marked complete."); await setStatus(appointment, "Completed", "Visit completed by the clinic.", "", session, clinic); await render(); })));
  host.querySelectorAll("[data-cancel-appointment]").forEach((button) => button.addEventListener("click", () => modal("Cancel this appointment?", "The patient will be notified and the slot will be released.", async () => { const appointment = findAppointment(button); await setStatus(appointment, "Cancelled", "Clinic cancelled the booking.", "", session, clinic); toast("Appointment cancelled."); await render(); })));
  host.querySelectorAll("[data-approve-cancel-request]").forEach((button) => button.addEventListener("click", () => modal("Approve cancellation request?", "The booking will be cancelled and its appointment time released.", async () => { await setStatus(findAppointment(button), "Cancelled", "Clinic approved the patient's cancellation request.", "", session, clinic); await render(); })));
  host.querySelectorAll("[data-decline-cancel-request]").forEach((button) => button.addEventListener("click", () => modal("Keep this booking confirmed?", "The patient will be notified that the cancellation request was declined.", async () => { const appointment = findAppointment(button); const current = await api.get("appointments", appointment.appointment_id, "appointment_id"); if (!current || current.appointment_status !== "Cancellation Requested") throw new Error("This request has changed."); await api.update("appointments", current.appointment_id, { appointment_status: "Confirmed", cancellation_reason: "Clinic declined the cancellation request.", status_history: [...(current.status_history || []), { status: "Confirmed", at: new Date().toISOString(), note: "Clinic declined the cancellation request." }] }, "appointment_id"); await logClinicActivity(session, clinic, "Declined appointment cancellation", "appointment", current.appointment_id, `${current.reference_number}: Cancellation request declined; booking remains confirmed.`); await saveNotification(current.patient_id, `The clinic declined the cancellation request for ${current.reference_number}.`, "Appointment update"); await render(); })));
  host.querySelectorAll("[data-approve-reschedule-request]").forEach((button) => button.addEventListener("click", () => modal("Approve requested new time?", "The new provider slot will be checked against current clinic and staff availability.", async () => {
    const appointment = findAppointment(button);
    const current = await api.get("appointments", appointment.appointment_id, "appointment_id");
    const [slots, allAppointments, staff, schedules] = await Promise.all([api.list("slots"), api.list("appointments"), api.list("staff"), api.list("schedules")]);
    const target = slots.find((item) => item.slot_id === current?.requested_reschedule?.slot_id);
    const provider = staff.find((item) => item.staff_id === target?.staff_id && item.clinic_id === cid && item.active !== false && item.duty_status === "On Duty");
    const weekday = target && new Date(`${target.slot_date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Manila" });
    const toMinutes = (time) => Number(String(time || "").slice(0, 2)) * 60 + Number(String(time || "").slice(3, 5));
    const duration = Number(clinic.service_catalog?.find((service) => service.name === current?.service_name)?.duration) || Number(current?.duration_minutes) || 30;
    const hours = weekday && clinic.operating_schedule?.[weekday];
    const providerShifts = schedules.filter((item) => item.clinic_id === cid && item.staff_id === provider?.staff_id);
    const validShift = provider && (!providerShifts.length || providerShifts.some((item) => (item.weekday || "").toLowerCase().includes(weekday.toLowerCase()) && target.start_time >= item.start_time && toMinutes(target.start_time) + duration <= toMinutes(item.end_time)));
    const occupied = target && allAppointments.some((item) => item.appointment_id !== current?.appointment_id && item.staff_id === target.staff_id && item.appointment_date === target.slot_date && ["Pending", "Confirmed", "Completed"].includes(item.appointment_status) && toMinutes(target.start_time) < toMinutes(item.appointment_time) + (Number(item.duration_minutes) || duration) && toMinutes(target.start_time) + duration > toMinutes(item.appointment_time));
    if (!current || current.clinic_id !== cid || current.appointment_status !== "Reschedule Requested" || !target || target.clinic_id !== cid || target.slot_status !== "Available" || target.slot_date < dateToday() || !provider || (provider.assigned_services?.length && !provider.assigned_services.includes(current.service_name)) || (hours && (hours.closed || target.start_time < hours.open || toMinutes(target.start_time) + duration > toMinutes(hours.close))) || (clinic.closures || []).some((item) => target.slot_date >= item.start_date && target.slot_date <= item.end_date) || (clinic.staff_unavailability || []).some((item) => item.staff_id === provider.staff_id && target.slot_date >= item.start_date && target.slot_date <= item.end_date) || !validShift || occupied || allAppointments.some((item) => item.appointment_id !== current.appointment_id && item.slot_id === target.slot_id && ["Pending", "Confirmed", "Completed"].includes(item.appointment_status))) throw new Error("The requested time is no longer available under the clinic's current schedule.");
    await api.update("slots", current.slot_id, { slot_status: "Available" }, "slot_id");
    await api.update("slots", target.slot_id, { slot_status: "Booked" }, "slot_id");
    await api.update("appointments", current.appointment_id, { appointment_status: "Confirmed", slot_id: target.slot_id, staff_id: target.staff_id, appointment_date: target.slot_date, appointment_time: target.start_time, requested_reschedule: null, status_history: [...(current.status_history || []), { status: "Confirmed", at: new Date().toISOString(), note: `Clinic approved requested time ${fmtDate(target.slot_date)} at ${fmtTime(target.start_time)}.` }] }, "appointment_id");
    await logClinicActivity(session, clinic, "Approved appointment reschedule", "appointment", current.appointment_id, `${current.reference_number}: Rescheduled to ${fmtDate(target.slot_date)} at ${fmtTime(target.start_time)}.`);
    await saveNotification(current.patient_id, `The clinic approved your new appointment time for ${current.reference_number}.`, "Appointment rescheduled");
    await render();
  })));
  host.querySelectorAll("[data-decline-reschedule-request]").forEach((button) => button.addEventListener("click", () => modal("Keep the original appointment time?", "The patient will be notified that the requested change was declined.", async () => { const appointment = findAppointment(button); const current = await api.get("appointments", appointment.appointment_id, "appointment_id"); if (!current || current.appointment_status !== "Reschedule Requested") throw new Error("This request has changed."); await api.update("appointments", current.appointment_id, { appointment_status: "Confirmed", requested_reschedule: null, status_history: [...(current.status_history || []), { status: "Confirmed", at: new Date().toISOString(), note: "Clinic declined the reschedule request; original booking remains confirmed." }] }, "appointment_id"); await logClinicActivity(session, clinic, "Declined appointment reschedule", "appointment", current.appointment_id, `${current.reference_number}: Original appointment time retained.`); await saveNotification(current.patient_id, `The clinic declined the reschedule request for ${current.reference_number}; the original time remains confirmed.`, "Appointment update"); await render(); })));
  host.querySelectorAll("[data-reschedule-clinic]").forEach((button) => button.addEventListener("click", async () => {
    const appointment = findAppointment(button);
    const [slots, allAppointments, staff, schedules] = await Promise.all([api.list("slots"), api.list("appointments"), api.list("staff"), api.list("schedules")]);
    const duration = Number(clinic.service_catalog?.find((service) => service.name === appointment.service_name)?.duration) || 30;
    const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    const free = slots.filter((slot) => {
      if (slot.clinic_id !== clinic.clinic_id || slot.slot_status !== "Available" || slot.slot_date < dateToday()) return false;
      const provider = staff.find((member) => member.staff_id === slot.staff_id);
      if (!provider || provider.clinic_id !== clinic.clinic_id || provider.active === false || provider.duty_status !== "On Duty" || provider.assigned_services?.length && !provider.assigned_services.includes(appointment.service_name)) return false;
      const weekday = new Date(`${slot.slot_date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Manila" });
      const shifts = schedules.filter((shift) => shift.clinic_id === cid && shift.staff_id === provider.staff_id);
      if (shifts.length && !shifts.some((shift) => (shift.weekday || "").toLowerCase().includes(weekday.toLowerCase()) && slot.start_time >= shift.start_time && toMinutes(slot.start_time) + duration <= toMinutes(shift.end_time))) return false;
      const hours = clinic.operating_schedule?.[weekday];
      if (hours && (hours.closed || slot.start_time < hours.open || toMinutes(slot.start_time) + duration > toMinutes(hours.close))) return false;
      if ((clinic.closures || []).some((closure) => slot.slot_date >= closure.start_date && slot.slot_date <= closure.end_date)) return false;
      if ((clinic.staff_unavailability || []).some((leave) => leave.staff_id === provider.staff_id && slot.slot_date >= leave.start_date && slot.slot_date <= leave.end_date)) return false;
      const start = toMinutes(slot.start_time);
      return !allAppointments.some((other) => other.appointment_id !== appointment.appointment_id && other.staff_id === provider.staff_id && other.appointment_date === slot.slot_date && ["Pending", "Confirmed", "Completed"].includes(other.appointment_status) && other.slot_id !== slot.slot_id && start < toMinutes(other.appointment_time) + (Number(other.duration_minutes) || duration) && start + duration > toMinutes(other.appointment_time));
    });
    if (!free.length) { toast("No available provider slots match this booking."); return; }
    const selectedId = await formModal("Reschedule confirmed appointment", "Choose a free clinic slot. The old slot is released after this change is applied.", { name: "slot", label: "Available date and time", type: "select", required: true, options: [{ value: "", label: "Choose a slot" }, ...free.map((slot) => ({ value: slot.slot_id, label: `${fmtDate(slot.slot_date)} · ${fmtTime(slot.start_time)} · ${staff.find((person) => person.staff_id === slot.staff_id)?.staff_name || "Provider"}` }))] }, "Review reschedule");
    const target = free.find((slot) => slot.slot_id === selectedId);
    if (!target) return;
    modal("Confirm appointment change?", `Move ${appointment.reference_number} to ${fmtDate(target.slot_date)} at ${fmtTime(target.start_time)}?`, async () => {
      const latest = await api.get("appointments", appointment.appointment_id, "appointment_id");
      const latestSlot = await api.get("slots", target.slot_id, "slot_id");
      const latestAppointments = await api.list("appointments");
      if (!latest || latest.appointment_status !== "Confirmed" || latestSlot?.slot_status !== "Available" || latestAppointments.some((other) => other.appointment_id !== latest.appointment_id && other.slot_id === target.slot_id && ["Pending", "Confirmed", "Completed"].includes(other.appointment_status))) throw new Error("That time has just been taken. Refresh and choose another slot.");
      await api.update("slots", latest.slot_id, { slot_status: "Available" }, "slot_id");
      await api.update("slots", target.slot_id, { slot_status: "Booked" }, "slot_id");
      await api.update("appointments", latest.appointment_id, { slot_id: target.slot_id, staff_id: target.staff_id, appointment_date: target.slot_date, appointment_time: target.start_time, status_history: [...(latest.status_history || []), { status: "Confirmed", at: new Date().toISOString(), note: `Clinic rescheduled the visit to ${fmtDate(target.slot_date)} at ${fmtTime(target.start_time)}.` }] }, "appointment_id");
      await logClinicActivity(session, clinic, "Rescheduled appointment", "appointment", latest.appointment_id, `${latest.reference_number}: New time ${fmtDate(target.slot_date)} at ${fmtTime(target.start_time)}.`);
      await saveNotification(latest.patient_id, `Your appointment ${latest.reference_number} was rescheduled to ${fmtDate(target.slot_date)} at ${fmtTime(target.start_time)}.`, "Appointment rescheduled");
      toast("Appointment rescheduled.");
      await render();
    });
  }));
}

async function renderStaff(root, clinic, cid) {
  const params = new URLSearchParams(location.search);
  const view = params.get("view") || "directory";
  const openAddForm = params.get("action") === "add";
  const [services, schedules] = await Promise.all([api.list("services"), api.list("schedules")]);
  root.innerHTML = `<div class="clinic-view-tabs"><a class="${view === "directory" ? "is-active" : ""}" href="${clinicHref("staff")}">Staff directory</a><a class="${view === "roles" ? "is-active" : ""}" href="${clinicHref("staff", "?view=roles")}">Roles & permissions</a></div>${view === "directory" ? `<div class="clinic-staff-toolbar"><label class="clinic-staff-search"><span>Search staff</span><input class="input" id="staff-search" type="search" placeholder="Name, role, specialty, or service"></label><label><span>Availability</span><select class="select" id="staff-status"><option value="">All statuses</option>${["On Duty", "Off Duty", "On Leave", "Unavailable"].map((item) => `<option>${item}</option>`).join("")}</select></label><button class="btn btn-primary" id="staff-add">Add staff member</button></div>` : ""}<div id="staff-list"></div>`;
  const render = async () => {
    const members = (await api.list("staff")).filter((item) => item.clinic_id === cid);
    const search = root.querySelector("#staff-search")?.value.toLowerCase() || "";
    const filter = root.querySelector("#staff-status")?.value || "";
    const filtered = members.filter((item) => (!search || `${item.staff_name} ${staffRole(item)} ${item.specialty_name} ${(item.assigned_services || []).join(" ")}`.toLowerCase().includes(search)) && (!filter || item.duty_status === filter));
    root.querySelector("#staff-list").innerHTML = view === "roles" ? `<section class="card clinic-permissions-note"><p class="eyebrow">Access model</p><h2>Clinic team roles</h2><p>Staff profiles are clinic administration records and do not have independent authenticated accounts in this prototype. Role labels organize responsibilities; they do not grant separate sign-in access.</p><div class="clinic-role-grid"><article><strong>Clinic Administrator</strong><p>Manages clinic setup, team records, services, schedules, and appointment decisions.</p></article><article><strong>Receptionist</strong><p>Supports appointment intake and patient coordination.</p></article><article><strong>Healthcare Provider</strong><p>Provides care and may be assigned specialties, services, and working schedules.</p></article></div><div class="clinic-role-guidance"><strong>Manage access safely</strong><p>Use the Staff Directory to update a staff member's role. Account access is limited to the authorized clinic administrator.</p><a class="btn btn-secondary" href="${clinicHref("staff")}">Open staff directory</a></div></section>` : staffCards(filtered, services);
    root.querySelectorAll("[data-staff-edit]").forEach((button) => button.addEventListener("click", () => openStaffForm(button.dataset.staffEdit)));
    root.querySelectorAll("[data-staff-active]").forEach((button) => button.addEventListener("click", () => modal(button.dataset.active === "true" ? "Deactivate staff member?" : "Activate staff member?", "Existing bookings and the staff profile are retained. Future booking availability is updated.", async () => { const staffId = button.dataset.staffActive; const deactivating = button.dataset.active === "true"; await api.update("staff", staffId, { active: !deactivating, duty_status: deactivating ? "Unavailable" : "Off Duty" }, "staff_id"); if (deactivating) { const bookings = (await api.list("appointments")).filter((item) => item.clinic_id === cid && item.staff_id === staffId && item.appointment_date >= dateToday() && ["Pending", "Confirmed"].includes(item.appointment_status)); for (const booking of bookings) await saveNotification(booking.patient_id, "Your provider's availability changed. Please contact the clinic to confirm your scheduled visit.", "Staff availability change"); } await render(); })));
  };
  const staffCards = (members, catalog) => `<div class="clinic-staff-grid">${members.map((member) => { const shifts = schedules.filter((shift) => shift.staff_id === member.staff_id); const workdays = [...new Set(shifts.map((shift) => shift.weekday))].join(", "); return `<article class="card clinic-staff-card"><div class="clinic-staff-card-head"><div class="clinic-staff-avatar">${esc(member.staff_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join(""))}</div><div><h3>${esc(member.staff_name)}</h3><p>${esc(staffRole(member))} · ${esc(member.specialty_name || "Specialty not listed")}</p></div>${badge(member.active === false ? "Inactive" : member.duty_status || "Off Duty")}</div><p><strong>Services:</strong> ${esc((member.assigned_services || catalog.filter((service) => (clinic.services || []).includes(service.service_name)).map((service) => service.service_name)).join(", ") || "Not assigned")}</p><p><strong>Workdays:</strong> ${esc(workdays || "No recurring shift set")}</p><p><strong>Access:</strong> Administrative record only</p><div class="actions"><button class="btn btn-secondary" data-staff-edit="${esc(member.staff_id)}">Edit profile</button><button class="btn btn-ghost" data-staff-active="${esc(member.staff_id)}" data-active="${member.active !== false}">${member.active === false ? "Activate" : "Deactivate"}</button></div></article>`; }).join("") || `<div class="empty">No staff profiles match these filters.</div>`}</div>`;
  const openStaffForm = async (id = "") => {
    const member = id ? await api.get("staff", id, "staff_id") : null;
    if (member && member.clinic_id !== cid) return;
    const options = ["Healthcare Provider", "Receptionist", "Clinic Administrator", "Nurse", "Medical assistant", "Technician", "Other"];
    const result = await formModal(member ? "Edit staff profile" : "Add staff member", "Staff records are not independent login accounts. Assign only work roles needed for the clinic.", [
      { name: "name", label: "Full name", type: "text", required: true, value: member?.staff_name || "" },
      { name: "role", label: "Clinic role", type: "select", required: true, value: staffRole(member || {}), options: options.map((item) => ({ value: item, label: item })) },
      { name: "specialty", label: "Specialty or work area", type: "text", required: true, value: member?.specialty_name || "Clinic support" },
      { name: "status", label: "Availability status", type: "select", required: true, value: member?.duty_status || "Off Duty", options: ["On Duty", "Off Duty", "On Leave", "Unavailable"].map((item) => ({ value: item, label: item })) },
      { name: "services", label: "Assigned services (comma separated)", type: "text", value: (member?.assigned_services || []).join(", "), placeholder: "Consultation, Follow-up care" },
    ], member ? "Save changes" : "Add staff");
    if (!result) return;
    const record = { staff_name: result.name.trim(), staff_role: result.role, specialty_name: result.specialty.trim(), duty_status: result.status, assigned_services: result.services.split(",").map((item) => item.trim()).filter(Boolean), active: true };
    if (member) await api.update("staff", id, record, "staff_id");
    else await api.create("staff", { staff_id: `stf_${Date.now()}`, clinic_id: cid, ...record });
    await render();
  };
  root.querySelector("#staff-add")?.addEventListener("click", () => openStaffForm());
  root.querySelectorAll("#staff-search,#staff-status").forEach((input) => input.addEventListener("input", render));
  await render();
  if (openAddForm) {
    params.delete("action");
    const query = params.toString();
    history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}`);
    await openStaffForm();
  }
}

async function renderServices(root, clinic, cid, session) {
  const [catalog, staff] = await Promise.all([api.list("services"), api.list("staff")]);
  const ownStaff = staff.filter((item) => item.clinic_id === cid && item.active !== false);
  const catalogNames = [...new Set([...(clinic.services || []), ...(clinic.service_catalog || []).map((item) => item.name)])];
  const currentCatalog = catalogNames.map((name) => {
    const entry = clinic.service_catalog?.find((item) => item.name === name);
    return entry || { name, category: "Clinic service", description: "", duration: 30, active: true, staff_ids: ownStaff.filter((member) => !member.assigned_services?.length || member.assigned_services.includes(name)).map((member) => member.staff_id) };
  });
  root.innerHTML = `<section class="card clinic-service-intro"><div><p class="eyebrow">Clinic catalog</p><h2>Services & specialties</h2><p class="muted">Active services appear in patient booking. Appointment options depend on the assigned staff schedule.</p></div><button class="btn btn-primary" id="add-clinic-service">Add service</button></section><div class="clinic-service-grid">${currentCatalog.map((service) => `<article class="card clinic-service-card"><div class="clinic-service-head"><div><p class="eyebrow">${esc(service.category || "Clinic service")}</p><h3>${esc(service.name)}</h3></div>${badge(service.active === false ? "Inactive" : "Active")}</div><p>${esc(service.description || "No service description added.")}</p><dl><div><dt>Duration</dt><dd>${Number(service.duration) || 30} minutes</dd></div><div><dt>Assigned providers</dt><dd>${(service.staff_ids || []).map((id) => staff.find((item) => item.staff_id === id)?.staff_name).filter(Boolean).map(esc).join(", ") || "Not assigned"}</dd></div>${service.fee != null ? `<div><dt>Fee</dt><dd>₱${Number(service.fee).toLocaleString("en-PH")}</dd></div>` : ""}</dl><div class="actions"><button class="btn btn-secondary" data-edit-service="${esc(service.name)}">Edit service</button><button class="btn btn-ghost" data-toggle-service="${esc(service.name)}" data-active="${service.active !== false}">${service.active === false ? "Activate" : "Deactivate"}</button></div></article>`).join("") || `<div class="empty">No services yet. Add a service to begin configuring clinic bookings.</div>`}</div>`;
  const edit = async (name = "") => {
    const old = currentCatalog.find((item) => item.name === name);
    const result = await formModal(old ? "Edit clinic service" : "Add clinic service", "Set a clear duration and assign staff qualified for this service.", [
      { name: "name", label: "Service name", type: "text", required: true, value: old?.name || "" },
      { name: "category", label: "Category", type: "text", required: true, value: old?.category || "Consultation" },
      { name: "description", label: "Description", type: "textarea", value: old?.description || "" },
      { name: "duration", label: "Duration in minutes", type: "number", required: true, min: "5", value: String(old?.duration || 30) },
      { name: "fee", label: "Optional fee (PHP)", type: "number", min: "0", value: old?.fee == null ? "" : String(old.fee) },
      { name: "assigned", label: "Assigned providers (comma-separated names)", type: "text", value: (old?.staff_ids || []).map((id) => ownStaff.find((item) => item.staff_id === id)?.staff_name || id).join(", "), placeholder: ownStaff.map((item) => item.staff_name).join(", ") },
    ], old ? "Save service" : "Add service");
    if (!result) return;
    const providerTokens = result.assigned.split(",").map((item) => item.trim()).filter(Boolean);
    const assignedStaff = providerTokens.map((token) => ownStaff.find((person) => person.staff_id.toLowerCase() === token.toLowerCase() || person.staff_name.toLowerCase() === token.toLowerCase()));
    if (providerTokens.length && assignedStaff.some((person) => !person)) { toast("Choose provider names from the staff directory, separated by commas."); return; }
    const next = { ...(old || {}), name: result.name.trim(), category: result.category.trim(), description: result.description.trim(), duration: Math.max(5, Number(result.duration) || 30), active: old?.active !== false, staff_ids: [...new Set(assignedStaff.filter(Boolean).map((person) => person.staff_id))] };
    const names = [...new Set([...(clinic.services || []).filter((item) => item !== name), next.name])];
    const nextCatalog = [...currentCatalog.filter((item) => item.name !== name), next];
    await api.update("clinics", cid, { services: names, service_catalog: nextCatalog }, "clinic_id");
    await logClinicCatalogChange(session, clinic, old ? `Updated clinic service: ${next.name}` : `Added clinic service: ${next.name}`, names);
    toast("Clinic service saved.");
    await renderServices(root, { ...clinic, services: names, service_catalog: nextCatalog }, cid, session);
  };
  root.querySelector("#add-clinic-service").addEventListener("click", () => edit());
  root.querySelectorAll("[data-edit-service]").forEach((button) => button.addEventListener("click", () => edit(button.dataset.editService)));
  root.querySelectorAll("[data-toggle-service]").forEach((button) => button.addEventListener("click", () => {
    const name = button.dataset.toggleService;
    const deactivate = button.dataset.active === "true";
    const future = api.list("appointments").then((items) => items.filter((item) => item.clinic_id === cid && item.service_name === name && item.appointment_date >= dateToday() && ["Pending", "Confirmed"].includes(item.appointment_status)));
    future.then((affected) => modal(deactivate ? "Deactivate this service?" : "Activate this service?", affected.length ? `${affected.length} future bookings use this service. They will remain unchanged; contact the patients before changing their booking.` : "This changes whether patients can select this service for new requests.", async () => {
      const nextCatalog = currentCatalog.map((item) => item.name === name ? { ...item, active: !deactivate } : item);
      const names = deactivate ? (clinic.services || []).filter((item) => item !== name) : [...new Set([...(clinic.services || []), name])];
      await api.update("clinics", cid, { services: names, service_catalog: nextCatalog }, "clinic_id");
      await logClinicCatalogChange(session, clinic, `${deactivate ? "Deactivated" : "Activated"} clinic service: ${name}`, names);
      if (deactivate) {
        const affected = await future;
        for (const appointment of affected) await saveNotification(appointment.patient_id, `The clinic has deactivated ${name}. Your existing appointment remains on record; contact the clinic to confirm or change your booking.`, "Service change");
      }
      await renderServices(root, { ...clinic, services: names, service_catalog: nextCatalog }, cid, session);
    }));
  }));
  void catalog;
}

async function renderSchedules(root, clinic, cid) {
  const params = new URLSearchParams(location.search);
  const view = params.get("view") === "staff" || params.get("view") === "availability" ? "staff" : "hours";
  root.innerHTML = `<div class="clinic-view-tabs"><a class="${view === "hours" ? "is-active" : ""}" href="${clinicHref("schedules", "?view=hours")}">Operating hours</a><a class="${view === "staff" ? "is-active" : ""}" href="${clinicHref("schedules", "?view=staff")}">Staff schedules & availability</a></div><div id="clinic-schedule-content"></div>`;
  const content = root.querySelector("#clinic-schedule-content");
  const [staff, schedules, slots, appointments] = await Promise.all([api.list("staff"), api.list("schedules"), api.list("slots"), api.list("appointments")]);
  const ownStaff = staff.filter((item) => item.clinic_id === cid);
  const ownSchedules = schedules.filter((item) => item.clinic_id === cid);
  const ownSlots = slots.filter((item) => item.clinic_id === cid);
  if (view === "hours") {
    const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const hours = clinic.operating_schedule || Object.fromEntries(dayNames.map((day) => [day, { open: "08:00", close: "17:00", closed: day === "Sunday" }]));
    const closures = clinic.closures || [];
    content.innerHTML = `<section class="card clinic-hours-card"><div class="dashboard-section-head"><div><p class="eyebrow">Public availability</p><h2 class="section-title">Weekly operating hours</h2><p class="muted">Hour changes are checked against upcoming appointments before publishing.</p></div></div><form id="operating-hours-form"><div class="clinic-hours-grid">${dayNames.map((day) => `<div class="clinic-hour-row"><strong>${day}</strong><label><span>Open</span><input class="input" type="time" name="${day}-open" value="${esc(hours[day]?.open || "08:00")}" ${hours[day]?.closed ? "disabled" : ""}></label><label><span>Close</span><input class="input" type="time" name="${day}-close" value="${esc(hours[day]?.close || "17:00")}" ${hours[day]?.closed ? "disabled" : ""}></label><label class="clinic-closed-check"><input type="checkbox" name="${day}-closed" ${hours[day]?.closed ? "checked" : ""}> Closed</label></div>`).join("")}</div><div class="field"><label for="slot-interval">Appointment interval</label><select class="select" id="slot-interval">${[15, 20, 30, 45, 60].map((value) => `<option ${Number(clinic.slot_interval_minutes || 30) === value ? "selected" : ""}>${value}</option>`).join("")}</select></div><div class="actions"><button class="btn btn-primary" type="submit">Review and save hours</button><button class="btn btn-secondary" type="reset">Cancel edits</button></div></form><div class="clinic-hours-preview"><strong>Current public hours</strong><p>${esc(clinic.operating_hours || "Not configured")}</p></div></section>`;
    content.insertAdjacentHTML("beforeend", `<section class="card clinic-hours-card clinic-closures-card"><div><p class="eyebrow">Exceptions</p><h2 class="section-title">Holidays & temporary closures</h2><p class="muted">Available slots on closure dates are hidden from patient booking. Existing appointments stay on record and patients are notified.</p></div><form id="clinic-closure-form" class="clinic-closure-form"><label>Closure starts<input class="input" type="date" name="start" min="${dateToday()}" required></label><label>Closure ends<input class="input" type="date" name="end" min="${dateToday()}" required></label><label>Reason<input class="input" name="reason" required maxlength="100" placeholder="Holiday or temporary closure"></label><button class="btn btn-secondary" type="submit">Add closure</button></form><div class="clinic-shift-list">${closures.map((closure) => `<article><div><strong>${esc(closure.reason || "Temporary closure")}</strong><p>${esc(fmtDate(closure.start_date))}–${esc(fmtDate(closure.end_date))}</p></div><button class="btn btn-ghost" type="button" data-remove-closure="${esc(closure.closure_id)}">Remove closure</button></article>`).join("") || `<p class="muted">No holiday or temporary closure dates.</p>`}</div></section>`);
    content.querySelector("#clinic-closure-form").addEventListener("submit", async (event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget); const start = String(data.get("start")); const end = String(data.get("end"));
      if (end < start) { toast("Closure end date must follow its start date."); return; }
      if (closures.some((item) => start <= item.end_date && end >= item.start_date)) { toast("This closure overlaps an existing closure period."); return; }
      const affected = appointments.filter((item) => item.clinic_id === cid && item.appointment_date >= start && item.appointment_date <= end && ["Pending", "Confirmed"].includes(item.appointment_status));
      if (affected.length && !await confirmHours(affected.length)) return;
      const closure = { closure_id: `closure_${Date.now()}`, start_date: start, end_date: end, reason: String(data.get("reason")).trim() };
      await api.update("clinics", cid, { closures: [...closures, closure] }, "clinic_id");
      for (const slot of ownSlots.filter((item) => item.slot_date >= start && item.slot_date <= end && item.slot_status === "Available")) await api.update("slots", slot.slot_id, { slot_status: "Unavailable", availability_reason: "Clinic closure" }, "slot_id");
      for (const booking of affected) await saveNotification(booking.patient_id, `The clinic will be closed ${fmtDate(start)}–${fmtDate(end)} (${closure.reason}). Contact the clinic to discuss your appointment.`, "Clinic closure");
      toast(`Closure added.${affected.length ? ` ${affected.length} booking(s) need follow-up.` : ""}`); location.reload();
    });
    content.querySelectorAll("[data-remove-closure]").forEach((button) => button.addEventListener("click", () => modal("Remove this closure?", "Slots marked unavailable for this clinic closure will be reopened. Other schedule restrictions still apply.", async () => { const closure = closures.find((item) => item.closure_id === button.dataset.removeClosure); await api.update("clinics", cid, { closures: closures.filter((item) => item.closure_id !== closure?.closure_id) }, "clinic_id"); for (const slot of ownSlots.filter((item) => closure && item.slot_date >= closure.start_date && item.slot_date <= closure.end_date && item.availability_reason === "Clinic closure")) await api.update("slots", slot.slot_id, { slot_status: "Available", availability_reason: null }, "slot_id"); location.reload(); })));
    content.querySelectorAll("[name$='-closed']").forEach((check) => check.addEventListener("change", () => { const row = check.closest(".clinic-hour-row"); row.querySelectorAll('input[type="time"]').forEach((input) => input.disabled = check.checked); }));
    content.querySelector("#operating-hours-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const next = Object.fromEntries(dayNames.map((day) => [day, { open: form.elements[`${day}-open`].value, close: form.elements[`${day}-close`].value, closed: form.elements[`${day}-closed`].checked }]));
      if (Object.entries(next).some(([, item]) => !item.closed && (!item.open || !item.close || item.close <= item.open))) { toast("For open days, choose a valid closing time after opening."); return; }
      const changes = appointments.filter((item) => item.clinic_id === cid && item.appointment_date >= dateToday() && ["Pending", "Confirmed"].includes(item.appointment_status) && (() => { const day = new Date(`${item.appointment_date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Manila" }); const range = next[day]; return range?.closed || item.appointment_time < range?.open || item.appointment_time >= range?.close; })());
      if (changes.length && !await confirmHours(changes.length)) return;
      const displayHours = dayNames.filter((day) => !next[day].closed).map((day) => `${day.slice(0, 3)} ${fmtTime(next[day].open)}–${fmtTime(next[day].close)}`).join(" · ");
      await api.update("clinics", cid, { operating_schedule: next, operating_hours: displayHours, slot_interval_minutes: Number(content.querySelector("#slot-interval").value) }, "clinic_id");
      for (const slot of ownSlots.filter((item) => item.slot_date >= dateToday())) {
        const weekday = new Date(`${slot.slot_date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Manila" });
        const range = next[weekday];
        const outsideHours = !range || range.closed || slot.start_time < range.open || slot.start_time >= range.close;
        if (outsideHours && slot.slot_status === "Available") await api.update("slots", slot.slot_id, { slot_status: "Unavailable", availability_reason: "Clinic hours" }, "slot_id");
        else if (!outsideHours && slot.slot_status === "Unavailable" && slot.availability_reason === "Clinic hours") await api.update("slots", slot.slot_id, { slot_status: "Available", availability_reason: null }, "slot_id");
      }
      for (const booking of changes) await saveNotification(booking.patient_id, `The clinic's updated hours may affect your appointment on ${fmtDate(booking.appointment_date)}. Please contact the clinic.`, "Schedule change");
      toast(changes.length ? `Hours saved. ${changes.length} upcoming booking(s) may need follow-up.` : "Operating hours saved.");
      await renderSchedules(root, { ...clinic, operating_schedule: next, operating_hours: displayHours }, cid);
    });
  } else {
    const leaveRecords = clinic.staff_unavailability || [];
    content.innerHTML = `<section class="clinic-schedule-section"><div class="dashboard-section-head"><div><p class="eyebrow">Recurring availability</p><h2 class="section-title">Staff shifts</h2><p class="muted">Assign weekly work hours. Overlapping shifts for the same staff member are blocked.</p></div><button class="btn btn-secondary" id="add-staff-shift">Add staff shift</button></div><div class="clinic-shift-list">${ownSchedules.map((schedule) => { const member = staff.find((item) => item.staff_id === schedule.staff_id); return `<article><div><strong>${esc(member?.staff_name || "Staff member")}</strong><p>${esc(schedule.weekday || "Weekly schedule")} · ${esc(fmtTime(schedule.start_time))}–${esc(fmtTime(schedule.end_time))}</p><small>${esc(schedule.availability_status || "Available")}</small></div><button class="btn btn-ghost" data-edit-shift="${esc(schedule.schedule_id)}">Edit shift</button></article>`; }).join("") || `<div class="empty">No staff shifts are configured. Add a shift to begin defining provider availability.</div>`}</div></section><section class="clinic-schedule-section"><div class="dashboard-section-head"><div><p class="eyebrow">Exceptions</p><h2 class="section-title">Leave & unavailability</h2><p class="muted">Record time away so unavailable slots are not offered for new bookings.</p></div><button class="btn btn-secondary" id="record-staff-leave">Record leave</button></div><div class="clinic-shift-list">${leaveRecords.map((leave) => `<article><div><strong>${esc(staff.find((item) => item.staff_id === leave.staff_id)?.staff_name || "Staff member")}</strong><p>${esc(fmtDate(leave.start_date))}–${esc(fmtDate(leave.end_date))} · ${esc(leave.reason || "Unavailable")}</p></div><button type="button" class="btn btn-ghost" data-remove-leave="${esc(leave.leave_id)}">Remove leave</button></article>`).join("") || `<p class="muted">No leave records are scheduled.</p>`}</div></section><section class="clinic-schedule-section"><div class="dashboard-section-head"><div><p class="eyebrow">Patient booking availability</p><h2 class="section-title">Published appointment slots</h2><p class="muted">Upcoming slots reflect the clinic schedule and staff assignments.</p></div><button class="btn btn-primary" id="add-clinic-slot">Add appointment slot</button></div><div class="clinic-slot-list">${ownSlots.filter((slot) => slot.slot_date >= dateToday()).slice(0, 30).map((slot) => `<article><span>${esc(fmtDate(slot.slot_date))} · ${esc(fmtTime(slot.start_time))}</span><strong>${esc(staff.find((item) => item.staff_id === slot.staff_id)?.staff_name || "Provider")}</strong>${badge(slot.slot_status)}</article>`).join("") || `<p class="muted">No future slots have been published.</p>`}</div></section>`;
    content.querySelector("#add-staff-shift").addEventListener("click", async () => {
      const eligible = ownStaff.filter((item) => item.active !== false);
      if (!eligible.length) { toast("Add an active staff profile before creating shifts."); return; }
      const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      const result = await formModal("Add recurring staff shift", "Select the staff member, weekday, and shift range.", [
        { name: "staff", label: "Staff member", type: "select", required: true, options: [{ value: "", label: "Choose staff" }, ...eligible.map((item) => ({ value: item.staff_id, label: item.staff_name }))] },
        { name: "weekday", label: "Weekday", type: "select", required: true, options: weekdays.map((item) => ({ value: item, label: item })) },
        { name: "start", label: "Shift starts", type: "time", required: true, value: "08:00" },
        { name: "end", label: "Shift ends", type: "time", required: true, value: "17:00" },
      ], "Review shift");
      if (!result) return;
      if (result.end <= result.start) { toast("Shift end must be later than its start."); return; }
      const overlap = ownSchedules.some((item) => item.staff_id === result.staff && (item.weekday || "").toLowerCase().includes(result.weekday.toLowerCase()) && result.start < item.end_time && result.end > item.start_time);
      if (overlap) { toast("This shift overlaps another shift for the selected staff member."); return; }
      await api.create("schedules", { schedule_id: `sch_${Date.now()}`, clinic_id: cid, staff_id: result.staff, weekday: result.weekday, start_time: result.start, end_time: result.end, availability_status: "Available" });
      toast("Staff shift added."); location.reload();
    });
    content.querySelector("#record-staff-leave").addEventListener("click", async () => {
      const eligible = ownStaff.filter((item) => item.active !== false);
      if (!eligible.length) { toast("Add staff before recording leave."); return; }
      const result = await formModal("Record staff leave or unavailability", "Available appointment slots during this period will be closed. Existing bookings will remain and affected patients will be notified.", [
        { name: "staff", label: "Staff member", type: "select", required: true, options: [{ value: "", label: "Choose staff" }, ...eligible.map((item) => ({ value: item.staff_id, label: item.staff_name }))] },
        { name: "start", label: "First day", type: "date", required: true, min: dateToday(), value: dateToday() },
        { name: "end", label: "Last day", type: "date", required: true, min: dateToday(), value: dateToday() },
        { name: "reason", label: "Reason / note", type: "text", required: true },
      ], "Review leave");
      if (!result) return;
      if (result.end < result.start) { toast("The last day must be on or after the first day."); return; }
      const staffSlots = ownSlots.filter((slot) => slot.staff_id === result.staff && slot.slot_date >= result.start && slot.slot_date <= result.end);
      const affected = appointments.filter((item) => item.staff_id === result.staff && item.appointment_date >= result.start && item.appointment_date <= result.end && ["Pending", "Confirmed"].includes(item.appointment_status));
      const leave = { leave_id: `leave_${Date.now()}`, staff_id: result.staff, start_date: result.start, end_date: result.end, reason: result.reason.trim() };
      await api.update("clinics", cid, { staff_unavailability: [...leaveRecords, leave] }, "clinic_id");
      for (const slot of staffSlots.filter((item) => item.slot_status === "Available")) await api.update("slots", slot.slot_id, { slot_status: "Unavailable", availability_reason: "Staff leave" }, "slot_id");
      for (const booking of affected) await saveNotification(booking.patient_id, `${staff.find((item) => item.staff_id === result.staff)?.staff_name || "Your provider"} is unavailable during ${fmtDate(result.start)}–${fmtDate(result.end)}. Please contact the clinic about your appointment.`, "Staff availability change");
      toast(`Leave recorded.${affected.length ? ` ${affected.length} patient booking(s) need follow-up.` : ""}`);
      location.reload();
    });
    content.querySelectorAll("[data-remove-leave]").forEach((button) => button.addEventListener("click", () => modal("Remove this leave record?", "Slots closed specifically for this leave period will reopen. Other clinic and staff schedule restrictions still apply.", async () => { const removed = leaveRecords.find((item) => item.leave_id === button.dataset.removeLeave); const remaining = leaveRecords.filter((item) => item.leave_id !== button.dataset.removeLeave); await api.update("clinics", cid, { staff_unavailability: remaining }, "clinic_id"); for (const slot of ownSlots.filter((item) => removed && item.staff_id === removed.staff_id && item.slot_date >= removed.start_date && item.slot_date <= removed.end_date && item.availability_reason === "Staff leave" && !remaining.some((leave) => leave.staff_id === item.staff_id && item.slot_date >= leave.start_date && item.slot_date <= leave.end_date))) await api.update("slots", slot.slot_id, { slot_status: "Available", availability_reason: null }, "slot_id"); location.reload(); })));
    content.querySelectorAll("[data-edit-shift]").forEach((button) => button.addEventListener("click", async () => {
      const schedule = ownSchedules.find((item) => item.schedule_id === button.dataset.editShift);
      const result = await formModal("Edit staff shift", "Review overlapping periods before saving a recurring shift.", [
        { name: "start", label: "Shift starts", type: "time", required: true, value: schedule.start_time },
        { name: "end", label: "Shift ends", type: "time", required: true, value: schedule.end_time },
        { name: "weekday", label: "Workdays", type: "text", required: true, value: schedule.weekday },
      ], "Save shift");
      if (!result) return;
      if (result.end <= result.start) { toast("Shift end must be after its start."); return; }
      const overlap = ownSchedules.some((item) => item.schedule_id !== schedule.schedule_id && item.staff_id === schedule.staff_id && item.weekday === result.weekday && result.start < item.end_time && result.end > item.start_time);
      if (overlap) { toast("This shift overlaps another saved shift for the same staff member."); return; }
      const affected = appointments.filter((booking) => {
        if (booking.staff_id !== schedule.staff_id || booking.appointment_date < dateToday() || !["Pending", "Confirmed"].includes(booking.appointment_status)) return false;
        const day = new Date(`${booking.appointment_date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Manila" });
        const remainsScheduled = result.weekday.toLowerCase().includes(day.toLowerCase()) && booking.appointment_time >= result.start && booking.appointment_time < result.end;
        return (schedule.weekday || "").toLowerCase().includes(day.toLowerCase()) && !remainsScheduled;
      });
      if (affected.length && !await confirmHours(affected.length)) return;
      await api.update("schedules", schedule.schedule_id, { start_time: result.start, end_time: result.end, weekday: result.weekday }, "schedule_id");
      for (const slot of ownSlots.filter((item) => item.staff_id === schedule.staff_id && item.slot_date >= dateToday())) {
        const day = new Date(`${slot.slot_date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Manila" });
        const remainsScheduled = result.weekday.toLowerCase().includes(day.toLowerCase()) && slot.start_time >= result.start && slot.start_time < result.end;
        if (!remainsScheduled && slot.slot_status === "Available") await api.update("slots", slot.slot_id, { slot_status: "Unavailable", availability_reason: "Staff shift" }, "slot_id");
        else if (remainsScheduled && slot.slot_status === "Unavailable" && slot.availability_reason === "Staff shift") await api.update("slots", slot.slot_id, { slot_status: "Available", availability_reason: null }, "slot_id");
      }
      for (const booking of affected) await saveNotification(booking.patient_id, `Your provider's updated shift may affect your ${fmtDate(booking.appointment_date)} visit. Please contact the clinic.`, "Staff schedule change");
      toast(affected.length ? `Shift updated. ${affected.length} booking(s) need follow-up.` : "Shift updated.");
      location.reload();
    }));
    content.querySelector("#add-clinic-slot").addEventListener("click", async () => {
      const eligible = ownStaff.filter((item) => item.duty_status === "On Duty" && item.active !== false);
      if (!eligible.length) { toast("Set an active staff member to On Duty before publishing a slot."); return; }
      const times = Array.from({ length: 48 }, (_, index) => { const total = 8 * 60 + index * 15; if (total >= 19 * 60) return null; const hour = Math.floor(total / 60); return `${String(hour).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; }).filter(Boolean);
      const result = await formModal("Publish an appointment slot", "Choose a future date and an available provider time.", [
        { name: "date", label: "Date", type: "date", required: true, min: dateToday(), value: dateToday() },
        { name: "staff", label: "Provider", type: "select", required: true, options: [{ value: "", label: "Choose provider" }, ...eligible.map((item) => ({ value: item.staff_id, label: `${item.staff_name} · ${staffRole(item)}` }))] },
        { name: "time", label: "Start time", type: "select", required: true, options: [{ value: "", label: "Choose time" }, ...times.map((item) => ({ value: item, label: fmtTime(item) }))] },
      ], "Review and publish");
      if (!result) return;
      const startMinutes = Number(result.time.slice(0, 2)) * 60 + Number(result.time.slice(3, 5));
      const duration = Number(clinic.slot_interval_minutes) || 30;
      const conflict = ownSlots.some((item) => { if (item.staff_id !== result.staff || item.slot_date !== result.date) return false; const itemStart = Number(item.start_time.slice(0, 2)) * 60 + Number(item.start_time.slice(3, 5)); const itemDuration = Number(item.duration_minutes) || duration; return startMinutes < itemStart + itemDuration && startMinutes + duration > itemStart; });
      if (conflict) { toast("This provider's slot would overlap another published time."); return; }
      const hours = clinic.operating_schedule;
      if (hours) { const day = new Date(`${result.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Manila" }); const range = hours[day]; if (!range || range.closed || result.time < range.open || result.time >= range.close) { toast("That time is outside the clinic's operating hours."); return; } }
      if ((clinic.closures || []).some((closure) => result.date >= closure.start_date && result.date <= closure.end_date)) { toast("The clinic is closed on that date."); return; }
      const occupied = appointments.some((item) => item.staff_id === result.staff && item.appointment_date === result.date && item.appointment_time === result.time && ["Pending", "Confirmed"].includes(item.appointment_status));
      if (occupied) { toast("An appointment already uses that provider time."); return; }
      await api.create("slots", { slot_id: `slot_${Date.now()}`, clinic_id: cid, staff_id: result.staff, slot_date: result.date, start_time: result.time, duration_minutes: duration, slot_status: "Available" });
      toast("Appointment slot published.");
      location.reload();
    });
  }
}

function confirmHours(affected) {
  return new Promise((resolve) => {
    modal("Review affected appointments", `${affected} pending or confirmed appointment(s) fall outside the new hours. Save the change and notify those patients?`, () => resolve(true));
    const backdrop = document.querySelector(".modal-backdrop:last-child");
    backdrop?.querySelector("[data-close]")?.addEventListener("click", () => resolve(false));
  });
}

async function renderProfile(root, clinic, cid, session) {
  const user = await api.get("users", session.user_id, "user_id");
  let clinicPhoto = clinic.profile_photo || "";
  const pending = !approved(clinic);
  const docs = Array.isArray(clinic.registration_documents) ? clinic.registration_documents : [];
  const initialLat = Number(clinic.latitude) || 7.8257;
  const initialLng = Number(clinic.longitude) || 123.437;
  root.innerHTML = `<section class="clinic-profile-status ${approved(clinic) ? "is-approved" : ""}"><div><p class="eyebrow">Clinic registration status</p><h2>${esc(clinic.clinic_name)}</h2><p>${pending ? "Your registration status is simulated and can only be changed by a system administrator." : "Your clinic is approved for public discovery in this prototype."}</p></div><span class="clinic-approval-pill ${approved(clinic) ? "is-approved" : ""}">${esc(statusText(clinic))}</span></section>${clinic.review_feedback ? `<div class="notice clinic-review-feedback"><strong>Administrator review feedback</strong><p>${esc(clinic.review_feedback)}</p></div>` : ""}<form class="card clinic-profile-form" id="clinic-profile-form"><div class="clinic-profile-section"><p class="eyebrow">Public listing</p><h2>Clinic information</h2><div class="clinic-logo-editor"><div class="clinic-overview-logo" id="clinic-profile-logo-preview">${clinicPhoto ? `<img src="${esc(clinicPhoto)}" alt="Clinic logo preview">` : esc(clinic.clinic_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join(""))}</div><label>Clinic logo or image<input class="input" id="clinic-profile-logo" type="file" accept="image/jpeg,image/png,image/webp"><small>Image is stored in this browser only. JPG, PNG, or WebP up to 5 MB.</small></label><button class="btn btn-ghost" id="clinic-profile-remove-logo" type="button">Remove image</button></div><div class="clinic-profile-grid"><label>Clinic name<input class="input" name="clinic_name" required value="${esc(clinic.clinic_name)}"></label><label>Clinic type<input class="input" name="clinic_type" value="${esc(clinic.clinic_type || "")}"></label><label>Official clinic email<input class="input" name="email" type="email" required value="${esc(clinic.email || "")}"></label><label>Public contact number<input class="input" name="contact_number" type="tel" required value="${esc(clinic.contact_number || "")}"></label><label>Website / social link<input class="input" name="website_url" type="url" value="${esc(clinic.website_url || "")}"></label><label>Specialties<input class="input" value="${esc((clinic.specialties || []).join(", "))}" readonly></label><label class="clinic-profile-wide">Services<textarea class="textarea" name="service_description" rows="3">${esc(clinic.service_description || (clinic.services || []).join(", "))}</textarea></label><label class="clinic-profile-wide">Street / building address<input class="input" name="address" required value="${esc(clinic.address || "")}"></label><label>Barangay<input class="input" name="barangay" value="${esc(clinic.barangay || "")}"></label><label>City / Municipality<input class="input" name="city" value="${esc(clinic.city || "Pagadian City")}"></label><label>Province<input class="input" name="province" value="${esc(clinic.province || "Zamboanga del Sur")}"></label><label>Operating hours<input class="input" name="operating_hours" value="${esc(clinic.operating_hours || "")}" readonly><small>Manage hours from Schedule & Operating Hours.</small></label><label>Representative<input class="input" value="${esc(clinic.representative_name || user?.name || session.name)}" readonly></label><label>Representative role<input class="input" value="Clinic Administrator" readonly></label></div></div><section class="clinic-profile-section" id="location"><p class="eyebrow">Map & location</p><h2>Registered clinic location</h2><p class="muted">Drag the map pin or enter coordinates. This updates the public clinic marker only.</p><div class="clinic-profile-grid"><label>Latitude<input class="input" name="latitude" id="clinic-profile-lat" type="number" step="any" value="${initialLat}" required></label><label>Longitude<input class="input" name="longitude" id="clinic-profile-lng" type="number" step="any" value="${initialLng}" required></label></div><div id="clinic-profile-map" class="clinic-profile-map" role="application" aria-label="Clinic location map"></div><p class="form-error" id="clinic-profile-map-error" role="status"></p></section><section class="clinic-profile-section"><p class="eyebrow">Submitted requirements</p><h2>Registration documents</h2><p class="muted">Uploaded documents are stored in this browser and have not been verified by this prototype.</p><div class="clinic-document-list">${docs.map((item) => `<article><strong>${esc(item.name || "Supporting document")}</strong><span>${esc(item.verification_status || "Not verified")}</span></article>`).join("") || `<p>No supporting documents are on file.</p>`}</div>${clinic.license_number ? `<p><strong>License / registration:</strong> ${esc(clinic.license_number)} ${esc(clinic.license_authority || "")}</p>` : ""}</section><section class="clinic-profile-section clinic-account-summary" id="account-settings"><p class="eyebrow">Account settings</p><h2>Authorized representative</h2><dl><div><dt>Account name</dt><dd>${esc(user?.name || session.name)}</dd></div><div><dt>Access role</dt><dd>Clinic Administrator</dd></div><div><dt>Account email</dt><dd>${esc(user?.email || "Not available")}</dd></div><div><dt>Account status</dt><dd>${esc(user?.account_status || "Active")}</dd></div></dl><p class="muted">Authentication details and approval status are protected and cannot be changed here.</p></section><p class="form-error" id="clinic-profile-error" role="alert"></p><div class="clinic-profile-actions"><button class="btn btn-primary" type="submit">${pending && clinic.approval_status === "Rejected" ? "Save corrections & resubmit" : "Save clinic profile"}</button><button class="btn btn-secondary" type="button" id="clinic-profile-cancel">Cancel changes</button></div></form>`;
  let map;
  try {
    const L = await loadLeaflet();
    const latInput = root.querySelector("#clinic-profile-lat");
    const lngInput = root.querySelector("#clinic-profile-lng");
    map = L.map(root.querySelector("#clinic-profile-map")).setView([initialLat, initialLng], 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    const marker = L.marker([initialLat, initialLng], { draggable: true }).addTo(map);
    marker.on("dragend", () => { const point = marker.getLatLng(); latInput.value = point.lat.toFixed(6); lngInput.value = point.lng.toFixed(6); });
    const updateMarker = () => { const lat = Number(latInput.value); const lng = Number(lngInput.value); if (Number.isFinite(lat) && Number.isFinite(lng)) { marker.setLatLng([lat, lng]); map.panTo([lat, lng]); } };
    latInput.addEventListener("change", updateMarker); lngInput.addEventListener("change", updateMarker);
  } catch (error) { root.querySelector("#clinic-profile-map-error").textContent = `Map preview unavailable: ${error.message}. Use the coordinate fields instead.`; }
  root.querySelector("#clinic-profile-logo").addEventListener("change", (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) { event.currentTarget.value = ""; toast("Choose a JPG, PNG, or WebP image up to 5 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => { clinicPhoto = String(reader.result || ""); root.querySelector("#clinic-profile-logo-preview").innerHTML = `<img src="${esc(clinicPhoto)}" alt="Clinic logo preview">`; };
    reader.onerror = () => toast("The selected clinic image could not be read.");
    reader.readAsDataURL(file);
  });
  root.querySelector("#clinic-profile-remove-logo").addEventListener("click", () => { clinicPhoto = ""; root.querySelector("#clinic-profile-logo").value = ""; root.querySelector("#clinic-profile-logo-preview").textContent = clinic.clinic_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join(""); });
  root.querySelector("#clinic-profile-cancel").addEventListener("click", () => location.reload());
  root.querySelector("#clinic-profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const lat = Number(data.get("latitude")); const lng = Number(data.get("longitude"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 4 || lat > 21 || lng < 116 || lng > 127) { root.querySelector("#clinic-profile-error").textContent = "Enter valid coordinates within the Philippines."; return; }
    const nextEmail = String(data.get("email")).trim().toLowerCase();
    const nextPhone = String(data.get("contact_number")).trim();
    const allClinics = await api.list("clinics");
    const allUsers = await api.list("users"); const allPatients = await api.list("patients");
    const norm = (value) => String(value || "").replace(/\D/g, "").replace(/^63/, "0");
    if (allClinics.some((item) => item.clinic_id !== cid && item.email?.toLowerCase() === nextEmail) || allUsers.some((item) => item.user_id !== session.user_id && item.email?.toLowerCase() === nextEmail) || allPatients.some((item) => item.user_id !== session.user_id && item.email?.toLowerCase() === nextEmail)) { root.querySelector("#clinic-profile-error").textContent = "That email is already used by another account or clinic."; return; }
    if (allClinics.some((item) => item.clinic_id !== cid && norm(item.contact_number) === norm(nextPhone)) || allUsers.some((item) => item.user_id !== session.user_id && norm(item.mobile_number) === norm(nextPhone)) || allPatients.some((item) => item.user_id !== session.user_id && norm(item.mobile_number) === norm(nextPhone))) { root.querySelector("#clinic-profile-error").textContent = "That mobile number is already used by another account or clinic."; return; }
    const changes = { clinic_name: String(data.get("clinic_name")).trim(), clinic_type: String(data.get("clinic_type")).trim(), email: nextEmail, contact_number: nextPhone, website_url: String(data.get("website_url")).trim(), service_description: String(data.get("service_description")).trim(), address: String(data.get("address")).trim(), barangay: String(data.get("barangay")).trim(), city: String(data.get("city")).trim(), province: String(data.get("province")).trim(), latitude: lat, longitude: lng, profile_photo: clinicPhoto || null };
    if (["Rejected", "Needs Correction"].includes(clinic.approval_status) || clinic.registration_status === "Needs Correction") { changes.approval_status = "Pending"; changes.registration_status = "Pending Review"; changes.review_feedback = ""; changes.verified = false; }
    await api.update("clinics", cid, changes, "clinic_id");
    await logClinicActivity(session, clinic, "Updated clinic profile and location", "clinic", cid, `Facility: ${changes.clinic_name}. Address: ${[changes.address, changes.barangay, changes.city, changes.province].filter(Boolean).join(", ")}. Coordinates: ${changes.latitude}, ${changes.longitude}. Specialties: ${(clinic.specialties || []).join(", ") || "None listed"}. Services: ${(clinic.services || []).join(", ") || "None listed"}.`);
    if (changes.approval_status === "Pending") await api.notify("system_admin", `${clinic.clinic_name} resubmitted clinic registration corrections.`, "Clinic resubmission", { reference_type: "clinic", reference_id: cid });
    await saveNotification(cid, clinic.approval_status === "Rejected" ? "Clinic registration corrections were submitted for administrator review." : "Clinic profile changes were saved.", "Clinic profile update");
    toast(clinic.approval_status === "Rejected" ? "Corrections submitted for review." : "Clinic profile saved.");
    location.reload();
  });
  if (location.hash) requestAnimationFrame(() => root.querySelector(location.hash)?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function renderClinicStatus(root, clinic, cid) {
  root.innerHTML = `<div class="clinic-status-layout"><form class="card clinic-status-form" id="clinic-status-form"><p class="eyebrow">Public patient listing</p><h2>Clinic availability</h2><p class="muted">This status is separate from administrator verification.</p><label>Availability<select class="select" name="clinic_status">${["Open", "Limited Services", "Closed"].map((item) => `<option ${item === clinic.clinic_status ? "selected" : ""}>${item}</option>`).join("")}</select></label><label>Patients currently in queue<input class="input" type="number" name="queue_count" min="0" value="${Number(clinic.queue_count || 0)}"></label><label>Estimated wait in minutes<input class="input" type="number" name="estimated_wait_minutes" min="0" value="${Number(clinic.estimated_wait_minutes || 0)}"></label><button class="btn btn-primary">Publish availability</button></form><section class="card clinic-status-preview"><p class="eyebrow">Patient listing preview</p><h2>${esc(clinic.clinic_name)}</h2>${badge(clinic.clinic_status || "Open")}<p>${esc(clinic.address || "Address not listed")}</p><strong>${Number(clinic.queue_count || 0)}</strong><p>patients in queue · ${Number(clinic.estimated_wait_minutes || 0)} minute wait</p><span class="clinic-approval-pill ${approved(clinic) ? "is-approved" : ""}">${esc(approved(clinic) ? "Approved listing" : statusText(clinic))}</span></section></div>`;
  root.querySelector("form").addEventListener("submit", async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); await api.update("clinics", cid, { clinic_status: form.get("clinic_status"), queue_count: Math.max(0, Number(form.get("queue_count")) || 0), estimated_wait_minutes: Math.max(0, Number(form.get("estimated_wait_minutes")) || 0) }, "clinic_id"); await saveNotification(cid, "Public clinic availability was updated."); toast("Clinic availability published."); location.reload(); });
}

async function renderNotifications(root, cid) {
  const render = async () => {
    const all = await api.list("notifications");
    const notes = all.filter((item) => item.recipient_id === cid).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    root.innerHTML = `<section class="clinic-notifications-head"><div><p class="eyebrow">Clinic inbox</p><h2>Notifications</h2><p>Appointment decisions and clinic updates appear here.</p></div><button class="btn btn-secondary" id="mark-clinic-notifications">Mark all as read</button></section><div class="clinic-notification-list">${notes.map((note) => `<article class="card clinic-notification-item ${note.read ? "" : "is-unread"}"><div><p class="eyebrow">${esc(note.notification_type || "Update")}</p><p>${esc(note.message)}</p><small>${esc(new Date(note.created_at).toLocaleString("en-PH"))}</small></div>${note.read ? `<span>Read</span>` : `<button class="btn btn-ghost" data-read-clinic-note="${esc(note.notification_id)}">Mark read</button>`}</article>`).join("") || `<div class="empty">No clinic notifications yet.</div>`}</div>`;
    root.querySelectorAll("[data-read-clinic-note]").forEach((button) => button.addEventListener("click", async () => { await api.update("notifications", button.dataset.readClinicNote, { read: true }, "notification_id"); await render(); }));
    root.querySelector("#mark-clinic-notifications").addEventListener("click", async () => { for (const note of notes.filter((item) => !item.read)) await api.update("notifications", note.notification_id, { read: true }, "notification_id"); await render(); });
  };
  startPolling(render);
}

async function renderReports(root, clinic, cid) {
  const appointments = (await api.list("appointments")).filter((item) => item.clinic_id === cid);
  const staff = (await api.list("staff")).filter((item) => item.clinic_id === cid);
  const serviceCounts = new Map();
  appointments.forEach((item) => serviceCounts.set(item.service_name || "Unspecified", (serviceCounts.get(item.service_name || "Unspecified") || 0) + 1));
  const statuses = ["Pending", "Confirmed", "Completed", "Cancelled", "Rejected"];
  root.innerHTML = `<section class="clinic-report-intro"><p class="eyebrow">Operations snapshot</p><h2>${esc(clinic.clinic_name)}</h2><p class="muted">Counts are calculated from the shared appointment and staff records in this browser.</p></section><section class="clinic-overview-stats clinic-report-stats">${statuses.map((status) => `<article class="card clinic-overview-stat"><span>${status}</span><strong>${appointments.filter((item) => item.appointment_status === status).length}</strong><small>Appointments</small></article>`).join("")}<article class="card clinic-overview-stat"><span>On-duty staff</span><strong>${staff.filter((item) => item.duty_status === "On Duty").length}</strong><small>of ${staff.length} team records</small></article></section><div class="grid grid-2"><section class="card"><p class="eyebrow">Service usage</p><h2 class="section-title">Appointments by service</h2><div class="clinic-report-bars">${[...serviceCounts].sort((a, b) => b[1] - a[1]).map(([name, count]) => `<div><span><strong>${esc(name)}</strong><small>${count}</small></span><i style="--bar:${Math.max(8, count / Math.max(1, appointments.length) * 100)}%"></i></div>`).join("") || `<p>No appointment history yet.</p>`}</div></section><section class="card"><p class="eyebrow">Staff coverage</p><h2 class="section-title">Availability by status</h2><div class="clinic-report-bars">${["On Duty", "Off Duty", "On Leave", "Unavailable"].map((status) => { const count = staff.filter((item) => item.duty_status === status).length; return `<div><span><strong>${status}</strong><small>${count}</small></span><i style="--bar:${Math.max(8, count / Math.max(1, staff.length) * 100)}%"></i></div>`; }).join("")}</div></section></div><section class="card"><p class="eyebrow">Recent records</p><h2 class="section-title">Latest appointment activity</h2><div class="clinic-activity-list">${appointments.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 8).map((item) => `<article><i></i><div><strong>${esc(item.reference_number || "Appointment")} · ${esc(item.appointment_status)}</strong><p>${esc(item.service_name || "Service")} on ${esc(fmtDate(item.appointment_date))}</p></div></article>`).join("") || `<p class="muted">No activity yet.</p>`}</div></section>`;
}

async function renderSupport(root, feature, cid, session) {
  if (feature === "help") {
    const faq = (await api.list("faqs")).filter((item) => item.published !== false && ["General", "Clinic"].includes(item.audience || "General"));
    root.innerHTML = `<section class="clinic-support-layout"><div class="card"><p class="eyebrow">Help & Support</p><h2>FAQs & Help Center</h2><label>Search questions<input class="input" id="clinic-faq-search" type="search" placeholder="Search appointments, staff, verification"></label><div id="clinic-faq-results">${faq.map((item) => `<details class="help-faq"><summary>${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`).join("") || `<p class="muted">No published clinic help articles yet.</p>`}</div></div><aside class="card"><h2>Still need help?</h2><p>Send an issue report linked to this clinic account and track its status.</p><a class="btn btn-primary" href="${clinicHref("report-issue")}">Report an issue</a></aside></section>`;
    root.querySelector("#clinic-faq-search").addEventListener("input", (event) => { const query = event.target.value.toLowerCase(); root.querySelectorAll("details").forEach((item) => item.hidden = !item.textContent.toLowerCase().includes(query)); });
    return;
  }
  const reports = (await api.list("support_reports")).filter((item) => item.recipient_id === cid || item.user_id === session.user_id);
  if (feature === "support-reports") {
    root.innerHTML = `<section class="clinic-notifications-head"><div><p class="eyebrow">Help & Support</p><h2>My support reports</h2><p>Track reports submitted by this clinic account.</p></div><a class="btn btn-primary" href="${clinicHref("report-issue")}">Report an issue</a></section><div class="clinic-support-report-list">${reports.map((item) => `<article class="card"><div class="clinic-support-report-head"><div><p class="eyebrow">${esc(item.report_category || "Support")}</p><h3>${esc(item.subject || "Issue report")}</h3></div>${badge(item.report_status || "Received")}</div><p>${esc(item.description || "")}</p><small>${esc(new Date(item.created_at).toLocaleString("en-PH"))}</small>${item.resolution_notes ? `<div class="notice"><strong>Response</strong><p>${esc(item.resolution_notes)}</p></div>` : `<p class="muted">No resolution note yet.</p>`}</article>`).join("") || `<div class="empty">No support reports yet.</div>`}</div>`;
    return;
  }
  root.innerHTML = `<section class="card clinic-report-form-card"><p class="eyebrow">Help & Support</p><h2>Report an issue</h2><p class="muted">Your report is associated with ${esc(session.name)} and ${esc(cid)} in this browser.</p><form id="clinic-issue-form"><label>Category<select class="select" name="category" required>${["Appointments", "Staff & schedules", "Clinic profile", "Verification", "Website problem", "Other"].map((item) => `<option>${item}</option>`).join("")}</select></label><label>Subject<input class="input" name="subject" maxlength="120" required></label><label>Describe the issue<textarea class="textarea" name="description" rows="6" maxlength="2000" required></textarea></label><label>Attachment (optional)<input class="input" name="attachment" type="file" accept="image/png,image/jpeg,application/pdf"><small>File is not uploaded; the selected filename is stored as a local mock record.</small></label><p class="form-error" id="clinic-issue-error" role="alert"></p><div class="actions"><button class="btn btn-primary" type="submit">Submit report</button><a class="btn btn-secondary" href="${clinicHref("support-reports")}">My support reports</a></div></form></section>`;
  root.querySelector("#clinic-issue-form").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return; const data = new FormData(form); const file = form.elements.attachment.files?.[0]; const record = { support_report_id: `spr_${Date.now()}`, recipient_id: cid, clinic_id: cid, user_id: session.user_id, report_category: data.get("category"), subject: String(data.get("subject")).trim(), description: String(data.get("description")).trim(), report_status: "Received", resolution_notes: "", attachment: file ? { name: file.name, size: file.size } : null, created_at: new Date().toISOString() }; await api.create("support_reports", record); await api.notify("system_admin", `New clinic issue report: ${record.subject}`, "Support report", { reference_type: "support_report", reference_id: record.support_report_id }); await saveNotification(cid, `Support report received: ${record.subject}`, "Support update"); root.innerHTML = `<section class="card success-state"><div class="success-check">✓</div><h2>Report submitted</h2><p>Your support report has been saved in this browser and linked to the clinic account.</p><a class="btn btn-primary" href="${clinicHref("support-reports")}">View my support reports</a></section>`; });
}
