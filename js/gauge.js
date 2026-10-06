(() => {
  const categories = {
    Good: { level: "good", particles: 1 },
    Moderate: { level: "moderate", particles: 3 },
    "Unhealthy for Sensitive Groups": { level: "sensitive", particles: 5 },
    Unhealthy: { level: "unhealthy", particles: 7 },
    "Very Unhealthy": { level: "very-unhealthy", particles: 10 },
    Hazardous: { level: "hazardous", particles: 12 },
    "No data": { level: "no-data", particles: 0 },
  };

  function categoryFor(aqi) {
    if (!Number.isFinite(aqi)) return "No data";
    if (aqi <= 50) return "Good";
    if (aqi <= 100) return "Moderate";
    if (aqi <= 150) return "Unhealthy for Sensitive Groups";
    if (aqi <= 200) return "Unhealthy";
    if (aqi <= 300) return "Very Unhealthy";
    return "Hazardous";
  }

  function animateValue(view, target) {
    cancelAnimationFrame(view.animationFrame);
    const startValue = view.lastAqi ?? 0;
    view.lastAqi = target;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || startValue === target) {
      view.value.textContent = String(target);
      return;
    }
    let startedAt;
    const duration = 1400;
    function step(timestamp) {
      if (startedAt === undefined) startedAt = timestamp;
      const progress = Math.min(1, (timestamp - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 4;
      view.value.textContent = String(Math.round(startValue + (target - startValue) * eased));
      if (progress < 1) view.animationFrame = requestAnimationFrame(step);
      else view.value.textContent = String(target);
    }
    view.animationFrame = requestAnimationFrame(step);
  }

  function createGauge(el) {
    el.classList.add("aqi-gauge");
    el.innerHTML = `
      <div class="gauge__visual" aria-hidden="true">
        <svg class="gauge__city" viewBox="0 0 480 250" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="gauge-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#102f3b" />
              <stop offset="1" stop-color="#111c35" />
            </linearGradient>
            <linearGradient id="gauge-haze" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="#2dd4bf" stop-opacity="0" />
              <stop offset="0.5" stop-color="#38bdf8" stop-opacity="0.75" />
              <stop offset="1" stop-color="#8b5cf6" stop-opacity="0" />
            </linearGradient>
          </defs>
          <rect class="gauge__sky" width="480" height="250" />
          <circle class="gauge__sun" cx="388" cy="58" r="25" />
          <path class="gauge__distant" d="M0 166 58 115l36 31 48-67 53 66 37-39 57 60 54-52 52 41 39-30 46 37v98H0Z" />
          <g class="gauge__buildings">
            <path class="gauge__building" d="M0 159h49v-36h38v-24h45v62h30v-47h37v-30h54v77h25v-27h42v-55h47v82h31v-38h39v-23h43v146H0Z" />
            <path class="gauge__windows" d="M57 136h9v10h-9zm20 0h9v10h-9zm56 4h9v10h-9zm60-8h9v10h-9zm18 0h9v10h-9zm34-25h9v10h-9zm19 0h9v10h-9zm-53 48h9v10h-9zm63-1h9v10h-9zm57-23h9v10h-9zm18 0h9v10h-9zm29 21h9v10h-9zm48-15h9v10h-9zm18 0h9v10h-9z" />
          </g>
          <path class="gauge__ground" d="M0 210q85-15 171 0t169 0 140 0v40H0Z" />
          <rect class="gauge__atmosphere" width="480" height="250" />
          <path class="gauge__fog" d="M0 171q85-17 161 0t160 0 159 0v55q-95-12-170 0t-155 0-155 0Z" />
          <path class="gauge__mist" d="M-20 188q70-12 140 0t140 0 140 0 100 0v18q-70 12-140 0t-140 0-140 0-100 0Z" />
        </svg>
        <div class="gauge__particles"></div>
      </div>
      <div class="gauge__reading" role="status" aria-live="polite" aria-atomic="true">
        <div class="gauge__measure">
          <span class="gauge__label">Air Quality Index</span>
          <strong class="gauge__value">--</strong>
        </div>
        <span class="gauge__category">No data</span>
      </div>
      <p class="gauge__location"></p>
    `;

    const particleLayer = el.querySelector(".gauge__particles");
    for (let index = 0; index < 12; index += 1) {
      const particle = document.createElement("span");
      particle.className = "gauge__particle";
      particleLayer.appendChild(particle);
    }

    return {
      visual: el.querySelector(".gauge__visual"),
      value: el.querySelector(".gauge__value"),
      category: el.querySelector(".gauge__category"),
      location: el.querySelector(".gauge__location"),
      particles: particleLayer.children,
      animationFrame: 0,
      lastAqi: null,
      entered: false,
    };
  }

  window.Gauge = {
    render(data = {}) {
      const el = document.getElementById("gauge");
      if (!el) return;

      let view = el._gaugeView;
      if (!view) {
        view = createGauge(el);
        el._gaugeView = view;
      }
      if (!view.entered) {
        view.visual.classList.add("is-entered");
        view.entered = true;
      }

      const rawAqi = Number(data.aqi);
      const hasAqi = data.aqi !== null && data.aqi !== "" && Number.isFinite(rawAqi);
      const aqi = hasAqi ? Math.max(0, Math.min(500, rawAqi)) : null;
      const category = categories[data.category] ? data.category : categoryFor(aqi);
      const appearance = categories[category];

      el.dataset.level = appearance.level;
      if (aqi === null) {
        cancelAnimationFrame(view.animationFrame);
        view.lastAqi = null;
        view.value.textContent = "--";
      } else {
        animateValue(view, Math.round(aqi));
      }
      view.category.textContent = category;
      view.location.textContent = typeof data.city === "string" ? data.city : "";

      for (let index = 0; index < view.particles.length; index += 1) {
        view.particles[index].classList.toggle("is-active", index < appearance.particles);
      }

      el.setAttribute(
        "aria-label",
        aqi === null ? `Air quality: ${category}` : `Air quality index ${Math.round(aqi)}, ${category}`,
      );
    },
  };
})();