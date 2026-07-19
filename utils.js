/**
 * @module utils
 * Shared utility functions for the FIFA Smart Venue Dashboard.
 * All functions are pure (no side-effects) except getElement (DOM query).
 */

/**
 * Escapes HTML special characters to prevent XSS injection.
 * Must be applied to ALL user-supplied text before innerHTML insertion.
 * @param {string} str - Untrusted input string.
 * @returns {string} Escaped string safe for innerHTML.
 */
export function sanitizeHTML(str) {
  if (typeof str !== "string") return "";
  const escapeMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "/": "&#x2F;",
  };
  return str.replace(/[&<>"'/]/g, function (char) {
    return escapeMap[char];
  });
}

/**
 * Generates a collision-resistant incident ID using crypto API.
 * Falls back to high-entropy Math.random if crypto is unavailable.
 * @returns {string} ID in format "INC-XXXXXX" (6 hex chars = 16M possibilities).
 */
export function generateIncidentId() {
  let hex;
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buffer = new Uint8Array(3);
    crypto.getRandomValues(buffer);
    hex = Array.from(buffer)
      .map(function (b) {
        return b.toString(16).padStart(2, "0");
      })
      .join("");
  } else {
    hex = Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, "0");
  }
  return "INC-" + hex.toUpperCase();
}

/**
 * Safely queries a DOM element by ID. Logs a warning if not found.
 * @param {string} id - The element ID.
 * @returns {HTMLElement|null}
 */
export function getElement(id) {
  if (typeof document === "undefined") return null; // for tests
  const el = document.getElementById(id);
  if (!el) {
    console.warn("[App] Element not found: #" + id);
  }
  return el;
}

/**
 * Formats an ISO 8601 timestamp string to "HH:MM" display format.
 * Returns "--:--" for invalid or unparseable timestamps.
 * @param {string} isoStr - ISO timestamp string (e.g. "2026-07-19T20:45:00.000Z").
 * @returns {string} Time string in "HH:MM" format or "--:--" on failure.
 */
export function formatTime(isoStr) {
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return "--:--";
  return (
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0")
  );
}
