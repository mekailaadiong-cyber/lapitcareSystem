const observer = new IntersectionObserver(
  (entries) =>
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        if (entry.target.classList.contains("timeline"))
          entry.target.classList.add("draw");
        observer.unobserve(entry.target);
      }
    }),
  { threshold: 0.14 },
);
document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
const stats = document.querySelector(".stats-strip");
new IntersectionObserver(
  ([entry], obs) => {
    if (!entry.isIntersecting) return;
    document.querySelectorAll("[data-count]").forEach((el) => {
      const target = +el.dataset.count,
        start = performance.now();
      function tick(now) {
        const p = Math.min((now - start) / 1300, 1);
        el.textContent = Math.round(
          target * (1 - Math.pow(1 - p, 3)),
        ).toLocaleString();
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
    obs.disconnect();
  },
  { threshold: 0.3 },
).observe(stats);
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.addEventListener("pointermove", (e) => {
    const x = (e.clientX / innerWidth - 0.5) * 10,
      y = (e.clientY / innerHeight - 0.5) * 10;
    document
      .querySelectorAll(".float-card")
      .forEach(
        (el, i) =>
          (el.style.transform = `translate(${x * (i + 1) * 0.35}px,${y * (i + 1) * 0.35}px)`),
      );
  });
}
