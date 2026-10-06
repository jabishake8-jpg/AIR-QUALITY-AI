 (async () => {
  const { stations, categories, categoryFor, stationByCity, forecastAqi } = window.AirData;
  const authUser = await window.Auth.ready;
  const byId = (id) => document.getElementById(id);
  const citySelect = byId("forecast-city");
  const pointsLayer = byId("large-chart-points");
  let horizon = 6;

  for (const station of stations) {
    const option = document.createElement("option");
    option.value = station.city;
    option.textContent = station.city;
    citySelect.appendChild(option);
  }
  citySelect.value = stationByCity(authUser?.city || localStorage.getItem("air-india-city")).city;

  function formatHour(hour) {
    if (hour === 0) return "Now";
    const now = new Date();
    now.setHours(now.getHours() + hour);
    return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: true }).format(now);
  }

  function update() {
    const station = stationByCity(citySelect.value);
    const steps = horizon;
    const values = Array.from({ length: steps + 1 }, (_, hour) => forecastAqi(station, hour, horizon));
    const plotWidth = 900;
    const plotHeight = 240;
    const xAt = (index) => (index / steps) * plotWidth;
    const yAt = (value) => plotHeight - (Math.min(value, 500) / 500) * 220;
    const path = values.map((value, index) => `${index ? "L" : "M"}${xAt(index).toFixed(1)} ${yAt(value).toFixed(1)}`).join(" ");
    const area = `${path} L${plotWidth} ${plotHeight} L0 ${plotHeight} Z`;
    const category = categoryFor(station.aqi);
    const color = categories.find((item) => item.name === category).color;
    const peak = Math.max(...values);
    const low = Math.min(...values.slice(1));
    const peakHour = values.indexOf(peak);
    const lowHour = values.indexOf(low, 1);
    const change = values.at(-1) - values[0];

    byId("forecast-title").innerHTML = `${station.city} <span>through the next ${horizon} ${horizon === 1 ? "hour" : "hours"}</span>`;
    byId("forecast-current-value").textContent = station.aqi;
    byId("forecast-current-category").textContent = category;
    byId("forecast-current-value").style.color = color;
    byId("large-chart-line").setAttribute("d", path);
    byId("large-chart-area").setAttribute("d", area);
    byId("large-chart-line").style.stroke = color;
    byId("large-chart-area").style.fill = color;

    const labels = new Set([0, Math.round(steps / 3), Math.round((steps * 2) / 3), steps]);
    byId("large-chart-labels").replaceChildren();
    for (const index of [...labels]) {
      const label = document.createElement("span");
      label.textContent = formatHour(index);
      byId("large-chart-labels").appendChild(label);
    }

    pointsLayer.replaceChildren();
    values.forEach((value, index) => {
      if (index % Math.max(1, Math.floor(steps / 6)) !== 0 && index !== steps) return;
      const point = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      point.setAttribute("cx", xAt(index));
      point.setAttribute("cy", yAt(value));
      point.setAttribute("r", index === 0 ? "6" : "3.5");
      point.setAttribute("class", index === 0 ? "large-chart-point is-current" : "large-chart-point");
      point.style.fill = color;
      pointsLayer.appendChild(point);
    });

    byId("forecast-high").textContent = `${peak} AQI`;
    byId("forecast-high-time").textContent = formatHour(peakHour);
    byId("forecast-low").textContent = `${low} AQI`;
    byId("forecast-low-time").textContent = formatHour(lowHour);
    byId("forecast-direction").textContent = change > 4 ? "Rising" : change < -4 ? "Easing" : "Steady";
    byId("forecast-delta").textContent = `${change > 0 ? "+" : ""}${change} points by ${formatHour(horizon)}`;
    byId("forecast-guidance").textContent = change > 4
      ? `The air-quality forecast for ${station.city} rises toward ${peak} AQI. Consider moving strenuous outdoor plans earlier, around ${formatHour(lowHour)}.`
      : change < -4
        ? `The air-quality forecast for ${station.city} eases toward ${values.at(-1)} AQI. The cleaner window is around ${formatHour(lowHour)}.`
        : `The air-quality forecast for ${station.city} stays broadly steady. Check current conditions again before making outdoor plans.`;
    localStorage.setItem("air-india-city", station.city);
    if (window.Auth.user && window.Auth.user.city !== station.city) {
      void window.Auth.patchMe({ city: station.city }).catch((error) => {
        byId("forecast-guidance").textContent += ` Account sync failed: ${error.message}`;
      });
    }
  }

  document.querySelectorAll("[data-hours]").forEach((button) => {
    button.addEventListener("click", () => {
      horizon = Number(button.dataset.hours);
      document.querySelectorAll("[data-hours]").forEach((tab) => tab.setAttribute("aria-pressed", String(tab === button)));
      update();
    });
  });
  citySelect.addEventListener("change", update);
  update();
  window.addEventListener("airdata:updated", update);
})();