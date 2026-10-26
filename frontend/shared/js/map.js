let leafletPromise;

export function loadLeaflet() {
  if (leafletPromise) return leafletPromise;

  const cssUrl = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  const scriptUrl = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
  const loadStyles = () => {
    const existing = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .find((link) => link.href === cssUrl);
    if (existing?.dataset.loaded === "true" || (existing?.sheet && !existing.dataset.loading))
      return Promise.resolve();
    const css = existing || document.createElement("link");
    css.rel = "stylesheet";
    css.href = cssUrl;
    css.dataset.loading = "true";
    return new Promise((resolve, reject) => {
      css.addEventListener("load", () => {
        css.dataset.loaded = "true";
        delete css.dataset.loading;
        resolve();
      }, { once: true });
      css.addEventListener("error", () => reject(new Error("Leaflet map styles could not be loaded.")), { once: true });
      if (!existing) document.head.append(css);
    });
  };
  const loadScript = () => {
    if (window.L) return Promise.resolve(window.L);
    const existing = [...document.querySelectorAll("script[src]")]
      .find((script) => script.src === scriptUrl);
    if (existing?.dataset.loaded === "true") return Promise.resolve(window.L);
    const script = existing || document.createElement("script");
    script.src = scriptUrl;
    return new Promise((resolve, reject) => {
      script.addEventListener("load", () => {
        script.dataset.loaded = "true";
        if (window.L) resolve(window.L);
        else reject(new Error("Leaflet map library did not initialize."));
      }, { once: true });
      script.addEventListener("error", () => reject(new Error("Leaflet map library could not be loaded.")), { once: true });
      if (!existing) document.head.append(script);
    });
  };

  leafletPromise = Promise.all([loadStyles(), loadScript()])
    .then(([, leaflet]) => leaflet)
    .catch((error) => {
      leafletPromise = null;
      throw error;
    });
  return leafletPromise;
}
