export function canBook(clinic, staff, appointments, slot, patientId) {
  if (!clinic || clinic.clinic_status === "Closed")
    return {
      ok: false,
      message: "Booking is unavailable while this clinic is closed.",
    };
  if (!staff || staff.duty_status !== "On Duty")
    return {
      ok: false,
      message: "This staff member is not currently on duty.",
    };
  if (!slot || slot.slot_status !== "Available")
    return { ok: false, message: "That schedule is no longer available." };
  if (
    new Date(
      `${slot.slot_date}T${slot.start_time.length === 5 ? `${slot.start_time}:00` : slot.start_time}+08:00`,
    ).getTime() <= Date.now()
  )
    return {
      ok: false,
      message: "Appointments cannot be booked for a past time.",
    };
  if (
    appointments.some(
      (appointment) =>
        appointment.slot_id === slot.slot_id &&
        appointment.appointment_status !== "Cancelled",
    )
  ) {
    return {
      ok: false,
      message: "That slot was just taken. Please choose another.",
    };
  }
  if (
    appointments.some(
      (appointment) =>
        appointment.patient_id === patientId &&
        appointment.slot_id === slot.slot_id,
    )
  ) {
    return { ok: false, message: "You already booked this slot." };
  }
  return { ok: true };
}

export function canModify(appointment, clinic) {
  if (!appointment || !clinic) return false;
  const time = appointment.appointment_time;
  const start = new Date(
    `${appointment.appointment_date}T${time.length === 5 ? `${time}:00` : time}+08:00`,
  );
  if (Number.isNaN(start.getTime())) return false;
  const hours = (start.getTime() - Date.now()) / 3_600_000;
  let configuredWindow;
  try {
    const settings = JSON.parse(localStorage.getItem("lapitcare_admin_settings") || "{}");
    if (Number.isFinite(Number(settings.cancellationWindow))) configuredWindow = Number(settings.cancellationWindow);
  } catch {
    configuredWindow = undefined;
  }
  return hours >= (configuredWindow ?? clinic.cancellation_window_hours ?? 12);
}

export function canLeaveFeedback(appointment) {
  return appointment?.appointment_status === "Completed";
}
