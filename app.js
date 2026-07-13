/**
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
(function() {
  "use strict";

  // ─── Named Constants ──────────────────────────────────────────────
  const STATUS = Object.freeze({
    AVAILABLE:    "Available",
    DISPATCHED:   "Dispatched",
    IN_PROGRESS:  "In Progress",
    RESOLVED:     "Resolved"
  });

  const SEVERITY = Object.freeze({
    HIGH:   "High",
    MEDIUM: "Medium",
    LOW:    "Low"
  });

  const INPUT_MAX_LENGTH = 500;
  const DEBOUNCE_INTERVAL_MS = 600;

  // ─── Security Utilities ───────────────────────────────────────────

  /**
   * Escapes HTML special characters to prevent XSS injection.
   * Must be applied to ALL user-supplied text before innerHTML insertion.
   * @param {string} str - Untrusted input string.
   * @returns {string} Escaped string safe for innerHTML.
   */
  function sanitizeHTML(str) {
    if (typeof str !== "string") return "";
    const escapeMap = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#x27;",
      "/": "&#x2F;"
    };
    return str.replace(/[&<>"'/]/g, function(char) {
      return escapeMap[char];
    });
  }

  /**
   * Generates a collision-resistant incident ID using crypto API.
   * Falls back to high-entropy Math.random if crypto is unavailable.
   * @returns {string} ID in format "INC-XXXXXX" (6 hex chars = 16M possibilities).
   */
  function generateIncidentId() {
    let hex;
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const buffer = new Uint8Array(3);
      crypto.getRandomValues(buffer);
      hex = Array.from(buffer).map(function(b) { return b.toString(16).padStart(2, "0"); }).join("");
    } else {
      hex = Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, "0");
    }
    return "INC-" + hex.toUpperCase();
  }

  /**
   * Safely queries a DOM element by ID. Logs a warning if not found.
   * @param {string} id - The element ID.
   * @returns {HTMLElement|null}
   */
  function getElement(id) {
    const el = document.getElementById(id);
    if (!el) {
      console.warn("[App] Element not found: #" + id);
    }
    return el;
  }

  // ─── Application State ────────────────────────────────────────────
  // Deep copies of frozen seed data to maintain mutable local state.
  let sectionsState = JSON.parse(JSON.stringify(INITIAL_SECTIONS));
  let volunteersState = JSON.parse(JSON.stringify(INITIAL_VOLUNTEERS));
  let incidentsList = [
    {
      id: "INC-089",
      type: "Operations",
      location: "Gate 3",
      description: "Gate 3 scanner is slow, causing a 15-minute delay.",
      severity: SEVERITY.MEDIUM,
      status: STATUS.DISPATCHED,
      reportedAt: new Date(Date.now() - 30 * 60000).toISOString(),
      assignedTo: "VOL-02", // Marco Silva
      details: "Slow scanning speed causing congestion. Ticket dispatch sent to Gate 3 manager."
    }
  ];

  // Active volunteer view selection (starts with Sarah Jenkins)
  let activeVolunteerId = "VOL-01";

  // Resolve timing helpers for metrics
  let resolutionTimes = [5.5, 3.8, 4.2, 3.3]; // mock past resolution times in minutes

  // Active Fan chat thread
  let fanChatHistory = [
    { sender: "bot", text: "Hello! I am your FIFA World Cup 2026 Stadium Assistant. Ask me about navigation, restrooms, food concessions, or report any issues in your section.", time: "20:45" }
  ];

  // Active section selection on the stadium grid
  let selectedSection = null;

  // Debounce tracking
  let lastFanSendTime = 0;
  let lastOrgSendTime = 0;

  // ─── Initialization ───────────────────────────────────────────────
  window.addEventListener("DOMContentLoaded", function() {
    try {
      // Set up volunteers assignments initial sync
      syncVolunteerTasks();

      // Render components
      renderFanPresets();
      renderFanChat();
      renderVolunteerSelector();
      renderVolunteerPortal();
      renderOrganizerPresets();
      renderMetrics();
      renderStadiumGrid();
      renderIncidentLogs();

      // Event listeners — no inline handlers
      var chatSendBtn = getElement("chat-send-btn");
      var chatInput = getElement("chat-input");
      var consoleBtn = getElement("console-btn");
      var consoleInput = getElement("console-input");

      if (chatSendBtn) {
        chatSendBtn.addEventListener("click", handleFanSend);
      }
      if (chatInput) {
        chatInput.addEventListener("keydown", function(e) {
          if (e.key === "Enter") handleFanSend();
        });
      }
      if (consoleBtn) {
        consoleBtn.addEventListener("click", handleOrganizerQuery);
      }
      if (consoleInput) {
        consoleInput.addEventListener("keydown", function(e) {
          if (e.key === "Enter") handleOrganizerQuery();
        });
      }

      // Event delegation for volunteer task action buttons
      var volunteerTasksContainer = getElement("volunteer-tasks");
      if (volunteerTasksContainer) {
        volunteerTasksContainer.addEventListener("click", function(e) {
          var button = e.target.closest("button[data-action]");
          if (!button) return;

          var action = button.getAttribute("data-action");
          var incId = button.getAttribute("data-incident-id");
          if (!incId) return;

          if (action === "acknowledge") {
            handleVolunteerAcknowledge(incId);
          } else if (action === "resolve") {
            handleVolunteerResolve(incId);
          }
        });
      }
    } catch (err) {
      console.error("[App] Initialization failed:", err);
    }
  });

  // ─── Render Functions ─────────────────────────────────────────────

  /** Render Fan Chat preset chips */
  function renderFanPresets() {
    var container = getElement("fan-presets");
    if (!container) return;
    container.innerHTML = "";
    PRESET_FAN_MESSAGES.forEach(function(preset) {
      var chip = document.createElement("div");
      chip.className = "preset-chip";
      chip.textContent = preset.label;
      chip.addEventListener("click", function() {
        var input = getElement("chat-input");
        if (input) {
          input.value = preset.text;
          handleFanSend();
        }
      });
      container.appendChild(chip);
    });
  }

  /** Render Organizer Console preset chips */
  function renderOrganizerPresets() {
    var container = getElement("organizer-presets");
    if (!container) return;
    container.innerHTML = "";
    PRESET_ORGANIZER_QUERIES.forEach(function(query) {
      var chip = document.createElement("div");
      chip.className = "preset-chip";
      chip.textContent = query;
      chip.addEventListener("click", function() {
        var input = getElement("console-input");
        if (input) {
          input.value = query;
          handleOrganizerQuery();
        }
      });
      container.appendChild(chip);
    });
  }

  /** Render Volunteer Selector chips */
  function renderVolunteerSelector() {
    var container = getElement("volunteer-selector");
    if (!container) return;
    container.innerHTML = "";
    volunteersState.forEach(function(vol) {
      var chip = document.createElement("div");
      chip.className = "preset-chip";
      if (vol.id === activeVolunteerId) {
        chip.style.background = "var(--accent-purple)";
        chip.style.color = "white";
      }
      chip.textContent = vol.name.split(" ")[0];
      chip.addEventListener("click", function() {
        activeVolunteerId = vol.id;
        renderVolunteerSelector();
        renderVolunteerPortal();
      });
      container.appendChild(chip);
    });
  }

  /** Render metrics top row */
  function renderMetrics() {
    var activeIncidentsCount = incidentsList.filter(function(inc) {
      return inc.status !== STATUS.RESOLVED;
    }).length;

    var metricEl = getElement("metric-active-incidents");
    if (metricEl) metricEl.textContent = activeIncidentsCount;

    var iconElement = getElement("metric-incidents-icon");
    if (iconElement) {
      if (activeIncidentsCount > 0) {
        iconElement.classList.add("active-incidents");
        iconElement.style.animation = "pulse-red 2s infinite";
      } else {
        iconElement.classList.remove("active-incidents");
        iconElement.style.animation = "none";
      }
    }

    var availVolunteersCount = volunteersState.filter(function(vol) {
      return vol.status === STATUS.AVAILABLE;
    }).length;
    var availEl = getElement("metric-avail-volunteers");
    if (availEl) availEl.textContent = availVolunteersCount + " / " + volunteersState.length;

    var gate3Status = sectionsState["Gate 3"].status;
    var isGate3Slow = gate3Status.includes("Slow") || gate3Status.includes("delay");
    var gateFlowEl = getElement("metric-gate-flow");
    if (gateFlowEl) {
      gateFlowEl.textContent = isGate3Slow ? "Congested" : "Stable";
      gateFlowEl.style.color = isGate3Slow ? "var(--severity-med)" : "var(--accent-green)";
    }

    var avgTime = resolutionTimes.reduce(function(a, b) { return a + b; }, 0) / resolutionTimes.length;
    var resEl = getElement("metric-resolution-time");
    if (resEl) resEl.textContent = avgTime.toFixed(1) + "m";
  }

  /** Render Stadium Map Grid */
  function renderStadiumGrid() {
    var gridContainer = getElement("stadium-grid");
    if (!gridContainer) return;
    gridContainer.innerHTML = "";

    STADIUM_MAP_LAYOUT.forEach(function(row) {
      var rowDiv = document.createElement("div");
      rowDiv.className = "stadium-grid-row";

      row.forEach(function(nodeName) {
        var node = document.createElement("div");
        node.className = "stadium-node";

        var nodeData = sectionsState[nodeName];
        if (!nodeData) {
          // Empty space or Pitch
          node.style.background = "rgba(255,255,255,0.01)";
          node.style.border = "1px dashed rgba(255,255,255,0.03)";
          var label = document.createElement("span");
          label.style.cssText = "font-size: 10px; color: var(--text-muted); align-self: center; margin: auto;";
          label.textContent = nodeName;
          node.appendChild(label);
          rowDiv.appendChild(node);
          return;
        }

        // Select appropriate crowd css class
        var crowdClass = "crowd-" + nodeData.crowd.toLowerCase();
        node.classList.add(crowdClass);

        if (selectedSection === nodeName) {
          node.classList.add("selected");
        }

        // Determine if there are active incidents in this node location
        var hasActiveIncident = incidentsList.some(function(inc) {
          return inc.location === nodeName && inc.status !== STATUS.RESOLVED;
        });

        // Build node content safely (nodeName comes from frozen config, not user input)
        var titleDiv = document.createElement("div");
        titleDiv.className = "node-title";
        titleDiv.textContent = nodeName;

        var statusDiv = document.createElement("div");
        statusDiv.className = "node-status";

        var symbolSpan = document.createElement("span");
        symbolSpan.className = "node-symbol";
        symbolSpan.textContent = nodeData.icon;

        var crowdSpan = document.createElement("span");
        crowdSpan.style.cssText = "font-size: 9px; color: var(--text-secondary);";
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

        node.addEventListener("click", function() {
          selectedSection = selectedSection === nodeName ? null : nodeName;
          renderStadiumGrid();
          showSectionDetailsInConsole(nodeName);
        });

        rowDiv.appendChild(node);
      });

      gridContainer.appendChild(rowDiv);
    });
  }

  /** Show section status summary in organizer box if clicked */
  function showSectionDetailsInConsole(nodeName) {
    var outputBox = getElement("console-output");
    if (!outputBox) return;

    var nodeData = sectionsState[nodeName];
    if (!nodeData) {
      // nodeName is from frozen config, safe to use directly
      outputBox.innerHTML = '<strong>Selected Section: ' + sanitizeHTML(nodeName) + '</strong><br>No operational indicators active in this sector.';
      return;
    }

    var activeIncidents = incidentsList.filter(function(inc) {
      return inc.location === nodeName && inc.status !== STATUS.RESOLVED;
    });
    var activeVolunteers = volunteersState.filter(function(vol) {
      return vol.location === nodeName;
    });

    var html = '<strong>📍 Sector Intel: ' + sanitizeHTML(nodeName) + ' ' + sanitizeHTML(nodeData.icon) + '</strong><br>';
    html += 'Crowd Wait Level: <span style="font-weight:600; color:' + getCrowdColor(nodeData.crowd) + '">' + sanitizeHTML(nodeData.crowd) + ' Wait</span><br>';
    html += 'Operational Status: <em>' + sanitizeHTML(nodeData.status) + '</em><br>';

    if (activeIncidents.length > 0) {
      html += '<br><span style="color:var(--severity-high); font-weight:600;">🚨 Active Incidents in Section:</span><br>';
      activeIncidents.forEach(function(inc) {
        html += '- [' + sanitizeHTML(inc.id) + '] ' + sanitizeHTML(inc.type) + ' (' + sanitizeHTML(inc.severity) + ' Severity) - Assigned: ' + sanitizeHTML(getVolunteerName(inc.assignedTo)) + '<br>';
      });
    } else {
      html += '<br><span style="color:var(--accent-green);">✓ No active hazard logs for this sector.</span><br>';
    }

    if (activeVolunteers.length > 0) {
      html += '<br><strong>🏃 Crew in Sector:</strong><br>';
      activeVolunteers.forEach(function(v) {
        html += '- ' + sanitizeHTML(v.name) + ' (Status: <span style="color: ' + (v.status === STATUS.AVAILABLE ? 'var(--accent-green)' : 'var(--severity-high)') + '">' + sanitizeHTML(v.status) + '</span>)<br>';
      });
    }

    outputBox.innerHTML = html;
  }

  /** Map crowd level to CSS color variable */
  function getCrowdColor(crowd) {
    if (crowd === "Low") return "var(--accent-green)";
    if (crowd === "Medium") return "var(--severity-med)";
    if (crowd === "High") return "var(--severity-high)";
    return "#ff0055";
  }

  /** Look up volunteer name by ID */
  function getVolunteerName(id) {
    if (!id) return "None (Triage Mode)";
    var vol = volunteersState.find(function(v) { return v.id === id; });
    return vol ? vol.name : id;
  }

  /** Render Fan Chat Messages — sanitizes all user-generated text */
  function renderFanChat() {
    var container = getElement("chat-feed");
    if (!container) return;
    container.innerHTML = "";

    fanChatHistory.forEach(function(msg) {
      var msgDiv = document.createElement("div");
      msgDiv.className = "message " + msg.sender;

      // Bot messages contain controlled HTML markup; user messages are plain text.
      if (msg.sender === "user") {
        var textNode = document.createTextNode(msg.text);
        msgDiv.appendChild(textNode);
      } else {
        // Bot messages may contain styled HTML — content is app-generated, not user-supplied.
        // Any user text embedded in bot replies is pre-sanitized at injection time.
        var contentSpan = document.createElement("span");
        contentSpan.innerHTML = msg.text;
        msgDiv.appendChild(contentSpan);
      }

      var timeSpan = document.createElement("span");
      timeSpan.className = "time";
      timeSpan.textContent = msg.time;
      msgDiv.appendChild(timeSpan);

      container.appendChild(msgDiv);
    });

    container.scrollTop = container.scrollHeight;
  }

  /** Render Volunteer Portal view for active volunteer — uses event delegation */
  function renderVolunteerPortal() {
    var vol = volunteersState.find(function(v) { return v.id === activeVolunteerId; });
    if (!vol) return;

    // Header details update
    var nameEl = getElement("vol-name");
    if (nameEl) nameEl.textContent = vol.name;

    var locEl = getElement("vol-loc");
    if (locEl) locEl.textContent = "Zone: " + vol.location;

    var avatarEl = getElement("vol-avatar");
    if (avatarEl) avatarEl.textContent = vol.name.split(" ").map(function(n) { return n[0]; }).join("");

    var statusBadge = getElement("vol-status");
    if (statusBadge) {
      statusBadge.textContent = vol.status;
      statusBadge.className = "vol-status-badge " + vol.status.toLowerCase();
    }

    var tasksContainer = getElement("volunteer-tasks");
    if (!tasksContainer) return;
    tasksContainer.innerHTML = "";

    if (vol.task) {
      var activeTask = incidentsList.find(function(inc) { return inc.id === vol.task; });
      if (activeTask) {
        var card = document.createElement("div");
        card.className = "task-card active";

        // Build action buttons via DOM (no inline onclick) — uses data-* attributes
        var actionButtonsHTML = "";
        if (activeTask.status === STATUS.DISPATCHED) {
          actionButtonsHTML = '<div class="task-action-btns">' +
            '<button class="btn primary" data-action="acknowledge" data-incident-id="' + sanitizeHTML(activeTask.id) + '">Acknowledge</button>' +
            '</div>';
        } else if (activeTask.status === STATUS.IN_PROGRESS) {
          actionButtonsHTML = '<div class="task-action-btns">' +
            '<button class="btn success" data-action="resolve" data-incident-id="' + sanitizeHTML(activeTask.id) + '">Mark Resolved</button>' +
            '</div>';
        }

        card.innerHTML =
          '<div class="task-card-header">' +
            '<span class="task-id">' + sanitizeHTML(activeTask.id) + '</span>' +
            '<span class="severity-badge ' + activeTask.severity.toLowerCase() + '">' + sanitizeHTML(activeTask.severity) + ' Severity</span>' +
          '</div>' +
          '<div class="task-title">' + sanitizeHTML(activeTask.type) + ': Location ' + sanitizeHTML(activeTask.location) + '</div>' +
          '<p style="font-size: 12px; color: var(--text-secondary); line-height: 1.4;">' + sanitizeHTML(activeTask.details) + '</p>' +
          '<div class="task-meta">' +
            '<span>📍 ' + sanitizeHTML(activeTask.location) + '</span>' +
            '<span>⏱️ ' + formatTime(activeTask.reportedAt) + '</span>' +
          '</div>' +
          actionButtonsHTML;

        tasksContainer.appendChild(card);
        return;
      }
    }

    // No active task
    tasksContainer.innerHTML =
      '<div class="task-card" style="border: 1px dashed var(--border-light); text-align: center; color: var(--text-muted); justify-content: center; height: 120px;">' +
        'No active incidents assigned near you. Ready for dispatch!' +
      '</div>';
  }

  /** Sync volunteer tasks from incidents in case state updates */
  function syncVolunteerTasks() {
    volunteersState.forEach(function(vol) {
      // Find if any active (non-resolved) incident is assigned to this volunteer
      var assignedInc = incidentsList.find(function(inc) {
        return inc.assignedTo === vol.id && inc.status !== STATUS.RESOLVED;
      });
      if (assignedInc) {
        vol.task = assignedInc.id;
        vol.status = STATUS.DISPATCHED;
      } else {
        vol.task = null;
        vol.status = STATUS.AVAILABLE;
      }
    });
  }

  /** Render Incident Logs list on Organizer view */
  function renderIncidentLogs() {
    var container = getElement("incidents-list");
    if (!container) return;
    container.innerHTML = "";

    // Sort incidents showing active first, then sorted by time
    var sortedIncidents = incidentsList.slice().sort(function(a, b) {
      if (a.status === STATUS.RESOLVED && b.status !== STATUS.RESOLVED) return 1;
      if (a.status !== STATUS.RESOLVED && b.status === STATUS.RESOLVED) return -1;
      return new Date(b.reportedAt) - new Date(a.reportedAt);
    });

    if (sortedIncidents.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted); font-size:12px;">No logged incidents. Stadium functioning nominal.</div>';
      return;
    }

    sortedIncidents.forEach(function(inc) {
      var card = document.createElement("div");
      card.className = "incident-log-card" + (inc.status === STATUS.RESOLVED ? " resolved" : "");

      var assignedVol = volunteersState.find(function(v) { return v.id === inc.assignedTo; });
      var assignee = assignedVol ? assignedVol.name : "Unassigned (Queue)";

      // Determine severity color
      var severityColor = "var(--severity-low)";
      if (inc.severity === SEVERITY.HIGH) severityColor = "var(--severity-high)";
      else if (inc.severity === SEVERITY.MEDIUM) severityColor = "var(--severity-med)";

      card.innerHTML =
        '<div class="incident-log-top">' +
          '<span class="incident-log-loc">📍 ' + sanitizeHTML(inc.location) + ' • ' + sanitizeHTML(inc.type) + '</span>' +
          '<span class="status-badge ' + inc.status.toLowerCase().replace(' ', '') + '">' + sanitizeHTML(inc.status) + '</span>' +
        '</div>' +
        '<div class="incident-log-desc">' + sanitizeHTML(inc.description) + '</div>' +
        '<div class="incident-log-bottom">' +
          '<span>ID: ' + sanitizeHTML(inc.id) + ' • Severity: <strong style="color: ' + severityColor + '">' + sanitizeHTML(inc.severity) + '</strong></span>' +
          '<span>Staff: ' + sanitizeHTML(assignee) + '</span>' +
        '</div>';

      container.appendChild(card);
    });
  }

  // ─── Fan Input Processing ─────────────────────────────────────────

  /** Handle fan chat message submission with debounce + validation */
  function handleFanSend() {
    var now = Date.now();
    if (now - lastFanSendTime < DEBOUNCE_INTERVAL_MS) return;
    lastFanSendTime = now;

    var inputEl = getElement("chat-input");
    if (!inputEl) return;

    var text = inputEl.value.trim();
    if (!text) return;
    if (text.length > INPUT_MAX_LENGTH) {
      text = text.substring(0, INPUT_MAX_LENGTH);
    }

    // Clear input
    inputEl.value = "";

    // Get time stamp
    var currentTime = new Date();
    var timeStr = String(currentTime.getHours()).padStart(2, "0") + ":" + String(currentTime.getMinutes()).padStart(2, "0");

    // Add user message
    fanChatHistory.push({ sender: "user", text: text, time: timeStr });
    renderFanChat();

    // Trigger AI Response loading state
    setTimeout(function() {
      processFanGenAI(text, timeStr);
    }, 1000);
  }

  /**
   * Simulated Multilingual GenAI Engine for Fan Chat Intake.
   * User-supplied text is sanitized before embedding in bot reply HTML.
   */
  function processFanGenAI(rawMessage, timeStr) {
    var message = rawMessage.toLowerCase();
    var safeRawMessage = sanitizeHTML(rawMessage);

    // Lang detection
    var detectedLanguage = "English";
    var translatedText = rawMessage;
    var isTranslationNotice = "";

    if (message.includes("¿") || message.includes("donde") || message.includes("baño") || message.includes("fila") || message.includes("comida")) {
      detectedLanguage = "Spanish";
      // Simulated translation
      if (message.includes("baño")) {
        translatedText = "Where is the restroom near me?";
      } else if (message.includes("comida") || message.includes("agua")) {
        translatedText = "Where can I buy food and water without waiting in a long line?";
      }
      isTranslationNotice = '<em style="color: var(--text-muted); font-size:11px; display:block; margin-bottom: 4px;">[Translated from Spanish: "' + sanitizeHTML(translatedText) + '"]</em>';
    } else if (message.includes("où") || message.includes("porte") || message.includes("sortie") || message.includes("file d'attente")) {
      detectedLanguage = "French";
      if (message.includes("sortie") || message.includes("porte")) {
        translatedText = "Where is the closest exit to section 106?";
      }
      isTranslationNotice = '<em style="color: var(--text-muted); font-size:11px; display:block; margin-bottom: 4px;">[Translated from French: "' + sanitizeHTML(translatedText) + '"]</em>';
    }

    var aiReplyText = "";

    // 1. SCENARIO: Accessible restrooms near Sec 102
    if (message.includes("stroller") || message.includes("restroom") || message.includes("accessible") || message.includes("baño")) {
      var rwCrowd = sectionsState["Restrooms West"].crowd;
      var reCrowd = sectionsState["Restrooms East"].crowd;

      aiReplyText = 'Based on real-time stadium sensors, you are currently at Section 102. <br><br>' +
        '♿ <strong>Closest Accessible Restrooms:</strong><br>' +
        '- <strong>Restrooms West</strong> (Adjacent to Sec 102): Currently experiencing <strong>' + sanitizeHTML(rwCrowd) + ' wait times</strong> (estimated 12-minute wait).<br>' +
        '- <strong>Restrooms East</strong> (Adjacent to Sec 106): Currently experiencing <strong>' + sanitizeHTML(reCrowd) + ' wait times</strong> (under 2 minutes).<br><br>' +
        '<strong>Navigation Route:</strong> Proceed east along the main concourse path toward Section 106. Restrooms East will be on your left, offering stroller access with zero lines.';

      if (detectedLanguage === "Spanish") {
        aiReplyText = 'He detectado tu consulta en Español. Buscando baños accesibles:<br><br>' +
          '♿ <strong>Baños Accesibles más cercanos:</strong><br>' +
          '- <strong>Restrooms West</strong> (Junto a Sec 102): Espera <strong>' + (rwCrowd === "High" ? "Alta" : "Baja") + '</strong> (aprox. 12 min).<br>' +
          '- <strong>Restrooms East</strong> (Junto a Sec 106): Espera <strong>' + (reCrowd === "Low" ? "Baja" : "Alta") + '</strong> (menos de 2 min).<br><br>' +
          '<strong>Ruta:</strong> Camina hacia el este por el pasillo principal hacia la Sección 106. Los baños del este estarán a tu izquierda, libres de fila y con acceso de cochecitos.';
      }
    }

    // 2. SCENARIO: Operational spill report at Sec 102
    else if (message.includes("spill") || message.includes("derrame") || message.includes("beer") || message.includes("cerveza") || message.includes("slip") || message.includes("caer")) {
      var incId = generateIncidentId();

      // Add new incident to system state
      var newInc = {
        id: incId,
        type: "Safety Hazard",
        location: "Sec 102",
        description: "Liquid spill reported on the stairs at Section 102.",
        severity: SEVERITY.HIGH,
        status: STATUS.DISPATCHED,
        reportedAt: new Date().toISOString(),
        assignedTo: null,
        details: "Fan reported liquid/beer spill on steps. Risk of slip. Requesting immediate cleanup block-off."
      };

      // Find closest available volunteer to Sec 102
      var matchedVolunteer = null;
      for (var i = 0; i < volunteersState.length; i++) {
        if (volunteersState[i].location === "Sec 102" && volunteersState[i].status === STATUS.AVAILABLE) {
          matchedVolunteer = volunteersState[i];
          break;
        }
      }

      if (!matchedVolunteer) {
        // Fallback: pick any available volunteer
        matchedVolunteer = volunteersState.find(function(v) { return v.status === STATUS.AVAILABLE; }) || volunteersState[0];
      }

      newInc.assignedTo = matchedVolunteer.id;
      incidentsList.push(newInc);

      // Update matched volunteer task state
      matchedVolunteer.status = STATUS.DISPATCHED;
      matchedVolunteer.task = incId;

      // Trigger operational blueprint logs (Triage report)
      logTriageAction("AI Automated Triage: Logged " + incId + " (High Severity Hazard - Spill at Sec 102). Automatically matching closest available crew. Dispatch alert pushed to " + matchedVolunteer.name + " (Zone: " + matchedVolunteer.location + ").");

      aiReplyText = '⚠️ <strong>Safety Report Logged</strong><br>' +
        'Thank you for reporting this. I have immediately logged a <strong>High Severity Hazard (Spill)</strong> at Section 102 and dispatched nearby crew member <strong>' + sanitizeHTML(matchedVolunteer.name) + '</strong> to handle it. <br><br>' +
        'Please avoid the stairs in Section 102 until they secure the area.';

      if (detectedLanguage === "Spanish") {
        aiReplyText = '⚠️ <strong>Reporte de Seguridad Registrado</strong><br>' +
          'Gracias por informar. He registrado una alerta de <strong>Gravedad Alta (Derrame)</strong> en la Sección 102 y he enviado a nuestro voluntario de zona <strong>' + sanitizeHTML(matchedVolunteer.name) + '</strong> para resolverlo.<br><br>' +
          'Evita las escaleras en la Sección 102 mientras se asegura el área.';
      }

      // Refresh panels
      syncVolunteerTasks();
      renderVolunteerPortal();
      renderMetrics();
      renderStadiumGrid();
      renderIncidentLogs();
    }

    // 3. SCENARIO: Gate 3 delays / Operational backups
    else if (message.includes("gate 3") || message.includes("scanner") || message.includes("delay") || message.includes("porte 3") || message.includes("lent")) {
      var gateIncId = generateIncidentId();

      // Add incident
      var gateInc = {
        id: gateIncId,
        type: "Operations",
        location: "Gate 3",
        description: "Gate 3 scanners reports extremely slow queue progression.",
        severity: SEVERITY.MEDIUM,
        status: STATUS.DISPATCHED,
        reportedAt: new Date().toISOString(),
        assignedTo: "VOL-02", // Marco is at Gate 3
        details: "Multiple scanner delays. Volunteers requested to redirect incoming traffic to Gate 4."
      };

      incidentsList.push(gateInc);
      sectionsState["Gate 3"].crowd = "Critical";
      sectionsState["Gate 3"].status = "Delay - Slow Scanners";

      syncVolunteerTasks();

      logTriageAction("AI Automated Triage: Registered " + gateIncId + " (Medium Severity Operational - Gate 3 scanners bottleneck). Alert dispatched to Gate 3 manager and Crew Marco Silva.");

      aiReplyText = '🚧 <strong>Gate Delay Alert</strong><br>' +
        'We detect high congestion at <strong>Gate 3</strong> due to a scanning bottleneck. Operations staff have been notified to address the scanners.<br><br>' +
        '💡 <strong>AI Suggestion:</strong> If you are arriving, please proceed to <strong>Gate 4</strong> (2-minute walk south), which currently has <strong>Low wait times</strong> (under 1 minute) and clear flow.';

      if (detectedLanguage === "French") {
        aiReplyText = '🚧 <strong>Alerte de retard au guichet</strong><br>' +
          'Nous détectons un engorgement important à la <strong>Porte 3</strong> en raison d\'un problème de scanner. Le personnel a été dépêché.<br><br>' +
          '💡 <strong>Suggestion IA :</strong> Si vous arrivez, veuillez vous diriger vers la <strong>Porte 4</strong> (2 minutes de marche au sud), qui a un temps d\'attente faible (moins d\'une minute).';
      }

      renderVolunteerPortal();
      renderMetrics();
      renderStadiumGrid();
      renderIncidentLogs();
    }

    // 4. SCENARIO: General Spanish food search
    else if (detectedLanguage === "Spanish" && (message.includes("comida") || message.includes("agua"))) {
      var cwCrowd = sectionsState["Concessions West"].crowd;
      var ceCrowd = sectionsState["Concessions East"].crowd;

      aiReplyText = '🍔 <strong>Guía de Concesiones de Comida:</strong><br>' +
        '- <strong>Concessions West</strong> (Cerca Sec 102): Actualmente <strong>muy congestionado</strong> (' + sanitizeHTML(cwCrowd) + '). Tiempo de espera aprox: 15 min.<br>' +
        '- <strong>Concessions East</strong> (Cerca Sec 106): Actualmente <strong>despejado</strong> (' + sanitizeHTML(ceCrowd) + '). Tiempo de espera aprox: menos de 2 min.<br><br>' +
        '<strong>Recomendación IA:</strong> Te aconsejamos caminar hacia el este (Sección 106) para comprar comida sin hacer largas filas.';
    }

    // 5. Default generic response — user input is sanitized
    else {
      aiReplyText = 'I have received your query: "' + safeRawMessage + '".<br><br>' +
        'I am analyzing it against real-time stadium metrics. If you are reporting a spill, broken asset, or medical emergency, please specify the location (e.g., Section 102) so I can immediately dispatch volunteers. For food, restrooms, or exits, simply type your location.';
    }

    // Append response
    fanChatHistory.push({
      sender: "bot",
      text: isTranslationNotice + aiReplyText,
      time: timeStr
    });
    renderFanChat();
  }

  /** Log actions in the Triage Panel */
  function logTriageAction(actionText) {
    // Log triage actions for audit trail
    console.log("[Triage]", actionText);
  }

  // ─── Volunteer Actions ────────────────────────────────────────────

  /** Volunteer Action: Acknowledge Task */
  function handleVolunteerAcknowledge(incId) {
    var inc = incidentsList.find(function(i) { return i.id === incId; });
    if (!inc) return;

    inc.status = STATUS.IN_PROGRESS;

    // Log triage action
    logTriageAction("Crew Action: Volunteer " + getVolunteerName(inc.assignedTo) + " Acknowledged incident " + incId + ". State set to IN PROGRESS.");

    renderVolunteerPortal();
    renderIncidentLogs();
    renderMetrics();
  }

  /** Volunteer Action: Resolve Task */
  function handleVolunteerResolve(incId) {
    var inc = incidentsList.find(function(i) { return i.id === incId; });
    if (!inc) return;

    inc.status = STATUS.RESOLVED;

    // Record resolution time (randomly between 3 and 8 minutes for realistic metrics)
    var resolvedIn = parseFloat((3 + Math.random() * 5).toFixed(1));
    resolutionTimes.push(resolvedIn);

    // Reset volunteer state
    var vol = volunteersState.find(function(v) { return v.id === inc.assignedTo; });
    if (vol) {
      vol.status = STATUS.AVAILABLE;
      vol.task = null;
    }

    // If it was a spill at Sec 102, clean up stadium section warning
    if (inc.location === "Sec 102" && inc.type === "Safety Hazard") {
      sectionsState["Sec 102"].status = "Clear";
    }
    // If it was Gate 3 bottlenecks, make it stable
    if (inc.location === "Gate 3" && inc.type === "Operations") {
      sectionsState["Gate 3"].status = "Normal Flow";
      sectionsState["Gate 3"].crowd = "Low";
    }

    logTriageAction("Crew Action: Volunteer " + (vol ? vol.name : "Unknown") + " marked incident " + incId + " as RESOLVED in " + resolvedIn + "m. Stadium section status cleared.");

    // Simulate WhatsApp follow-up notification to fan
    fanChatHistory.push({
      sender: "bot",
      text: '✅ <strong>Incident Update:</strong> The issue you reported at <strong>' + sanitizeHTML(inc.location) + '</strong> has been fully resolved by our Crew. Thank you for helping keep our venue safe and clean! Enjoy the match!',
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    });

    // Update UI elements
    renderFanChat();
    syncVolunteerTasks();
    renderVolunteerPortal();
    renderMetrics();
    renderStadiumGrid();
    renderIncidentLogs();
  }

  // ─── Organizer Query Engine ───────────────────────────────────────

  /** Simulated GenAI Organizer Natural Language Query Engine */
  function handleOrganizerQuery() {
    var now = Date.now();
    if (now - lastOrgSendTime < DEBOUNCE_INTERVAL_MS) return;
    lastOrgSendTime = now;

    var inputEl = getElement("console-input");
    if (!inputEl) return;

    var query = inputEl.value.trim();
    if (!query) return;
    if (query.length > INPUT_MAX_LENGTH) {
      query = query.substring(0, INPUT_MAX_LENGTH);
    }

    inputEl.value = "";

    var outputBox = getElement("console-output");
    if (!outputBox) return;

    outputBox.classList.add("generating");
    outputBox.innerHTML = '⚙️ <strong>GenAI Synthesis Engine:</strong> Correlating live crowd sensors, volunteer dispatches, and incident databases...';

    setTimeout(function() {
      outputBox.classList.remove("generating");

      // Calculate live operational variables
      var activeIncidents = incidentsList.filter(function(i) { return i.status !== STATUS.RESOLVED; });
      var activeCount = activeIncidents.length;
      var availVolunteers = volunteersState.filter(function(v) { return v.status === STATUS.AVAILABLE; });

      var isSpillActive = incidentsList.some(function(i) {
        return i.location === "Sec 102" && i.type === "Safety Hazard" && i.status !== STATUS.RESOLVED;
      });
      var isGate3Congested = sectionsState["Gate 3"].crowd === "Critical";

      var answerText = "";
      var queryLower = query.toLowerCase();

      // Sanitize user query for safe echo-back
      var safeQuery = sanitizeHTML(query);

      // 1. "Give me a 2-minute summary of the biggest operational bottlenecks right now."
      if (queryLower.includes("2-minute") || queryLower.includes("summary") || queryLower.includes("bottleneck")) {
        var bottleneckDetails = "";
        var recommendations = "";

        if (isGate3Congested) {
          bottleneckDetails += '- <strong>Gate 3 Flow Rate</strong>: Bottlenecked at <strong>Critical congestion</strong> due to a suspected hardware/scanning slowdown. Estimated entrance delay is 15 minutes.<br>';
          recommendations += '- Divert incoming crowd streams from Gate 3 to <strong>Gate 4</strong> (which reports Low crowd wait times). Send a push notification to fans in transit.<br>';
        }

        if (isSpillActive) {
          var spillInc = incidentsList.find(function(i) {
            return i.location === "Sec 102" && i.type === "Safety Hazard" && i.status !== STATUS.RESOLVED;
          });
          var assignedCrew = getVolunteerName(spillInc.assignedTo);
          bottleneckDetails += '- <strong>Section 102 Spill</strong>: Active slip hazard reported on stairs. Currently assigned to volunteer <strong>' + sanitizeHTML(assignedCrew) + '</strong> (Status: <em>' + sanitizeHTML(spillInc.status) + '</em>).<br>';
          recommendations += '- Maintain monitoring on Section 102 stair access until volunteer <strong>' + sanitizeHTML(assignedCrew) + '</strong> confirms cleanup crew completes cleaning.<br>';
        }

        if (!isGate3Congested && !isSpillActive) {
          bottleneckDetails = '- <strong>No major physical bottlenecks active.</strong> All crowd flows are within nominal values.<br>';
          recommendations = '- Routine monitoring active. Next volunteer rotation scheduled in 15 minutes.<br>';
        }

        var allocationPct = ((volunteersState.length - availVolunteers.length) / volunteersState.length * 100).toFixed(0);

        answerText =
          '<strong>⚡ GenAI Operational Narrative (2-Minute Briefing):</strong><br>' +
          'Stadium metrics show <strong>' + activeCount + ' active incident(s)</strong>. Volunteers are at <strong>' + allocationPct + '% allocation</strong>.<br><br>' +
          '<strong>Key Bottlenecks identified:</strong><br>' +
          bottleneckDetails +
          '<strong>Recommended Actions:</strong><br>' +
          recommendations +
          '- Dispatch floating volunteers to reinforce Gate 3 queues if scanning rates don\'t recover in 5 minutes.';
      }

      // 2. "Check status of Section 102 spill and list closest available volunteers."
      else if (queryLower.includes("102") && queryLower.includes("spill")) {
        var spillInc2 = incidentsList.find(function(i) {
          return i.location === "Sec 102" && i.status !== STATUS.RESOLVED;
        });

        if (spillInc2) {
          var assignedCrew2 = volunteersState.find(function(v) { return v.id === spillInc2.assignedTo; });
          var availableNearby = volunteersState.filter(function(v) { return v.status === STATUS.AVAILABLE; });

          var crewListStr = availableNearby.map(function(v) {
            return sanitizeHTML(v.name) + " (Zone: " + sanitizeHTML(v.location) + ")";
          }).join(", ");
          if (!crewListStr) crewListStr = "None (All volunteers allocated)";

          answerText =
            '<strong>🔍 Section 102 Spill Query:</strong><br>' +
            '- <strong>Incident ID:</strong> ' + sanitizeHTML(spillInc2.id) + ' (Safety Hazard - Spill)<br>' +
            '- <strong>Current Status:</strong> <span style="color:var(--severity-med); font-weight:600;">' + sanitizeHTML(spillInc2.status) + '</span><br>' +
            '- <strong>Primary Assignee:</strong> ' + (assignedCrew2 ? sanitizeHTML(assignedCrew2.name) : "Unassigned") + '<br>' +
            '- <strong>Action Logs:</strong> Dispatch notification received. Volunteer is on-ground securing steps.<br><br>' +
            '<strong>👥 Nearby Available Volunteers (Backup):</strong><br>' +
            crewListStr;
        } else {
          answerText =
            '<strong>🔍 Section 102 Spill Query:</strong><br>' +
            '- <strong>Current Status:</strong> <span style="color:var(--accent-green); font-weight:600;">Resolved / Clear</span><br>' +
            'No active spill incident is registered for Section 102. Stairs are dry and clear.';
        }
      }

      // 3. "What is the status of Gate 3 and what are the recommendations?"
      else if (queryLower.includes("gate 3")) {
        var gateData = sectionsState["Gate 3"];

        answerText =
          '<strong>🚪 Gate 3 Analysis Node:</strong><br>' +
          '- <strong>Current Congestion:</strong> <span style="color:#ff0055; font-weight:600;">' + sanitizeHTML(gateData.crowd) + ' Wait</span><br>' +
          '- <strong>System Diagnostic:</strong> ' + sanitizeHTML(gateData.status) + '<br><br>' +
          '<strong>📈 Live Flow Recommendations:</strong><br>' +
          '1. <strong>Reroute</strong>: Immediately direct arriving fans from MetLife South transit loops away from Gate 3 to <strong>Gate 4</strong> (Low traffic, 1-min entry time).<br>' +
          '2. <strong>Volunteer Shift</strong>: Reassign volunteer Marco Silva (currently available at Gate 3) to manual ticketing check to double scanning rates.<br>' +
          '3. <strong>Broadcast</strong>: Update the mobile app home screen banner to advise arrivals to bypass main Gate 3 entrances.';
      }

      // 4. Default search fallback — user query is sanitized
      else {
        var activeIncList = incidentsList.filter(function(i) {
          return i.status !== STATUS.RESOLVED;
        }).map(function(i) {
          return '- [' + sanitizeHTML(i.id) + '] ' + sanitizeHTML(i.type) + ' in ' + sanitizeHTML(i.location) + ' (' + sanitizeHTML(i.status) + ')';
        }).join("<br>");
        if (!activeIncList) activeIncList = "No active incidents.";

        answerText =
          '<strong>💡 GenAI Search Results for "' + safeQuery + '":</strong><br>' +
          'I have compiled stadium status data for your query.<br><br>' +
          '<strong>Active Incidents Queue:</strong><br>' +
          activeIncList + '<br><br>' +
          '<strong>Volunteer Allocation:</strong><br>' +
          '- Total Crew: ' + volunteersState.length + '<br>' +
          '- Available: ' + availVolunteers.length + '<br>' +
          '- Active Missions: ' + (volunteersState.length - availVolunteers.length);
      }

      outputBox.innerHTML = answerText;
    }, 1200);
  }

  // ─── Utility Functions ────────────────────────────────────────────

  /** Format ISO timestamp to HH:MM */
  function formatTime(isoStr) {
    var d = new Date(isoStr);
    if (isNaN(d.getTime())) return "--:--";
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

})();
