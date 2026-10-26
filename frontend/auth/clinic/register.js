import { initClinicRegister } from "/shared/js/auth-app.js";
initClinicRegister().catch((error) => {
  console.error(error);
  document.body.textContent =
    "Clinic registration could not load. Refresh the page or try again later.";
});
