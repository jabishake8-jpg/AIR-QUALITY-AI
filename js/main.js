// js/main.js
let currentProfile = "general";
let map, marker;

function updateDashboard(data) {
  Gauge.render(data);
  document.getElementById("risk-message").textContent = RiskEngine.evaluate(data, currentProfile);
  document.getElementById("forecast-message").textContent = Forecast.check(data);
}

function initMap() {
  map = L.map("map").setView([22.5, 80], 5); // centered on India

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  map.on("click", async (e) => {
    const { lat, lng } = e.latlng;

    if (marker) map.removeLayer(marker);
    marker = L.marker([lat, lng]).addTo(map);

    document.getElementById("gauge").textContent = "Fetching data for this location...";
    const data = await AQIData.getCurrentByGeo(lat, lng);
    updateDashboard(data);
  });
}

function init() {
  const searchInput = document.getElementById("search-input");
  const searchBtn = document.getElementById("search-btn");
  const locateBtn = document.getElementById("locate-btn");
  const resultsList = document.getElementById("results-list");
  const profileSelect = document.getElementById("profile-select");
  const simulateButtons = document.querySelectorAll(".simulate-btn");

  initMap();

  profileSelect.addEventListener("change", (e) => { currentProfile = e.target.value; });

  searchBtn.addEventListener("click", async () => {
    const keyword = searchInput.value.trim();
    if (!keyword) return;
    resultsList.innerHTML = "<li>Searching...</li>";
    const stations = await AQIData.searchLocation(keyword);
    if (stations.length === 0) {
      resultsList.innerHTML = "<li>No stations found. Try a different place name.</li>";
      return;
    }
    resultsList.innerHTML = "";
    stations.forEach(station => {
      const li = document.createElement("li");
      li.textContent = station.name;
      li.addEventListener("click", async () => {
        const data = await AQIData.getCurrentByStation(station.uid, station.lat, station.lon);
        updateDashboard(data);

        if (marker) map.removeLayer(marker);
        marker = L.marker([station.lat, station.lon]).addTo(map);
        map.setView([station.lat, station.lon], 10);
      });
      resultsList.appendChild(li);
    });
  });

  locateBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("Geolocation isn't supported here. Please use search instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const data = await AQIData.getCurrentByGeo(latitude, longitude);
        updateDashboard(data);

        if (marker) map.removeLayer(marker);
        marker = L.marker([latitude, longitude]).addTo(map);
        map.setView([latitude, longitude], 10);
      },
      () => alert("Location permission denied. Please use search instead.")
    );
  });

  simulateButtons.forEach(btn => {
    btn.addEventListener("click", () => updateDashboard(AQIData.simulate(btn.dataset.level)));
  });
}

document.addEventListener("DOMContentLoaded", init);