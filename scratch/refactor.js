const fs = require('fs');

let content = fs.readFileSync('app.js', 'utf8');

// 1. Replace IIFE and Utility functions with imports
const startMatch = `/**
 * FIFA World Cup 2026 - Stadium Operations App Engine
 *
 * Security & quality measures applied:
 * - IIFE encapsulation (no global scope pollution)
 * - HTML sanitization on all user-supplied text (XSS prevention)
 * - Event delegation instead of inline onclick handlers (CSP-compatible)
 * - crypto.getRandomValues() for collision-resistant IDs
 * - Input validation with max-length and debounce
 * - Named constants for all status/severity strings
 * - textContent over innerText for performance
 * - Centralized error handling with null-safe DOM queries
 */
(function () {
  "use strict";`;

const newStart = `import { INITIAL_SECTIONS, INITIAL_VOLUNTEERS, STADIUM_MAP_LAYOUT, PRESET_FAN_MESSAGES, PRESET_ORGANIZER_QUERIES } from './stadium_data.js';
import { sanitizeHTML, generateIncidentId, getElement } from './utils.js';`;

content = content.replace(startMatch, newStart);

// Remove the utility functions (lines 34 to 92 approx)
const utilStart = `  // ─── Security Utilities ───────────────────────────────────────────`;
const utilEnd = `  // ─── Application State ────────────────────────────────────────────`;
const utilIndexStart = content.indexOf(utilStart);
const utilIndexEnd = content.indexOf(utilEnd);
if (utilIndexStart !== -1 && utilIndexEnd !== -1) {
    content = content.slice(0, utilIndexStart) + content.slice(utilIndexEnd);
}

// Remove the final `})();`
content = content.replace(/}\)\(\);\s*$/, '}');

// 2. Add DocumentFragment and keyboard support to renderFanPresets
content = content.replace(
    /function renderFanPresets\(\) \{[\s\S]*?PRESET_FAN_MESSAGES\.forEach\(function \(preset\) \{[\s\S]*?container\.appendChild\(chip\);\s*\}\);/m,
    `function renderFanPresets() {
    var container = getElement("fan-presets");
    if (!container) return;
    container.innerHTML = "";
    var frag = document.createDocumentFragment();
    PRESET_FAN_MESSAGES.forEach(function (preset) {
      var chip = document.createElement("div");
      chip.className = "preset-chip";
      chip.textContent = preset.label;
      chip.tabIndex = 0;
      var trigger = function () {
        var input = getElement("chat-input");
        if (input) {
          input.value = preset.text;
          handleFanSend();
        }
      };
      chip.addEventListener("click", trigger);
      chip.addEventListener("keydown", function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger(); } });
      frag.appendChild(chip);
    });
    container.appendChild(frag);`
);

// 3. Add DocumentFragment and keyboard support to renderOrganizerPresets
content = content.replace(
    /function renderOrganizerPresets\(\) \{[\s\S]*?PRESET_ORGANIZER_QUERIES\.forEach\(function \(query\) \{[\s\S]*?container\.appendChild\(chip\);\s*\}\);/m,
    `function renderOrganizerPresets() {
    var container = getElement("organizer-presets");
    if (!container) return;
    container.innerHTML = "";
    var frag = document.createDocumentFragment();
    PRESET_ORGANIZER_QUERIES.forEach(function (query) {
      var chip = document.createElement("div");
      chip.className = "preset-chip";
      chip.textContent = query;
      chip.tabIndex = 0;
      var trigger = function () {
        var input = getElement("console-input");
        if (input) {
          input.value = query;
          handleOrganizerQuery();
        }
      };
      chip.addEventListener("click", trigger);
      chip.addEventListener("keydown", function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger(); } });
      frag.appendChild(chip);
    });
    container.appendChild(frag);`
);

// 4. DocumentFragment for renderFanChat
content = content.replace(
    /function renderFanChat\(\) \{[\s\S]*?fanChatHistory\.forEach\(function \(msg\) \{[\s\S]*?container\.appendChild\(msgDiv\);\s*\}\);/m,
    `function renderFanChat() {
    var container = getElement("chat-feed");
    if (!container) return;
    container.innerHTML = "";
    var frag = document.createDocumentFragment();

    fanChatHistory.forEach(function (msg) {
      var msgDiv = document.createElement("div");
      msgDiv.className = "message " + msg.sender;

      if (msg.sender === "user") {
        var textNode = document.createTextNode(msg.text);
        msgDiv.appendChild(textNode);
      } else {
        var contentSpan = document.createElement("span");
        contentSpan.innerHTML = msg.text;
        msgDiv.appendChild(contentSpan);
      }

      var timeSpan = document.createElement("span");
      timeSpan.className = "time";
      timeSpan.textContent = msg.time;
      msgDiv.appendChild(timeSpan);

      frag.appendChild(msgDiv);
    });
    container.appendChild(frag);`
);

// 5. DocumentFragment and tabindex for renderStadiumGrid
content = content.replace(
    /function renderStadiumGrid\(\) \{[\s\S]*?gridContainer\.appendChild\(rowDiv\);\s*\n\s*\}\);/m,
    `function renderStadiumGrid() {
    var gridContainer = getElement("stadium-grid");
    if (!gridContainer) return;
    gridContainer.innerHTML = "";
    var frag = document.createDocumentFragment();

    STADIUM_MAP_LAYOUT.forEach(function (row) {
      var rowDiv = document.createElement("div");
      rowDiv.className = "stadium-grid-row";

      row.forEach(function (nodeName) {
        var node = document.createElement("div");
        node.className = "stadium-node";

        var nodeData = sectionsState[nodeName];
        if (!nodeData) {
          node.style.background = "rgba(255,255,255,0.01)";
          node.style.border = "1px dashed rgba(255,255,255,0.03)";
          var label = document.createElement("span");
          label.style.cssText =
            "font-size: 10px; color: var(--text-muted); align-self: center; margin: auto;";
          label.textContent = nodeName;
          node.appendChild(label);
          rowDiv.appendChild(node);
          return;
        }

        var crowdClass = "crowd-" + nodeData.crowd.toLowerCase();
        node.classList.add(crowdClass);
        node.tabIndex = 0; // Accessibility

        if (selectedSection === nodeName) {
          node.classList.add("selected");
        }

        var hasActiveIncident = incidentsList.some(function (inc) {
          return inc.location === nodeName && inc.status !== STATUS.RESOLVED;
        });

        var titleDiv = document.createElement("div");
        titleDiv.className = "node-title";
        titleDiv.textContent = nodeName;

        var statusDiv = document.createElement("div");
        statusDiv.className = "node-status";

        var symbolSpan = document.createElement("span");
        symbolSpan.className = "node-symbol";
        symbolSpan.textContent = nodeData.icon;

        var crowdSpan = document.createElement("span");
        crowdSpan.style.cssText =
          "font-size: 9px; color: var(--text-secondary);";
        crowdSpan.textContent = nodeData.crowd;

        statusDiv.appendChild(symbolSpan);
        statusDiv.appendChild(crowdSpan);

        node.appendChild(titleDiv);
        node.appendChild(statusDiv);

        if (hasActiveIncident) {
          var alertDot = document.createElement("div");
          alertDot.className = "node-alert";
          node.appendChild(alertDot);
        }

        var trigger = function () {
          selectedSection = selectedSection === nodeName ? null : nodeName;
          renderStadiumGrid();
          showSectionDetailsInConsole(nodeName);
        };
        node.addEventListener("click", trigger);
        node.addEventListener("keydown", function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger(); } });

        rowDiv.appendChild(node);
      });

      frag.appendChild(rowDiv);
    });
    gridContainer.appendChild(frag);`
);

fs.writeFileSync('app.js', content, 'utf8');
