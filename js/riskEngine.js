// js/riskEngine.js
const RiskEngine = {
  evaluate(data, profile = "general") {
    const category = data.category;
    const messages = {
      general: {
        "Good": "Air quality is good. Enjoy outdoor activities.",
        "Moderate": "Air quality is acceptable. Sensitive individuals should limit prolonged outdoor exertion.",
        "Unhealthy for Sensitive Groups": "Sensitive groups should reduce prolonged outdoor exertion.",
        "Unhealthy": "Everyone may begin to experience health effects. Limit outdoor activity.",
        "Very Unhealthy": "Health alert: avoid outdoor activity.",
        "Hazardous": "Health emergency. Stay indoors.",
        "No data": "No live data available for this location right now.",
      },
      child: {
        "Good": "Safe for kids to play outside.",
        "Moderate": "Generally safe; watch for coughing or unusual tiredness.",
        "Unhealthy for Sensitive Groups": "Limit outdoor playtime for children today.",
        "Unhealthy": "Avoid outdoor play. Keep children indoors.",
        "Very Unhealthy": "Keep children indoors with windows closed.",
        "Hazardous": "Emergency: keep children indoors at all times.",
        "No data": "No live data available for this location right now.",
      },
      elderly: {
        "Good": "Safe for a walk or light outdoor activity.",
        "Moderate": "Generally fine; take it easy if you have breathing issues.",
        "Unhealthy for Sensitive Groups": "Avoid prolonged outdoor exertion.",
        "Unhealthy": "Stay indoors as much as possible.",
        "Very Unhealthy": "Avoid going outside. Keep windows closed.",
        "Hazardous": "Emergency: remain indoors; seek help if breathing difficulty occurs.",
        "No data": "No live data available for this location right now.",
      },
      asthma: {
        "Good": "Safe for outdoor activity.",
        "Moderate": "Keep your inhaler handy if heading out.",
        "Unhealthy for Sensitive Groups": "High risk — avoid outdoor exercise, keep inhaler nearby.",
        "Unhealthy": "Not safe for asthma patients. Avoid outdoor activity entirely.",
        "Very Unhealthy": "High risk of an asthma attack outdoors. Stay inside.",
        "Hazardous": "Severe risk. Stay indoors, keep medication accessible.",
        "No data": "No live data available for this location right now.",
      },
      outdoor_worker: {
        "Good": "Safe to work outdoors normally.",
        "Moderate": "Fine to work; take breaks if you feel discomfort.",
        "Unhealthy for Sensitive Groups": "Consider a mask and more frequent breaks.",
        "Unhealthy": "Wear a mask, reduce exertion, take frequent indoor breaks.",
        "Very Unhealthy": "Limit outdoor work time as much as possible; wear a mask.",
        "Hazardous": "Outdoor work not advised. Reschedule if possible.",
        "No data": "No live data available for this location right now.",
      },
    };
    const profileMessages = messages[profile] || messages.general;
    return profileMessages[category] || "Unable to determine risk for this data.";
  }
};
window.RiskEngine = RiskEngine;