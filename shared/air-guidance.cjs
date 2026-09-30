const airGuidance = {
  locations: [
    { city: "Delhi", station: "Connaught Place", lat: 28.6304, lon: 77.2177, aqi: 178, pm25: 178, weather: { temp: 31, humidity: 58, wind: 2.8 }, trend: 24 },
    { city: "Mumbai", station: "Bandra-Kurla Complex", lat: 19.0607, lon: 72.8656, aqi: 92, pm25: 92, weather: { temp: 29, humidity: 76, wind: 4.2 }, trend: -12 },
    { city: "Bengaluru", station: "BTM Layout", lat: 12.9166, lon: 77.6101, aqi: 64, pm25: 64, weather: { temp: 25, humidity: 63, wind: 3.1 }, trend: -8 },
    { city: "Chennai", station: "US Consulate", lat: 13.0604, lon: 80.2496, aqi: 88, pm25: 88, weather: { temp: 32, humidity: 69, wind: 4.7 }, trend: 7 },
    { city: "Kolkata", station: "Ballygunge", lat: 22.5292, lon: 88.363, aqi: 142, pm25: 142, weather: { temp: 30, humidity: 73, wind: 2.4 }, trend: 18 },
    { city: "Hyderabad", station: "Punjagutta", lat: 17.4254, lon: 78.4482, aqi: 115, pm25: 115, weather: { temp: 29, humidity: 55, wind: 3.5 }, trend: 9 },
    { city: "Jaipur", station: "Adarsh Nagar", lat: 26.9025, lon: 75.836, aqi: 131, pm25: 131, weather: { temp: 33, humidity: 38, wind: 2.1 }, trend: -16 },
    { city: "Lucknow", station: "Lalbagh", lat: 26.8467, lon: 80.9462, aqi: 206, pm25: 206, weather: { temp: 32, humidity: 51, wind: 1.8 }, trend: 31 },
    { city: "Pune", station: "Shivajinagar", lat: 18.5308, lon: 73.8475, aqi: 76, pm25: 76, weather: { temp: 27, humidity: 61, wind: 3.8 }, trend: -5 },
  ],
  categories: [
    { name: "Good", min: 0, max: 50, color: "#278b63", level: "good" },
    { name: "Moderate", min: 51, max: 100, color: "#bd941e", level: "moderate" },
    { name: "Unhealthy for Sensitive Groups", min: 101, max: 150, color: "#d67b38", level: "sensitive" },
    { name: "Unhealthy", min: 151, max: 200, color: "#cf4e4e", level: "unhealthy" },
    { name: "Very Unhealthy", min: 201, max: 300, color: "#805588", level: "very-unhealthy" },
    { name: "Hazardous", min: 301, max: 500, color: "#572743", level: "hazardous" },
  ],
  profiles: [
    { id: "general", label: "General", short: "Most adults" },
    { id: "child", label: "Child", short: "Children" },
    { id: "elderly", label: "Older adult", short: "Older adults" },
    { id: "asthma", label: "Asthma", short: "Asthma" },
    { id: "outdoor_worker", label: "Outdoor worker", short: "Outdoor work" },
  ],
  guidance: {
    general: {
      Good: "Air quality is good. Enjoy your usual outdoor routine.",
      Moderate: "Air is acceptable for most people. If you feel discomfort, ease back on prolonged, strenuous activity outside.",
      "Unhealthy for Sensitive Groups": "Consider shorter outdoor workouts. People who are unusually sensitive may want to limit extended exertion.",
      Unhealthy: "Reduce prolonged or strenuous outdoor activity. Choose a lighter session or move it indoors.",
      "Very Unhealthy": "Limit time outdoors and avoid strenuous activity. Keep indoor air cleaner where possible.",
      Hazardous: "Avoid outdoor exertion and seek cleaner indoor air. Follow local public-health guidance.",
    },
    child: {
      Good: "Air quality is good for outdoor play. Keep normal breaks and hydration in the routine.",
      Moderate: "Usual play is generally fine. Watch for coughing or unusual breathlessness during longer activity.",
      "Unhealthy for Sensitive Groups": "Children may be more affected. Shorten vigorous outdoor play and take breaks indoors.",
      Unhealthy: "Keep outdoor play shorter and less intense. Move sports or long activities indoors if possible.",
      "Very Unhealthy": "Keep children indoors for strenuous play and sports. Close windows during peak pollution periods.",
      Hazardous: "Keep children indoors and avoid outdoor exertion. Follow local school and public-health advisories.",
    },
    elderly: {
      Good: "Air quality is good for your usual routine. Keep regular activity and hydration.",
      Moderate: "Most usual activities are fine. Take breaks if longer outdoor activity feels uncomfortable.",
      "Unhealthy for Sensitive Groups": "Older adults may be more sensitive. Shorten strenuous outdoor activity and rest indoors.",
      Unhealthy: "Limit prolonged exertion outside. Plan errands for cleaner periods and take breaks indoors.",
      "Very Unhealthy": "Avoid strenuous outdoor activity. Keep prescribed medicines accessible and use cleaner indoor air.",
      Hazardous: "Stay indoors where air is cleaner and avoid exertion. Seek medical advice if symptoms worsen.",
    },
    asthma: {
      Good: "Air quality is good. Follow your usual asthma plan and keep prescribed medicines available.",
      Moderate: "If symptoms appear, reduce prolonged exertion and follow your asthma action plan.",
      "Unhealthy for Sensitive Groups": "Pollution may trigger symptoms. Keep your reliever accessible and limit strenuous outdoor activity.",
      Unhealthy: "Reduce outdoor exertion and keep your prescribed reliever available. Follow your clinician’s asthma plan.",
      "Very Unhealthy": "Avoid outdoor exertion where possible. Follow your asthma action plan and seek care for severe symptoms.",
      Hazardous: "Stay in cleaner indoor air. Follow your asthma action plan and get medical help for severe or worsening symptoms.",
    },
    outdoor_worker: {
      Good: "Conditions are favorable for outdoor work. Keep normal hydration and rest breaks.",
      Moderate: "Continue normal precautions. Take breaks if outdoor exertion causes discomfort.",
      "Unhealthy for Sensitive Groups": "Schedule strenuous tasks for cleaner periods where possible. Take regular breaks and follow site guidance.",
      Unhealthy: "Reduce strenuous exposure where practical. Rotate tasks, take cleaner-air breaks, and follow workplace protection guidance.",
      "Very Unhealthy": "Minimize heavy outdoor exertion where possible. Use workplace respiratory protections and cleaner-air rest areas.",
      Hazardous: "Avoid outdoor work where possible. Follow employer and local safety advisories for hazardous air.",
    },
  },
};

if (typeof window !== "undefined") window.AirGuidance = airGuidance;
if (typeof module !== "undefined" && module.exports) module.exports = airGuidance;
