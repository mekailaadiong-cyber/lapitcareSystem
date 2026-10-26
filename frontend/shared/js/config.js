const scriptUrl = new URL(import.meta.url);
const appBase = scriptUrl.pathname.replace(/shared\/js\/config\.js$/, "");

export const appPath = (path) =>
  `${appBase}${String(path).replace(/^\/+/, "")}`;
export const config = {
  app_name: "LapitCare",
  app_base: appBase,
  api_base: new URL("../../../backend/api.php", scriptUrl).pathname,
  map_center: [7.8257, 123.437],
  map_zoom: 13,
  poll_interval_ms: 12000,
  session_timeout_ms: 1800000,
  storage_prefix: "lapitcare_",
  data_base: appPath("/data/"),
};
