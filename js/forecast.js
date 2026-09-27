// js/forecast.js
const Forecast = {
  history: [],
  check(data) {
    this.history.push(data.aqi);
    if (this.history.length > 5) this.history.shift();

    if (this.history.length < 2) {
      return "Gathering data... forecast will appear after another reading.";
    }
    const diff = this.history[this.history.length - 1] - this.history[0];
    if (diff > 15) return "⚠️ Air quality is trending worse. Consider closing windows soon.";
    if (diff < -15) return "✅ Air quality is improving.";
    return "Air quality is stable for now.";
  }
};
window.Forecast = Forecast;