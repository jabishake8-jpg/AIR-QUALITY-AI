 (async () => {
  const { stations, categories, profiles, guidance, categoryFor, stationByCity, forecastAqi } = window.AirData;
  const authUser = await window.Auth.ready;
  const byId = (id) => document.getElementById(id);
  const citySelect = byId("planner-city");
  const profileSelect = byId("planner-profile");
  const slotsElement = byId("hourly-slots");
  const activitySettings = {
    walk: { name: "Walk", effort: "EASY EFFORT", factor: 0.7 },
    run: { name: "Run", effort: "HIGH EFFORT", factor: 1.7 },
    cycle: { name: "Cycle", effort: "MODERATE EFFORT", factor: 1.15 },
    play: { name: "Outdoor play", effort: "VARIABLE EFFORT", factor: 1.3 },
  };
  let activity = "walk";
  let selectedHour = 0;
  let hourlyValues = [];

  for (const station of stations) {
    const option = document.createElement("option");
    option.value = station.city;
    option.textContent = station.city;
    citySelect.appendChild(option);
  }
  for (const profile of profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.label;
    profileSelect.appendChild(option);
  }

  citySelect.value = stationByCity(authUser?.city || localStorage.getItem("air-india-city")).city;
  const storedProfile = authUser?.profile || localStorage.getItem("air-india-profile") || "general";
  profileSelect.value = profiles.some((profile) => profile.id === storedProfile) ? storedProfile : "general";

  function hourLabel(offset) {
    const date = new Date();
    date.setHours(date.getHours() + offset);
    return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: true }).format(date);
  }

  function categoryColor(aqi) {
    return categories.find((category) => category.name === categoryFor(aqi))?.color || "#75817a";
  }

  function getBestWindow(values, station) {
    let bestStart = 0;
    let bestAverage = Infinity;
    for (let index = 0; index < 24; index += 1) {
      const nextValue = index === 23 ? forecastAqi(station, 24, 24) : values[index + 1];
      const average = (values[index] + nextValue) / 2;
      if (average < bestAverage) {
        bestAverage = average;
        bestStart = index;
      }
    }
    return { start: bestStart, aqi: Math.round(bestAverage) };
  }

  function renderSlots() {
    slotsElement.replaceChildren();
    const best = getBestWindow(hourlyValues, stationByCity(citySelect.value));
    hourlyValues.forEach((aqi, hour) => {
      const slot = document.createElement("button");
      slot.type = "button";
      slot.className = "hour-slot";
      slot.dataset.hour = String(hour);
      slot.setAttribute("aria-pressed", String(hour === selectedHour));
      slot.setAttribute("aria-label", `${hourLabel(hour)}, AQI ${aqi}, ${categoryFor(aqi)}${hour === best.start ? ", part of cleaner two-hour window" : ""}`);
      slot.style.setProperty("--slot-color", categoryColor(aqi));
      slot.style.setProperty("--slot-height", `${Math.max(13, Math.round((aqi / 500) * 100))}%`);
      if (hour === best.start || (best.start < 23 && hour === best.start + 1)) slot.classList.add("is-clean-window");

      const bar = document.createElement("span");
      bar.className = "hour-slot-bar";
      const time = document.createElement("span");
      time.className = "hour-slot-time";
      time.textContent = hourLabel(hour);
      const value = document.createElement("strong");
      value.className = "hour-slot-value";
      value.textContent = String(aqi);
      slot.append(bar, time, value);
      slot.addEventListener("click", () => {
        selectedHour = hour;
        renderSlots();
        renderPlan();
      });
      slotsElement.appendChild(slot);
    });
  }

  function renderPlan() {
    const station = stationByCity(citySelect.value);
    const profile = profileSelect.value;
    const activityInfo = activitySettings[activity];
    const duration = Number(byId("activity-duration").value);
    const best = getBestWindow(hourlyValues, station);
    const firstTime = hourLabel(best.start);
    const secondTime = hourLabel(best.start + 2);
    const selectedAqi = hourlyValues[selectedHour];
    const selectedCategory = categoryFor(selectedAqi);
    const difference = station.aqi - best.aqi;
    const relativeLoad = Math.round((selectedAqi / 50) * (duration / 30) * activityInfo.factor);

    byId("plan-city-label").textContent = `${station.city.toLocaleUpperCase()} · NEXT 24H`;
    byId("best-window").textContent = `${firstTime} – ${secondTime}`;
    byId("best-window-detail").textContent = `Best forecast 2-hour window for ${activityInfo.name.toLocaleLowerCase()}`;
    byId("best-window-aqi").textContent = String(best.aqi);
    byId("best-window-category").textContent = categoryFor(best.aqi);
    byId("best-window-category").style.color = categoryColor(best.aqi);
    byId("plan-improvement").textContent = difference > 0 ? `−${difference} AQI` : difference < 0 ? `+${Math.abs(difference)} AQI` : "No change";
    byId("plan-status").textContent = difference > 0 ? "cleaner than right now" : difference < 0 ? "similar conditions expected" : "same as current air";
    byId("plan-guidance").textContent = `${hourLabel(selectedHour)} · AQI ${selectedAqi} (${selectedCategory}). ${guidance[profile][selectedCategory]} Relative outdoor load for ${duration} minutes of ${activityInfo.name.toLocaleLowerCase()}: ${relativeLoad} (illustrative index).`;
    byId("activity-effort-label").textContent = activityInfo.effort;
    byId("duration-output").textContent = String(duration);
    localStorage.setItem("air-india-city", station.city);
    localStorage.setItem("air-india-profile", profile);
  }

  function update() {
    const station = stationByCity(citySelect.value);
    hourlyValues = Array.from({ length: 24 }, (_, hour) => forecastAqi(station, hour, 24));
    selectedHour = 0;
    renderSlots();
    renderPlan();
  }

  document.querySelectorAll("[data-activity]").forEach((button) => {
    button.addEventListener("click", () => {
      activity = button.dataset.activity;
      document.querySelectorAll("[data-activity]").forEach((option) => option.setAttribute("aria-pressed", String(option === button)));
      renderPlan();
    });
  });
  citySelect.addEventListener("change", () => {
    update();
    if (window.Auth.user && window.Auth.user.city !== citySelect.value) {
      void window.Auth.patchMe({ city: citySelect.value }).catch((error) => {
        byId("plan-guidance").textContent = `Could not sync account city: ${error.message}`;
      });
    }
  });
  profileSelect.addEventListener("change", () => {
    localStorage.setItem("air-india-profile", profileSelect.value);
    if (window.Auth.user && window.Auth.user.profile !== profileSelect.value) {
      void window.Auth.patchMe({ profile: profileSelect.value }).catch((error) => {
        byId("plan-guidance").textContent = `Could not sync account profile: ${error.message}`;
      });
    }
    renderPlan();
  });
  byId("activity-duration").addEventListener("input", renderPlan);
  update();
  window.addEventListener("airdata:updated", update);
})();