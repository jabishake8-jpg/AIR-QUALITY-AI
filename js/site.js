(() => {
  const clock = document.getElementById("clock");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function updateClock() {
    if (!clock) return;
    clock.textContent = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date()) + " IST";
  }

  if (clock) {
    updateClock();
    window.setInterval(updateClock, 60000);
  }

  const navToggle = document.querySelector(".nav-toggle");
  const topbar = document.querySelector(".topbar");
  if (navToggle && topbar) {
    navToggle.addEventListener("click", () => {
      const expanded = navToggle.getAttribute("aria-expanded") === "true";
      navToggle.setAttribute("aria-expanded", String(!expanded));
      navToggle.setAttribute("aria-label", expanded ? "Open navigation" : "Close navigation");
      topbar.classList.toggle("nav-open", !expanded);
    });
    document.querySelectorAll(".primary-nav a").forEach((link) => {
      link.addEventListener("click", () => {
        navToggle.setAttribute("aria-expanded", "false");
        navToggle.setAttribute("aria-label", "Open navigation");
        topbar.classList.remove("nav-open");
      });
    });
  }

  document.body.classList.add("page-enter", "is-air-loading");
  requestAnimationFrame(() => document.body.classList.add("page-ready"));
  window.addEventListener("airdata:updated", (event) => {
    document.body.classList.toggle("is-air-loading", event.detail?.status === "loading");
  });

  if (!reducedMotion.matches && "IntersectionObserver" in window) {
    const revealTargets = new Set(document.querySelectorAll(
      ".page-shell > section, .page-heading, .content-grid > section, .insights-grid > article, .auth-layout, .account-layout",
    ));
    let revealIndex = 0;
    const observer = new IntersectionObserver((entries, currentObserver) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        entry.target.querySelectorAll(".forecast-line, .large-chart-line").forEach((line) => {
          try {
            const length = line.getTotalLength();
            line.style.strokeDasharray = String(length);
            line.style.strokeDashoffset = String(length);
            line.classList.add("chart-draw-target");
            requestAnimationFrame(() => { line.style.strokeDashoffset = "0"; });
          } catch {}
        });
        currentObserver.unobserve(entry.target);
      }
    }, { threshold: 0.12 });

    for (const element of revealTargets) {
      element.classList.add("reveal");
      element.style.setProperty("--reveal-delay", `${(revealIndex % 4) * 90}ms`);
      revealIndex += 1;
      observer.observe(element);
    }
  }

})();

/* Cursor and background effects are intentionally kept minimal for a calmer professional look. */
