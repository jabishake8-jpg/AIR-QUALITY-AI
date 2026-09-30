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

  const canvas = document.createElement("canvas");
  canvas.className = "air-particle-layer";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  const context = canvas.getContext("2d", { alpha: true });
  const mobileQuery = window.matchMedia("(max-width: 768px)");
  const particles = [];
  let viewportWidth = 0;
  let viewportHeight = 0;
  let animationFrame = 0;
  let previousFrame = 0;
  const particleColors = ["45,212,191", "56,189,248", "139,92,246"];

  function resizeCanvas() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
    canvas.width = Math.round(viewportWidth * ratio);
    canvas.height = Math.round(viewportHeight * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    particles.length = 0;
    for (let index = 0; index < 20; index += 1) {
      particles.push({
        x: Math.random() * viewportWidth,
        y: Math.random() * viewportHeight,
        radius: 0.5 + Math.random() * 1.1,
        speed: 5 + Math.random() * 13,
        drift: 3 + Math.random() * 9,
        phase: Math.random() * Math.PI * 2,
        opacity: 0.14 + Math.random() * 0.24,
        color: particleColors[index % particleColors.length],
      });
    }
  }

  function drawParticles(timestamp) {
    animationFrame = 0;
    if (document.hidden || reducedMotion.matches || mobileQuery.matches || !context) return;
    const delta = previousFrame ? Math.min((timestamp - previousFrame) / 1000, 0.05) : 0;
    previousFrame = timestamp;
    context.clearRect(0, 0, viewportWidth, viewportHeight);
    for (const particle of particles) {
      particle.y -= particle.speed * delta;
      particle.x += Math.sin(timestamp / 4200 + particle.phase) * particle.drift * delta;
      if (particle.y < -4) {
        particle.y = viewportHeight + 4;
        particle.x = Math.random() * viewportWidth;
      }
      context.beginPath();
      context.fillStyle = `rgba(${particle.color},${particle.opacity})`;
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fill();
    }
    animationFrame = requestAnimationFrame(drawParticles);
  }

  function updateParticleMotion() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    previousFrame = 0;
    if (!document.hidden && !reducedMotion.matches && !mobileQuery.matches && context) animationFrame = requestAnimationFrame(drawParticles);
  }

  resizeCanvas();
  updateParticleMotion();
  window.addEventListener("resize", resizeCanvas, { passive: true });
  window.addEventListener("resize", updateParticleMotion, { passive: true });
  document.addEventListener("visibilitychange", updateParticleMotion);
  reducedMotion.addEventListener("change", updateParticleMotion);
  mobileQuery.addEventListener("change", updateParticleMotion);
})();
/* ==========================================================================
   Air cursor: glowing dot + trailing ring + drifting air puffs
   Desktop mouse only. Off on touch screens and when "reduce motion" is on.
   ========================================================================== */
(() => {
  const touchOnly = window.matchMedia("(hover: none) and (pointer: coarse)");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (touchOnly.matches) return;
  const showTrail = !reduceMotion.matches;
  const follow = showTrail ? 0.18 : 1;

  const root = document.documentElement;
  const dot = document.createElement("div");
  const ring = document.createElement("div");
  const canvas = document.createElement("canvas");
  dot.className = "air-cursor-dot";
  ring.className = "air-cursor-ring";
  canvas.className = "air-cursor-trail";
  [dot, ring, canvas].forEach((el) => el.setAttribute("aria-hidden", "true"));
  document.body.append(canvas, ring, dot);
  root.classList.add("air-cursor-on");

  const context = canvas.getContext("2d");
  const colors = ["45,212,191", "56,189,248", "139,92,246"];
  const puffs = [];
  const maxPuffs = 45;
  const interactive = "a, button, summary, label, [role='button'], .health-band-button, .activity-option, .hour-slot, .favorite-city, .search-result, input[type='range'], input[type='checkbox'], input[type='radio']";
  const native = "input:not([type='range']):not([type='checkbox']):not([type='radio']):not([type='submit']), textarea, select";

  let width = 0;
  let height = 0;
  let mouseX = -100;
  let mouseY = -100;
  let ringX = -100;
  let ringY = -100;
  let lastEmitX = -100;
  let lastEmitY = -100;
  let frame = 0;
  let lastTime = 0;
  let colorIndex = 0;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function addPuff(x, y, burst) {
    if (!showTrail) return;
    if (puffs.length >= maxPuffs) puffs.shift();
    const angle = burst ? Math.random() * Math.PI * 2 : -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
    const speed = burst ? 40 + Math.random() * 90 : 8 + Math.random() * 22;
    puffs.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: burst ? 2 + Math.random() * 3 : 3 + Math.random() * 6,
      life: 0,
      maxLife: burst ? 550 + Math.random() * 300 : 750 + Math.random() * 450,
      color: colors[colorIndex++ % colors.length],
    });
  }

  function start() {
    if (!frame) { lastTime = 0; frame = requestAnimationFrame(tick); }
  }

  function tick(time) {
    frame = 0;
    const delta = lastTime ? Math.min(time - lastTime, 50) : 16;
    lastTime = time;
    ringX += (mouseX - ringX) * follow;
    ringY += (mouseY - ringY) * follow;
    ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;

    context.clearRect(0, 0, width, height);
    for (let i = puffs.length - 1; i >= 0; i -= 1) {
      const puff = puffs[i];
      puff.life += delta;
      if (puff.life >= puff.maxLife) { puffs.splice(i, 1); continue; }
      const progress = puff.life / puff.maxLife;
      puff.x += puff.vx * (delta / 1000);
      puff.y += puff.vy * (delta / 1000);
      puff.vx *= 0.985;
      puff.vy *= 0.985;
      const alpha = (1 - progress) * 0.55;
      const size = puff.radius * (1 + progress * 1.6);
      context.beginPath();
      context.fillStyle = `rgba(${puff.color},${alpha * 0.35})`;
      context.arc(puff.x, puff.y, size * 2, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.fillStyle = `rgba(${puff.color},${alpha})`;
      context.arc(puff.x, puff.y, size, 0, Math.PI * 2);
      context.fill();
    }

    const ringSettled = Math.abs(mouseX - ringX) < 0.2 && Math.abs(mouseY - ringY) < 0.2;
    if (!ringSettled || puffs.length) frame = requestAnimationFrame(tick);
  }

  function show() { root.classList.add("air-cursor-visible"); }
  function hide() { root.classList.remove("air-cursor-visible"); }

  window.addEventListener("mousemove", (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;
    if (!root.classList.contains("air-cursor-visible")) {
      ringX = mouseX;
      ringY = mouseY;
      lastEmitX = mouseX;
      lastEmitY = mouseY;
      show();
    }
    if (Math.hypot(mouseX - lastEmitX, mouseY - lastEmitY) > 16) {
      addPuff(mouseX, mouseY, false);
      lastEmitX = mouseX;
      lastEmitY = mouseY;
    }
    start();
  }, { passive: true });

  document.addEventListener("mouseover", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    ring.classList.toggle("is-hover", Boolean(target && target.closest(interactive)));
    root.classList.toggle("air-cursor-native", Boolean(target && target.closest(native)));
  }, { passive: true });

  document.addEventListener("mousedown", () => {
    ring.classList.add("is-down");
    for (let i = 0; i < 10; i += 1) addPuff(mouseX, mouseY, true);
    start();
  });
  document.addEventListener("mouseup", () => ring.classList.remove("is-down"));
  document.documentElement.addEventListener("mouseleave", hide);
  document.documentElement.addEventListener("mouseenter", show);
  window.addEventListener("blur", hide);
  document.addEventListener("visibilitychange", () => { if (document.hidden) hide(); });
  window.addEventListener("resize", resize, { passive: true });
  resize();
})();