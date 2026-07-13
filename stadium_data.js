// FIFA World Cup 2026 - Stadium Operations Mock Data
// All seed data is deeply frozen to prevent accidental mutation.

/**
 * Recursively freezes an object and all its nested objects/arrays.
 * @param {Object} obj - The object to deep-freeze.
 * @returns {Object} The deeply frozen object.
 */
function deepFreeze(obj) {
  Object.freeze(obj);
  Object.getOwnPropertyNames(obj).forEach(function(prop) {
    const value = obj[prop];
    if (value !== null && (typeof value === "object" || typeof value === "function") && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  });
  return obj;
}

const INITIAL_SECTIONS = deepFreeze({
  "Sec 101": { crowd: "Medium", status: "Clear", icon: "🎟️" },
  "Sec 102": { crowd: "High", status: "Clear", icon: "🎟️" },
  "Sec 103": { crowd: "Medium", status: "Clear", icon: "🎟️" },
  "Sec 104": { crowd: "Low", status: "Clear", icon: "🎟️" },
  "Sec 105": { crowd: "Medium", status: "Clear", icon: "🎟️" },
  "Sec 106": { crowd: "High", status: "Clear", icon: "🎟️" },
  "Sec 107": { crowd: "Low", status: "Clear", icon: "🎟️" },
  "Sec 108": { crowd: "Medium", status: "Clear", icon: "🎟️" },
  "Gate 1": { crowd: "Medium", status: "Normal Flow", icon: "🚪" },
  "Gate 2": { crowd: "Low", status: "Normal Flow", icon: "🚪" },
  "Gate 3": { crowd: "Critical", status: "Slow Scanning - 15m delay", icon: "⚠️" },
  "Gate 4": { crowd: "Low", status: "Normal Flow", icon: "🚪" },
  "Restrooms West": { crowd: "High", status: "Normal", accessible: true, icon: "🚽" },
  "Restrooms East": { crowd: "Low", status: "Normal", accessible: true, icon: "🚽" },
  "Restrooms North": { crowd: "Medium", status: "Normal", accessible: false, icon: "🚽" },
  "Concessions West": { crowd: "High", status: "Busy", icon: "🍔" },
  "Concessions East": { crowd: "Low", status: "Clear", icon: "🍔" },
  "VIP Lounge": { crowd: "Medium", status: "Clear", icon: "👑" }
});

const INITIAL_VOLUNTEERS = deepFreeze([
  { id: "VOL-01", name: "Sarah Jenkins", location: "Sec 102", status: "Available", task: null },
  { id: "VOL-02", name: "Marco Silva", location: "Gate 3", status: "Available", task: null },
  { id: "VOL-03", name: "Elena Rostova", location: "Concessions West", status: "Available", task: null },
  { id: "VOL-04", name: "Hiroshi Sato", location: "Sec 106", status: "Available", task: null }
]);

const STADIUM_MAP_LAYOUT = deepFreeze([
  ["Gate 1", "Sec 101", "Restrooms West", "Sec 102", "Concessions West"],
  ["Gate 2", "VIP Lounge", "Field / Pitch", "Media Box", "Gate 3"],
  ["Gate 4", "Sec 108", "Restrooms East", "Sec 106", "Concessions East"],
  ["Sec 107", "Restrooms North", "Sec 105", "Sec 104", "Sec 103"]
]);

const PRESET_FAN_MESSAGES = deepFreeze([
  {
    label: "Accessibility Restroom",
    text: "I'm at Section 102 with a stroller. Where is the closest accessible restroom without a huge line?"
  },
  {
    label: "Report Liquid Spill (Hazard)",
    text: "There is a huge beer spill on the stairs at Section 102! Someone might slip."
  },
  {
    label: "Report Gate Delay (Operational)",
    text: "Gate 3 scanners are super slow. The crowd is getting frustrated and backing up."
  },
  {
    label: "Spanish Guidance",
    text: "¿Dónde puedo comprar comida y agua sin hacer mucha fila?"
  },
  {
    label: "French Query",
    text: "Où se trouve la sortie la plus proche de la section 106 ?"
  }
]);

const PRESET_ORGANIZER_QUERIES = deepFreeze([
  "Give me a 2-minute summary of the biggest operational bottlenecks right now.",
  "Check status of Section 102 spill and list closest available volunteers.",
  "What is the status of Gate 3 and what are the recommendations?",
  "List all active incidents and their assigned volunteers."
]);
