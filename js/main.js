// js/main.js
let currentProfile = "general";

function updateDashboard(data) {
  Gauge.render(data);
  document.getElementById("risk-message").textContent = RiskEngine.evaluate(data, currentProfile);
  document.getElementById("forecast-message").textContent = Forecast.check(data);
}

function init() {
  const searchInput = document.getElementById("search-input");
  const searchBtn = document.getElementById("search-btn");
  const locateBtn = document.getElementById("locate-btn");
  const resultsList = document.getElementById("results-list");
  const profileSelect = document.getElementById("profile-select");
  const simulateButtons = document.querySelectorAll(".simulate-btn");

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
        const data = await AQIData.getCurrentByGeo(position.coords.latitude, position.coords.longitude);
        updateDashboard(data);
      },
      () => alert("Location permission denied. Please use search instead.")
    );
  });

  simulateButtons.forEach(btn => {
    btn.addEventListener("click", () => updateDashboard(AQIData.simulate(btn.dataset.level)));
  });
}

document.addEventListener("DOMContentLoaded", init);