 (async () => {
  const { stations, categories, categoryFor } = window.AirData;
  const authUser = await window.Auth.ready;
  const byId = (id) => document.getElementById(id);
  const cityA = byId("city-a");
  const cityB = byId("city-b");
  const markerA = byId("marker-a");
  const markerB = byId("marker-b");

  for (const station of stations) {
    for (const select of [cityA, cityB]) {
      const option = document.createElement("option");
      option.value = station.city;
      option.textContent = station.city;
      select.appendChild(option);
    }
  }

  const savedCity = authUser?.city || localStorage.getItem("air-india-city") || stations[0].city;
  cityA.value = stations.some((station) => station.city === savedCity) ? savedCity : stations[0].city;
  cityB.value = cityA.value === "Bengaluru" ? "Lucknow" : "Bengaluru";

  function stationFor(select) {
    return window.AirData.stationByCity(select.value);
  }

  function paintMarker(marker, station, side) {
    const value = Math.min(station.aqi, 500);
    marker.style.left = `${(value / 500) * 100}%`;
    marker.dataset.value = station.aqi;
    marker.setAttribute("aria-label", `${station.city}, AQI ${station.aqi}`);
    marker.classList.toggle("marker-overlap", side === "b" && station.aqi === Number(markerA.dataset.value));
  }

  function update() {
    const first = stationFor(cityA);
    const second = stationFor(cityB);
    const categoryA = categoryFor(first.aqi);
    const categoryB = categoryFor(second.aqi);
    const delta = first.aqi - second.aqi;
    const id = (prefix, metric) => byId(`${prefix}-${metric}`);

    byId("label-a").textContent = first.city;
    byId("label-b").textContent = second.city;
    byId("value-a").textContent = first.aqi;
    byId("value-b").textContent = second.aqi;
    byId("category-a").textContent = categoryA;
    byId("category-b").textContent = categoryB;
    byId("table-city-a").textContent = first.city;
    byId("table-city-b").textContent = second.city;
    byId("comparison-readout").textContent = delta === 0
      ? "The selected cities have the same AQI"
      : `${delta < 0 ? first.city : second.city} is ${Math.abs(delta)} AQI points cleaner`;

    paintMarker(markerA, first, "a");
    paintMarker(markerB, second, "b");
    markerA.style.setProperty("--marker-color", categories.find((category) => category.name === categoryA).color);
    markerB.style.setProperty("--marker-color", categories.find((category) => category.name === categoryB).color);

    const metrics = [
      ["aqi", first.aqi, second.aqi, ""],
      ["pm", first.pm25, second.pm25, " µg/m³"],
      ["temp", first.weather.temp, second.weather.temp, "°C"],
      ["humidity", first.weather.humidity, second.weather.humidity, "%"],
      ["wind", first.weather.wind, second.weather.wind, "m/s"],
    ];

    for (const [metric, a, b, unit] of metrics) {
      id("a", metric).textContent = `${a}${unit ? ` ${unit}` : ""}`;
      id("b", metric).textContent = `${b}${unit ? ` ${unit}` : ""}`;
      const difference = Number(a) - Number(b);
      id("delta", metric).textContent = `${difference > 0 ? "+" : ""}${Number.isInteger(difference) ? difference : difference.toFixed(1)}${unit ? ` ${unit}` : ""}`;
      id("delta", metric).dataset.better = metric === "aqi" || metric === "pm" ? (difference < 0 ? "a" : difference > 0 ? "b" : "same") : "neutral";
    }

    byId("comparison-note").textContent = `${first.station} area, ${first.city} · ${second.station} area, ${second.city}. CAMS model estimates; lower AQI indicates cleaner air. Weather is shown for context.`;
    localStorage.setItem("air-india-city", first.city);
    if (window.Auth.user && window.Auth.user.city !== first.city) {
      void window.Auth.patchMe({ city: first.city }).catch((error) => {
        byId("comparison-note").textContent += ` Account sync failed: ${error.message}`;
      });
    }
  }

  byId("swap-cities").addEventListener("click", () => {
    const previous = cityA.value;
    cityA.value = cityB.value;
    cityB.value = previous;
    update();
  });
  cityA.addEventListener("change", update);
  cityB.addEventListener("change", update);
  update();
  window.addEventListener("airdata:updated", update);
})();