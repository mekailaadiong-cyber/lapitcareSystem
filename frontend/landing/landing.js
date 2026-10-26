import { api } from "../shared/js/api.js";
import { appPath } from "../shared/js/config.js";
import { setupCustomSelects } from "../shared/js/ui.js";
setupCustomSelects();
const features = [
  [
    "⌕",
    "Clinic discovery & search",
    "Find verified private clinics by name, specialty, service, or location.",
  ],
  [
    "◇",
    "Smart availability filters",
    "Narrow results by specialty, barangay, availability, and clinic status.",
  ],
  [
    "⌖",
    "Interactive clinic map",
    "Explore private clinics across Pagadian with current status markers.",
  ],
  [
    "✚",
    "Staff duty status",
    "See whether clinic staff are on duty, off duty, on leave, or unavailable.",
  ],
  [
    "◷",
    "Appointment management",
    "Book, reschedule, or cancel within each clinic’s policy window.",
  ],
  [
    "▣",
    "Clinic schedules",
    "Clinics coordinate requests, schedules, slots, and appointment updates.",
  ],
  [
    "◉",
    "Notifications",
    "Keep up with confirmations, reminders, cancellations, and status changes.",
  ],
  [
    "✓",
    "Clinic verification",
    "Listings appear after review and approval by the System Administrator.",
  ],
  [
    "◇",
    "Role-based access",
    "Separate, protected workspaces for patients, clinics, and administrators.",
  ],
  [
    "☆",
    "Patient feedback",
    "Share a rating and comment only after a completed appointment.",
  ],
];
document.querySelector("#feature-grid").innerHTML = features
  .map(
    ([i, t, d]) =>
      `<article class="feature-card reveal"><div class="feature-icon">${i}</div><h3>${t}</h3><p>${d}</p></article>`,
  )
  .join("");
document.querySelector("#quick-search").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = new URLSearchParams(new FormData(e.currentTarget));
  location.href = `${appPath("/patient/clinics/clinics.html")}?${q}`;
});
async function initMap() {
  try {
    if (!window.L)
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        s.onload = resolve;
        s.onerror = reject;
        document.head.append(s);
      });
    const map = L.map("landing-map", { scrollWheelZoom: false }).setView(
      [7.8257, 123.437],
      13,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
    }).addTo(map);
    const clinics = await api.clinics();
    clinics.slice(0, 8).forEach((c, i) =>
      setTimeout(() => {
        const marker = L.marker([c.latitude, c.longitude], {
          icon: L.divIcon({ className: "clinic-marker", iconSize: [22, 22] }),
        }).addTo(map);
        marker.bindPopup(
          `<strong>${c.clinic_name}</strong><br><small>${c.specialties[0]} · ${c.clinic_status}</small><br><a href="${appPath("/patient/clinic-detail/clinic-detail.html")}?id=${encodeURIComponent(c.clinic_id)}">View profile →</a>`,
        );
      }, i * 140),
    );
  } catch {
    document.querySelector("#map-error").classList.remove("hidden");
  }
}
initMap();
let cycle = 0;
setInterval(() => {
  const el = document.querySelector("[data-cycle-status]");
  const values = ["On Duty", "On Leave", "On Duty"];
  el.textContent = values[cycle++ % values.length];
  el.className = `badge status-${el.textContent.toLowerCase().replaceAll(" ", "-")}`;
}, 2600);
