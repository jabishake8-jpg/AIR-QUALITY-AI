// js/gauge.js
const Gauge = {
  render(data) {
    const el = document.getElementById("gauge");
    if (!el) return;
    const colors = {
      "Good": "#4caf50",
      "Moderate": "#ffeb3b",
      "Unhealthy for Sensitive Groups": "#ff9800",
      "Unhealthy": "#f44336",
      "Very Unhealthy": "#9c27b0",
      "Hazardous": "#7b1fa2",
      "No data": "#9e9e9e",
    };
    const color = colors[data.category] || "#9e9e9e";
    el.style.backgroundColor = color;
    el.style.color = "#fff";
    el.style.padding = "24px";
    el.style.borderRadius = "12px";
    el.style.textAlign = "center";
    el.style.transition = "background-color 0.4s ease";
    el.innerHTML = `<h1 style="margin:0;font-size:48px">${data.aqi ?? "--"}</h1><p style="margin:4px 0 0;font-size:18px">${data.category}</p>`;
  }
};
window.Gauge = Gauge;