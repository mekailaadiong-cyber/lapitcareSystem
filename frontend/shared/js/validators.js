export const required = (value) =>
  String(value || "").trim() ? null : "This field is required.";
export const email = (value) =>
  /^\S+@\S+\.\S+$/.test(value) ? null : "Enter a valid email address.";
export const mobile = (value) =>
  /^(\+63|0)9\d{9}$/.test(value.replace(/\s/g, ""))
    ? null
    : "Enter a valid Philippine mobile number.";
export const password = (value) =>
  value.length >= 8 ? null : "Use at least 8 characters.";
export function validateForm(form) {
  let valid = true;
  form.querySelectorAll("[required]").forEach((el) => {
    if (!el.value && !el.checked) {
      el.setAttribute("aria-invalid", "true");
      valid = false;
    } else el.removeAttribute("aria-invalid");
  });
  return valid;
}
