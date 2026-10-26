import { config } from "./config.js";
import { getSession } from "./session.js";

const clone = (value) => structuredClone(value);

async function request(action, body) {
  const response = await fetch(`${config.api_base}${action}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}

async function action(name, body) {
  return request(`?action=${encodeURIComponent(name)}`, body);
}

function manilaToday() {
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

function refreshPrototypeSlots(slots) {
  const today = manilaToday();
  const availableDates = [
    ...new Set(
      slots
        .filter((slot) => slot.slot_status === "Available")
        .map((slot) => slot.slot_date)
        .filter((date) => date < today),
    ),
  ].sort();
  if (
    !availableDates.length ||
    slots.some(
      (slot) => slot.slot_status === "Available" && slot.slot_date >= today,
    )
  )
    return slots;

  const tomorrow = Date.parse(`${today}T00:00:00Z`) + 86400000;
  const offset = Math.round(
    (tomorrow - Date.parse(`${availableDates[0]}T00:00:00Z`)) / 86400000,
  );
  return slots.map((slot) => {
    if (slot.slot_status !== "Available") return slot;
    const date = new Date(
      Date.parse(`${slot.slot_date}T00:00:00Z`) + offset * 86400000,
    );
    return { ...slot, slot_date: date.toISOString().slice(0, 10) };
  });
}

async function load(resource) {
  const result = await request(`?resource=${encodeURIComponent(resource)}`);
  let rows = result.data;
  if (!Array.isArray(rows))
    throw new Error(`The ${resource} API response must contain an array.`);
  if (resource === "slots") rows = refreshPrototypeSlots(rows);
  return clone(rows);
}

async function save(resource, rows) {
  const response = await fetch(
    `${config.api_base}?resource=${encodeURIComponent(resource)}`,
    {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rows),
    },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || `Unable to save ${resource}.`);
  return clone(result.data);
}

function normalizeMobile(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.startsWith("63") ? `0${digits.slice(2)}` : digits;
}

export const api = {
  list: load,

  async loginDemo(role) {
    const result = await action("demo-login", { role });
    return result.user;
  },

  async get(resource, id, field = `${resource.slice(0, -1)}_id`) {
    return (await load(resource)).find((record) => record[field] === id);
  },

  async update(resource, id, changes, field = `${resource.slice(0, -1)}_id`) {
    const rows = await load(resource);
    const index = rows.findIndex((record) => record[field] === id);
    if (index < 0) throw new Error(`${resource} record "${id}" was not found.`);
    rows[index] = { ...rows[index], ...changes };
    await save(resource, rows);
    return clone(rows[index]);
  },

  async create(resource, record) {
    if (!record || typeof record !== "object")
      throw new Error(`A valid ${resource} record is required.`);
    const session = getSession();
    const ownedRecord = {
      ...record,
      ...(session?.user_id && !record.user_id ? { user_id: session.user_id } : {}),
      ...(session?.patient_id && !record.patient_id
        ? { patient_id: session.patient_id }
        : {}),
      ...(session?.clinic_id && !record.clinic_id
        ? { clinic_id: session.clinic_id }
        : {}),
    };
    const rows = await load(resource);
    const key = Object.keys(ownedRecord).find((field) => field.endsWith("_id"));
    if (key && rows.some((existing) => existing[key] === ownedRecord[key]))
      throw new Error(`${resource} record "${ownedRecord[key]}" already exists.`);
    const existingIds = new Set(key ? rows.map((existing) => existing[key]) : []);
    rows.push(ownedRecord);
    const savedRows = await save(resource, rows);
    return clone(
      (key && savedRows.find((saved) => !existingIds.has(saved[key]))) ||
        ownedRecord,
    );
  },

  async remove(resource, id, field = `${resource.slice(0, -1)}_id`) {
    const rows = await load(resource);
    const remaining = rows.filter((record) => record[field] !== id);
    if (remaining.length === rows.length)
      throw new Error(`${resource} record "${id}" was not found.`);
    return save(resource, remaining);
  },

  async accountIdentityInUse(email, mobile, excludeUserId = "", excludePatientId = "", excludeClinicId = "") {
    return action("identity-check", {
      email,
      mobile,
      exclude_user_id: excludeUserId,
      exclude_patient_id: excludePatientId,
      exclude_clinic_id: excludeClinicId,
    });
  },

  async registerClinicAccount(clinic, user, password) {
    return action("register-clinic", { clinic, user, password });
  },

  async registerPatientAccount(patient, user, password) {
    if (!patient || !user || user.role !== "Patient")
      throw new Error("Patient registration can only create Patient accounts.");
    if (
      !patient.patient_id ||
      !user.user_id ||
      patient.user_id !== user.user_id ||
      String(patient.email || "").trim().toLowerCase() !==
        String(user.email || "").trim().toLowerCase() ||
      normalizeMobile(patient.mobile_number) !== normalizeMobile(user.mobile_number)
    )
      throw new Error("The patient profile and account details do not match.");
    return action("register-patient", { patient, user, password });
  },

  async login(identifier, password) {
    try {
      return (await action("login", { identifier, password })).user;
    } catch (error) {
      if (error.message.includes("do not match")) return null;
      throw error;
    }
  },

  async currentUser() {
    return (await action("current-user", {})).user;
  },

  async beginPasswordReset(identifier) {
    const result = await action("begin-password-reset", { identifier });
    return result.accepted;
  },

  async updatePassword(password) {
    await action("update-password", { password });
  },

  async clinics({ verified = true } = {}) {
    const rows = await load("clinics");
    return verified
      ? rows.filter(
          (clinic) => clinic.verified && clinic.approval_status === "Approved",
        )
      : rows;
  },

  async publicFeedback(clinicId) {
    return (await load("feedback")).filter(
      (item) => item.clinic_id === clinicId,
    );
  },

  async notify(recipientId, message, type = "Appointment update", context = {}) {
    return this.create("notifications", {
      notification_id: `not_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      recipient_id: recipientId,
      notification_type: type,
      message,
      ...context,
      read: false,
      created_at: new Date().toISOString(),
    });
  },
};
