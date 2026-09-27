// js/data.js

const AQI_TOKEN = "f5792e3eb753f8f2edf9d5b80a653a0a45d60eac"; // from aqicn.org/data-platform/token
   const WEATHER_KEY = "dbbb31ae8a8b4ae0a5a6d72c00df4134";// sign up free at openweathermap.org/api

function categorize(aqi) {
  if (aqi === "-" || aqi == null || isNaN(aqi)) return "No data";
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Unhealthy for Sensitive Groups";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very Unhealthy";
  return "Hazardous";
}

// Search any place name in India, get matching monitoring stations with live data
async function searchLocation(keyword) {
  const res = await fetch(`https://api.waqi.info/search/?token=${AQI_TOKEN}&keyword=${encodeURIComponent(keyword)}`);
  const json = await res.json();
  if (json.status !== "ok") return [];
  return json.data
    .filter(s => s.aqi !== "-")
    .map(s => ({
      uid: s.uid,
      name: s.station.name,
      lat: s.station.geo[0],
      lon: s.station.geo[1],
    }));
}

// Get weather for the same coordinates as the AQI station
async function getWeather(lat, lon) {
  try {
    const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${WEATHER_KEY}`);
    const json = await res.json();
    return {
      temp: json.main?.temp ?? null,
      humidity: json.main?.humidity ?? null,
      wind: json.wind?.speed ?? null,
    };
  } catch (err) {
    console.warn("Weather fetch failed:", err);
    return { temp: null, humidity: null, wind: null };
  }
}

// Get AQI + weather for the nearest station to given coordinates
async function getCurrentByGeo(lat, lon) {
  try {
    const res = await fetch(`https://api.waqi.info/feed/geo:${lat};${lon}/?token=${AQI_TOKEN}`);
    const json = await res.json();
    if (json.status !== "ok") throw new Error("Geo fetch failed");
    const d = json.data;
    const weather = await getWeather(lat, lon);
    return {
      aqi: d.aqi,
      pm25: d.iaqi?.pm25?.v ?? null,
      city: d.city?.name,
      timestamp: d.time?.s ?? new Date().toISOString(),
      category: categorize(d.aqi),
      weather,
    };
  } catch (err) {
    console.warn("Geo fetch failed, falling back to simulate:", err);
    return simulate("Moderate");
  }
}

// Get AQI + weather together for a chosen station (from searchLocation results)
async function getCurrentByStation(uid, lat, lon) {
  try {
    const res = await fetch(`https://api.waqi.info/feed/@${uid}/?token=${AQI_TOKEN}`);
    const json = await res.json();
    if (json.status !== "ok") throw new Error("Station fetch failed");
    const d = json.data;
    const weather = await getWeather(lat, lon);
    return {
      aqi: d.aqi,
      pm25: d.iaqi?.pm25?.v ?? null,
      city: d.city?.name,
      timestamp: d.time?.s ?? new Date().toISOString(),
      category: categorize(d.aqi),
      weather,
    };
  } catch (err) {
    console.warn("Live station fetch failed, falling back to simulate:", err);
    return simulate("Moderate");
  }
}

// Default single-city version (kept for quick testing without search)
async function getCurrent(city = "bangalore") {
  try {
    const res = await fetch(`https://api.waqi.info/feed/${city}/?token=${AQI_TOKEN}`);
    const json = await res.json();
    if (json.status !== "ok") throw new Error("API returned an error");
    const d = json.data;
    return {
      aqi: d.aqi,
      pm25: d.iaqi?.pm25?.v ?? null,
      city: d.city?.name ?? city,
      timestamp: d.time?.s ?? new Date().toISOString(),
      category: categorize(d.aqi),
      weather: { temp: null, humidity: null, wind: null },
    };
  } catch (err) {
    console.warn("Live AQI fetch failed, falling back to simulate:", err);
    return simulate("Moderate");
  }
}

const SIMULATED = {
  Good:      { aqi: 35,  pm25: 12,  city: "Demo City", category: "Good",      weather: { temp: 24, humidity: 40, wind: 12 } },
  Moderate:  { aqi: 85,  pm25: 30,  city: "Demo City", category: "Moderate",  weather: { temp: 27, humidity: 55, wind: 8 } },
  Unhealthy: { aqi: 178, pm25: 95,  city: "Demo City", category: "Unhealthy", weather: { temp: 30, humidity: 70, wind: 3 } },
  Hazardous: { aqi: 340, pm25: 250, city: "Demo City", category: "Hazardous", weather: { temp: 32, humidity: 80, wind: 1 } },
};

function simulate(level) {
  return { ...SIMULATED[level], timestamp: new Date().toISOString() };
}

function startPolling(onUpdate, city = "bangalore", intervalMs = 60000) {
  getCurrent(city).then(onUpdate);
  return setInterval(() => getCurrent(city).then(onUpdate), intervalMs);
}

window.AQIData = {
  getCurrent,
  getCurrentByStation,
  getCurrentByGeo,
  searchLocation,
  getWeather,
  simulate,
  startPolling,
};