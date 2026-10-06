 (async () => {
  const { stations, categories, categoryFor, guidance } = window.AirData;
  const authUser = await window.Auth.ready;
  const categoryColors = Object.fromEntries(categories.map(({ name, color }) => [name, color]));

  const els = {
    searchForm: document.getElementById("search-form"),
    searchInput: document.getElementById("search-input"),
    searchButton: document.getElementById("search-btn"),
    results: document.getElementById("results-list"),
    locateButton: document.getElementById("locate-btn"),
    profile: document.getElementById("profile-select"),
    age: document.getElementById("age-select"),
    ageValue: document.getElementById("age-value"),
    favoriteToggle: document.getElementById("favorite-toggle"),
    favoriteCities: document.getElementById("favorite-cities"),
    savedCount: document.getElementById("saved-count"),
    shareButton: document.getElementById("share-reading"),
    shareStatus: document.getElementById("share-status"),
    selectedCity: document.getElementById("selected-city"),
    mapCaption: document.getElementById("map-caption-text"),
    updatedAt: document.getElementById("updated-at"),
    pm25: document.getElementById("pm25-value"),
    sourceStatus: document.getElementById("source-status"),
    sourceDetail: document.getElementById("source-detail"),
    temp: document.getElementById("temp-value"),
    humidity: document.getElementById("humidity-value"),
    wind: document.getElementById("wind-value"),
    riskMessage: document.getElementById("risk-message"),
    riskMark: document.getElementById("risk-mark"),
    trendBadge: document.getElementById("trend-badge"),
    forecastMessage: document.getElementById("forecast-message"),
    forecastArea: document.getElementById("forecast-area"),
    forecastLine: document.getElementById("forecast-line"),
    forecastPoint: document.getElementById("forecast-point"),
    clock: document.getElementById("clock"),
    map: document.getElementById("map"),
  };

  let selected = window.AirData.stationByCity(authUser?.city || localStorage.getItem("air-india-city"));
  let map;
  let mapCaptionOverride = null;
  const markers = new Map();
  let favorites = readFavorites();

  function readFavorites() {
    try {
      const stored = JSON.parse(localStorage.getItem("air-india-favorites") || "[]");
      return [...new Set(stored.filter((city) => stations.some((station) => station.city === city)))].slice(0, 5);
    } catch {
      return [];
    }
  }

  function saveFavorites() {
    localStorage.setItem("air-india-favorites", JSON.stringify(favorites));
    renderFavorites();
  }

  async function syncAccountPreference(change) {
    if (!window.Auth.user) return;
    try {
      await window.Auth.patchMe(change);
    } catch (error) {
      els.shareStatus.textContent = `Could not save account preference: ${error.message}`;
    }
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    if (!copied) throw new Error("Clipboard copy was not available");
  }

  function renderFavorites() {
    const saved = favorites.includes(selected.city);
    els.favoriteToggle.setAttribute("aria-pressed", String(saved));
    els.favoriteToggle.setAttribute("aria-label", `${saved ? "Remove" : "Save"} ${selected.city} ${saved ? "from" : "to"} saved places`);
    els.favoriteToggle.title = saved ? "Remove saved city" : "Save this city";
    els.favoriteToggle.textContent = saved ? "★" : "☆";
    els.favoriteCities.replaceChildren();
    els.savedCount.textContent = `${favorites.length} / 5`;

    if (!favorites.length) {
      const empty = document.createElement("span");
      empty.className = "saved-empty";
      empty.textContent = "Save a city with ☆ to keep it close.";
      els.favoriteCities.appendChild(empty);
      return;
    }

    for (const city of favorites) {
      const station = window.AirData.stationByCity(city);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "favorite-city";
      button.setAttribute("aria-current", String(city === selected.city));
      const name = document.createElement("span");
      name.textContent = station.city;
      const value = document.createElement("strong");
      value.textContent = String(station.aqi);
      button.append(name, value);
      button.addEventListener("click", () => chooseStation(station));
      els.favoriteCities.appendChild(button);
    }
  }

  const storedAge = localStorage.getItem("air-india-age");
  const savedAge = Number(storedAge);
  const savedProfile = authUser?.profile || localStorage.getItem("air-india-profile");

  if (storedAge !== null && Number.isInteger(savedAge) && savedAge >= 0 && savedAge <= 100) {
    els.age.value = String(savedAge);
    const derivedFromAge = window.HealthProfile?.deriveProfileFromAge(savedAge) || "general";
    const defaultProfile = savedProfile && [...els.profile.options].some((option) => option.value === savedProfile) ? savedProfile : derivedFromAge;
    els.profile.value = defaultProfile;
    localStorage.setItem("air-india-profile", defaultProfile);
  } else if (savedProfile && [...els.profile.options].some((option) => option.value === savedProfile)) {
    els.profile.value = savedProfile;
    els.age.value = String(window.HealthProfile?.deriveAgeFromProfile(savedProfile) || 35);
    localStorage.setItem("air-india-age", els.age.value);
  } else {
    const defaultProfile = window.HealthProfile?.deriveProfileFromAge(Number(els.age.value)) || "general";
    els.profile.value = defaultProfile;
    localStorage.setItem("air-india-profile", defaultProfile);
  }

  els.ageValue.value = `${els.age.value} years`;
  els.age.setAttribute("aria-valuetext", `${els.age.value} years old`);

  function readingFor(station) {
    const aqi = Math.max(0, Math.min(500, Math.round(station.aqi)));
    return {
      aqi,
      pm25: station.pm25,
      city: `${station.station} area, ${station.city}`,
      timestamp: new Date().toISOString(),
      category: categoryFor(aqi),
      weather: station.weather,
    };
  }

  function updateClock() {
    els.clock.textContent = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date()) + " IST";
  }

  function riskMessage(aqi, profile) {
    const category = categoryFor(aqi);
    return guidance[profile]?.[category] || guidance.general[category];
  }

  function forecastValues() {
    const offsets = [0, 0.24, 0.12, 0.48, 0.34, 0.72, 0.56, 1];
    return offsets.map((amount, index) => {
      const wave = index % 2 === 0 ? -0.06 : 0.06;
      return Math.max(8, Math.min(500, selected.aqi + selected.trend * amount + selected.trend * wave));
    });
  }

  function updateForecast() {
    const values = forecastValues();
    const width = 600;
    const height = 140;
    const xFor = (index) => (index / (values.length - 1)) * width;
    const yFor = (value) => height - (Math.min(value, 300) / 300) * 112;
    const path = values.map((value, index) => `${index ? "L" : "M"}${xFor(index).toFixed(1)} ${yFor(value).toFixed(1)}`).join(" ");
    const area = `${path} L${width} ${height} L0 ${height} Z`;
    const category = categoryFor(selected.aqi);
    const color = categoryColors[category];
    const change = Math.round(values.at(-1) - selected.aqi);

    els.forecastLine.setAttribute("d", path);
    els.forecastArea.setAttribute("d", area);
    els.forecastLine.style.stroke = color;
    els.forecastPoint.setAttribute("cx", xFor(0));
    els.forecastPoint.setAttribute("cy", yFor(values[0]));
    els.forecastPoint.style.fill = color;
    els.forecastArea.style.fill = color;
    els.trendBadge.textContent = change > 4 ? `↑ ${change} AQI` : change < -4 ? `↓ ${Math.abs(change)} AQI` : "→ Steady";
    els.trendBadge.dataset.direction = change > 4 ? "up" : change < -4 ? "down" : "steady";
    els.forecastMessage.textContent = change > 4
      ? `Likely to rise over the next 6 hours in ${selected.city}.`
      : change < -4
        ? `Likely to ease over the next 6 hours in ${selected.city}.`
        : `Expected to stay broadly steady in ${selected.city}.`;
  }

  function render() {
    const data = readingFor(selected);
    els.mapCaption.textContent = mapCaptionOverride || (window.AirData.status === "loading"
      ? "Loading current model estimates"
      : selected.isLive ? "CAMS global model estimate · ~45 km grid" : "Model feed unavailable · sample values shown");
    els.selectedCity.textContent = selected.city;
    els.pm25.textContent = data.pm25;
    els.sourceStatus.textContent = selected.isLive ? "MODEL ESTIMATE" : "SAMPLE FALLBACK";
    els.sourceStatus.dataset.status = selected.isLive ? "current" : "fallback";
    els.sourceDetail.textContent = selected.isLive
      ? "CAMS global model via Open-Meteo · ~45 km grid"
      : "Model feed unavailable. Sample AQI values are shown.";
    els.temp.textContent = data.weather.temp ?? "--";
    els.humidity.textContent = data.weather.humidity ?? "--";
    els.wind.textContent = data.weather.wind ?? "--";
    els.updatedAt.textContent = `${selected.isLive ? "Current model estimate" : "Sample fallback"} · ${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date())} IST`;
    els.riskMessage.textContent = riskMessage(data.aqi, els.profile.value);
    els.riskMark.textContent = data.aqi <= 100 ? "✓" : data.aqi <= 200 ? "!" : "×";
    els.riskMark.dataset.level = data.aqi <= 50 ? "good" : data.aqi <= 100 ? "moderate" : data.aqi <= 150 ? "sensitive" : data.aqi <= 200 ? "unhealthy" : "hazardous";
    window.Gauge.render(data);
    updateForecast();
    renderFavorites();

    for (const station of stations) {
      const marker = markers.get(station.city);
      if (marker) {
        const active = station === selected;
        marker.setStyle({
          color: categoryColors[categoryFor(station.aqi)],
          fillColor: categoryColors[categoryFor(station.aqi)],
          radius: active ? 10 : 7,
          weight: active ? 3 : 2,
        });
        marker.setTooltipContent(`${station.city} · AQI ${station.aqi}${station.isLive ? " · Model estimate" : " · Sample"}`);
        if (active) marker.bringToFront();
      }
    }
  }

  function chooseStation(station, caption) {
    if (!station) return;
    selected = station;
    mapCaptionOverride = caption || null;
    localStorage.setItem("air-india-city", station.city);
    void syncAccountPreference({ city: station.city });
    els.searchInput.value = "";
    hideResults();
    render();
    if (map) map.flyTo([station.lat, station.lon], Math.max(map.getZoom(), 6), { duration: 0.65 });
  }

  function hideResults() {
    els.results.hidden = true;
    els.results.replaceChildren();
    els.searchInput.setAttribute("aria-expanded", "false");
  }

  function showResults(query) {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) {
      hideResults();
      return;
    }
    const matches = stations.filter((station) => `${station.city} ${station.station}`.toLocaleLowerCase().includes(normalized));
    els.results.replaceChildren();
    for (const station of matches) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "search-result";
      option.setAttribute("role", "option");
      const city = document.createElement("strong");
      city.textContent = station.city;
      const place = document.createElement("span");
      place.textContent = station.station;
      const value = document.createElement("b");
      value.textContent = String(station.aqi);
      option.append(city, place, value);
      option.addEventListener("click", () => chooseStation(station));
      els.results.appendChild(option);
    }
    if (!matches.length) {
      const empty = document.createElement("p");
      empty.className = "search-empty";
      empty.textContent = "No locations match that search.";
      els.results.appendChild(empty);
    }
    els.results.hidden = false;
    els.searchInput.setAttribute("aria-expanded", "true");
  }

  function nearestStation(lat, lon) {
    return stations.reduce((nearest, station) => {
      const distance = Math.hypot((station.lat - lat) * Math.cos((lat * Math.PI) / 180), station.lon - lon);
      return distance < nearest.distance ? { station, distance } : nearest;
    }, { station: stations[0], distance: Infinity }).station;
  }

  function initializeMap() {
    if (!window.L || !els.map) {
      els.map.classList.add("map-unavailable");
      els.map.textContent = "Map unavailable. Search for a city area instead.";
      return;
    }
    map = window.L.map(els.map, { scrollWheelZoom: false, zoomControl: true });
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    map.fitBounds(stations.map((station) => [station.lat, station.lon]), { padding: [24, 24], maxZoom: 5 });

    for (const station of stations) {
      const color = categoryColors[categoryFor(station.aqi)];
      const marker = window.L.circleMarker([station.lat, station.lon], {
        radius: station === selected ? 10 : 7,
        color,
        fillColor: color,
        fillOpacity: 0.92,
        weight: station === selected ? 3 : 2,
      }).addTo(map);
      marker.bindTooltip(`${station.city} · AQI ${station.aqi}`, { direction: "top", offset: [0, -8] });
      marker.on("click", () => chooseStation(station));
      markers.set(station.city, marker);
    }

    map.on("click", (event) => {
      const station = nearestStation(event.latlng.lat, event.latlng.lng);
      chooseStation(station, `Nearest model grid · ${station.station} area`);
    });
    window.setTimeout(() => map.invalidateSize(), 0);
  }

  els.searchInput.addEventListener("input", () => showResults(els.searchInput.value));
  els.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = els.searchInput.value.trim().toLocaleLowerCase();
    const match = stations.find((station) => `${station.city} ${station.station}`.toLocaleLowerCase().includes(query));
    if (match) chooseStation(match);
    else showResults(els.searchInput.value);
  });
  els.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideResults();
  });
  document.addEventListener("click", (event) => {
    if (!els.searchForm.contains(event.target)) hideResults();
  });
  els.profile.addEventListener("change", () => {
    const age = window.HealthProfile?.deriveAgeFromProfile(els.profile.value) || 35;
    els.age.value = String(age);
    localStorage.setItem("air-india-age", els.age.value);
    localStorage.setItem("air-india-profile", els.profile.value);
    els.ageValue.value = `${els.age.value} years`;
    els.age.setAttribute("aria-valuetext", `${els.age.value} years old`);
    void syncAccountPreference({ profile: els.profile.value, age: Number(els.age.value) });
    render();
  });
  els.age.addEventListener("input", () => {
    const age = Number(els.age.value);
    const ageProfile = window.HealthProfile?.deriveProfileFromAge(age) || "general";
    els.profile.value = ageProfile;
    localStorage.setItem("air-india-profile", ageProfile);
    void syncAccountPreference({ profile: ageProfile, age });
    els.ageValue.value = `${els.age.value} years`;
    els.age.setAttribute("aria-valuetext", `${els.age.value} years old`);
    localStorage.setItem("air-india-age", els.age.value);
    render();
  });
  els.favoriteToggle.addEventListener("click", () => {
    if (favorites.includes(selected.city)) {
      favorites = favorites.filter((city) => city !== selected.city);
    } else if (favorites.length < 5) {
      favorites = [...favorites, selected.city];
    } else {
      els.shareStatus.textContent = "You can save up to five places. Remove one before adding another.";
      return;
    }
    saveFavorites();
  });
  els.shareButton.addEventListener("click", async () => {
    const reading = readingFor(selected);
    const text = `${selected.city} air quality estimate: AQI ${reading.aqi} (${reading.category}). PM2.5 ${reading.pm25} µg/m³. ${selected.isLive ? "CAMS model via Open-Meteo." : "Sample fallback data."}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Air quality in ${selected.city}`, text });
        els.shareStatus.textContent = "Snapshot shared.";
      } else {
        await copyText(text);
        els.shareStatus.textContent = "Air quality snapshot copied to clipboard.";
      }
    } catch (error) {
      if (error.name !== "AbortError") els.shareStatus.textContent = "Could not share this snapshot. Check your browser permissions.";
    }
  });
  els.locateButton.addEventListener("click", () => {
    if (!navigator.geolocation) {
      mapCaptionOverride = "Location is not available in this browser.";
      els.mapCaption.textContent = mapCaptionOverride;
      return;
    }
    els.locateButton.disabled = true;
    els.locateButton.textContent = "Finding location…";
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const station = nearestStation(coords.latitude, coords.longitude);
        chooseStation(station, `Nearest model grid · ${station.station} area`);
        els.locateButton.disabled = false;
        els.locateButton.innerHTML = '<span class="locate-symbol" aria-hidden="true">◎</span> Use my location';
      },
      () => {
        mapCaptionOverride = "Location unavailable. Search for a city area instead.";
        els.mapCaption.textContent = mapCaptionOverride;
        els.locateButton.disabled = false;
        els.locateButton.innerHTML = '<span class="locate-symbol" aria-hidden="true">◎</span> Use my location';
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  });

  updateClock();
  window.setInterval(updateClock, 60000);
  initializeMap();
  render();
  window.addEventListener("airdata:updated", render);
})();