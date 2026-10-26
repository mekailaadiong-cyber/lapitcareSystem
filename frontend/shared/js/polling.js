import { config } from "./config.js";
export function startPolling(callback) {
  callback();
  const id = setInterval(callback, config.poll_interval_ms);
  return () => clearInterval(id);
}
