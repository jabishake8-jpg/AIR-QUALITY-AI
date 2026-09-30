(() => {
  const { locations, categories, profiles, guidance } = window.AirGuidance;
  const stations = locations.map((station) => ({ ...station, weather: { ...station.weather } }));

  const refreshInterval = 15 * 60 * 1000;
  let lastRefresh = 0;
  let lastDataFetchedAt = null;
  let refreshInProgress = false;
  let airRequestFailed = false;
  let weatherRequestFailed = false;
  let status = "loading";

  function updateStatus() {
    const liveCount = stations.filter((station) => station.isLive).length;
    const weatherCount = stations.filter((station) => station.hasLiveWeather).length;
    status = airRequestFailed && liveCount ? "stale" : liveCount === stations.length && weatherCount === stations.length ? "live" : liveCount || weatherCount ? "partial" : "fallback";
    const label = status === "live" ? "MODEL ESTIMATE" : status === "partial" ? "PARTIAL MODEL" : status === "stale" ? "STALE MODEL" : "SAMPLE VALUES";
    const fetchedAt = lastDataFetchedAt ? new Date(lastDataFetchedAt) : new Date();
    document.querySelectorAll(".demo-indicator").forEach((indicator) => {
      if (indicator.childNodes[1]) indicator.childNodes[1].textContent = label;
    });
    document.querySelectorAll("[data-data-status]").forEach((element) => {
      element.textContent = status === "live"
        ? `CAMS global model via Open-Meteo · ~45 km grid · fetched ${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true }).format(fetchedAt)} IST`
        : status === "partial"
          ? `CAMS AQI estimates ${liveCount}/${stations.length} cities · weather ${weatherCount}/${stations.length} · missing values may be samples`
          : status === "stale"
            ? `CAMS refresh failed · showing the last AQI estimates fetched ${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true }).format(fetchedAt)} IST`
            : "Model feeds unavailable · showing sample values";
    });
    window.dispatchEvent(new CustomEvent("airdata:updated", { detail: { status, liveCount } }));
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Model data request failed (${response.status})`);
    return response.json();
  }

  async function refreshLiveData(forceRefresh = false) {
    if (refreshInProgress) return;
    refreshInProgress = true;
    try {
      const coordinates = {
        latitude: stations.map((station) => station.lat).join(","),
        longitude: stations.map((station) => station.lon).join(","),
      };
      const params = new URLSearchParams(coordinates);
      if (forceRefresh) params.set("refresh", "1");
      const providerData = await fetchJson(`/api/air-quality?${params}`);
      const airResponse = Array.isArray(providerData.air) ? providerData.air : null;
      const weatherResponse = Array.isArray(providerData.weather) ? providerData.weather : null;
      airRequestFailed = !airResponse;
      weatherRequestFailed = !weatherResponse;
      if (airRequestFailed && weatherRequestFailed) throw new Error("No model data was returned");
      const airResults = airResponse || [];
      const weatherResults = weatherResponse || [];
      lastDataFetchedAt = providerData.fetchedAt || null;

      stations.forEach((station, index) => {
        const air = airResults[index];
        const weather = weatherResults[index];
        if (airResults.length) {
          const aqi = air?.current?.us_aqi;
          station.isLive = Number.isFinite(aqi);
          if (station.isLive) {
            station.aqi = Math.max(0, Math.min(500, Math.round(aqi)));
            station.pm25 = Number.isFinite(air.current.pm2_5) ? Math.round(air.current.pm2_5 * 10) / 10 : station.pm25;
            station.hourlyAqi = air.hourly?.us_aqi || [];
            const nextAqi = station.hourlyAqi.slice(1, 7).filter(Number.isFinite);
            if (nextAqi.length) station.trend = nextAqi.at(-1) - station.aqi;
          }
        }
        const currentWeather = weather?.current;
        station.hasLiveWeather = Boolean(currentWeather && Number.isFinite(currentWeather.temperature_2m) && Number.isFinite(currentWeather.relative_humidity_2m) && Number.isFinite(currentWeather.wind_speed_10m));
        if (currentWeather) {
          station.weather = {
            temp: Number.isFinite(currentWeather.temperature_2m) ? Math.round(currentWeather.temperature_2m) : station.weather.temp,
            humidity: Number.isFinite(currentWeather.relative_humidity_2m) ? currentWeather.relative_humidity_2m : station.weather.humidity,
            wind: Number.isFinite(currentWeather.wind_speed_10m) ? Math.round(currentWeather.wind_speed_10m * 10) / 10 : station.weather.wind,
          };
        }
      });
      if (airResponse) lastRefresh = Date.now();
    } catch (error) {
      airRequestFailed = true;
      weatherRequestFailed = true;
      console.warn("Could not refresh model data:", error);
    } finally {
      refreshInProgress = false;
      updateStatus();
    }
  }

  function categoryFor(aqi) {
    const value = Number(aqi);
    return categories.find((category) => value >= category.min && value <= category.max)?.name || "No data";
  }

  function stationByCity(city) {
    return stations.find((station) => station.city === city) || stations[0];
  }

  function forecastAqi(station, hour, horizon = 24) {
    const liveValue = station.hourlyAqi?.[hour];
    if (Number.isFinite(liveValue)) return Math.round(liveValue);
    const progress = hour / horizon;
    const dailyWave = Math.sin((hour / 24) * Math.PI * 2 - 1) * (horizon === 24 ? 14 : 7);
    return Math.max(8, Math.min(500, Math.round(station.aqi + station.trend * progress + dailyWave * progress)));
  }

  window.AirData = { stations, categories, profiles, guidance, categoryFor, stationByCity, forecastAqi, refreshLiveData, get status() { return status; } };
  const refreshButtons = [...document.querySelectorAll(".nav-refresh")];
  refreshButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      button.disabled = true;
      button.classList.add("is-refreshing");
      button.setAttribute("aria-busy", "true");
      void refreshLiveData(true);
    });
  });
  window.addEventListener("airdata:updated", () => {
    refreshButtons.forEach((button) => {
      button.disabled = false;
      button.classList.remove("is-refreshing");
      button.removeAttribute("aria-busy");
    });
  });
  refreshLiveData();
  window.setInterval(refreshLiveData, refreshInterval);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) refreshLiveData();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - lastRefresh >= refreshInterval) refreshLiveData();
  });
})();