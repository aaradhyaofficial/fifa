import {
  INITIAL_SECTIONS,
  INITIAL_VOLUNTEERS,
  STADIUM_MAP_LAYOUT,
  PRESET_FAN_MESSAGES,
  PRESET_ORGANIZER_QUERIES,
} from "./stadium_data.js";
import {
  sanitizeHTML,
  generateIncidentId,
  getElement,
  formatTime,
} from "./utils.js";

// ─── Named Constants ──────────────────────────────────────────────
const STATUS = Object.freeze({
  AVAILABLE: "Available",
  DISPATCHED: "Dispatched",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
});

const SEVERITY = Object.freeze({
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
});

const INPUT_MAX_LENGTH = 500;
const DEBOUNCE_INTERVAL_MS = 600;

// ─── Application State ────────────────────────────────────────────
// Deep copies of frozen seed data to maintain mutable local state.

/**
 * @typedef {import('./stadium_data.js').SectionData} SectionData
 * @typedef {import('./stadium_data.js').VolunteerData} VolunteerData
 */

/** @type {Object.<string, SectionData>} */
let sectionsState = JSON.parse(JSON.stringify(INITIAL_SECTIONS));

/** @type {Array<VolunteerData>} */
let volunteersState = JSON.parse(JSON.stringify(INITIAL_VOLUNTEERS));

/**
 * @typedef {Object} Incident
 * @property {string} id
 * @property {string} type
 * @property {string} location
 * @property {string} description
 * @property {string} severity
 * @property {string} status
 * @property {string} reportedAt
 * @property {string|null} assignedTo
 * @property {string} details
 */

/** @type {Array<Incident>} */
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
    details:
      "Slow scanning speed causing congestion. Ticket dispatch sent to Gate 3 manager.",
  },
];

/** @type {string} */
let activeVolunteerId = "VOL-01";

/** @type {Array<number>} */
let resolutionTimes = [5.5, 3.8, 4.2, 3.3]; // mock past resolution times in minutes

/**
 * @typedef {Object} ChatMessage
 * @property {string} sender
 * @property {string} text
 * @property {string} time
 */

/** @type {Array<ChatMessage>} */
let fanChatHistory = [
  {
    sender: "bot",
    text: "Hello! I am your FIFA World Cup 2026 Stadium Assistant. Ask me about navigation, restrooms, food concessions, or report any issues in your section.",
    time: "20:45",
  },
];

/** @type {string|null} */
let selectedSection = null;

/** @type {number} */
let lastFanSendTime = 0;

/** @type {number} */
let lastOrgSendTime = 0;

/** @type {number} */
let renderedChatIndex = 0;

// ─── Render Batching ──────────────────────────────────────────────
// Batches multiple render calls into a single requestAnimationFrame tick
// to avoid redundant sequential DOM rebuilds.

/** @type {Set<Function>} */
let pendingRenders = new Set();

/** @type {number|null} */
let renderFrameId = null;

/**
 * Schedules render functions to execute in the next animation frame.
 * Deduplicates repeated calls to the same render function within a tick.
 * @param {...Function} renderFns - One or more render functions to schedule.
 */
function scheduleRender(...renderFns) {
  renderFns.forEach(function (fn) {
    pendingRenders.add(fn);
  });
  if (renderFrameId === null) {
    renderFrameId = requestAnimationFrame(flushRenders);
  }
}

/** Flushes all pending render functions in a single frame. */
function flushRenders() {
  let renders = Array.from(pendingRenders);
  pendingRenders.clear();
  renderFrameId = null;
  renders.forEach(function (fn) {
    fn();
  });
}

// ─── Dirty-flag caching for sorted incidents ──────────────────────
/** @type {boolean} */
let incidentsDirty = true;

/** @type {Array<Incident>} */
let sortedIncidentsCache = [];

/**
 * Returns a sorted copy of incidentsList (active first, then by time).
 * Uses a dirty flag to avoid re-sorting when data hasn't changed.
 * @returns {Array<Incident>}
 */
function getSortedIncidents() {
  if (incidentsDirty) {
    sortedIncidentsCache = incidentsList.slice().sort(function (a, b) {
      if (a.status === STATUS.RESOLVED && b.status !== STATUS.RESOLVED)
        return 1;
      if (a.status !== STATUS.RESOLVED && b.status === STATUS.RESOLVED)
        return -1;
      return new Date(b.reportedAt) - new Date(a.reportedAt);
    });
    incidentsDirty = false;
  }
  return sortedIncidentsCache;
}

/** Marks incidents as needing re-sort on next render. */
function markIncidentsDirty() {
  incidentsDirty = true;
}

// ─── Initialization ───────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {
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
    let chatSendBtn = getElement("chat-send-btn");
    let chatInput = getElement("chat-input");
    let consoleBtn = getElement("console-btn");
    let consoleInput = getElement("console-input");

    if (chatSendBtn) {
      chatSendBtn.addEventListener("click", handleFanSend);
    }
    if (chatInput) {
      chatInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") handleFanSend();
      });
    }
    if (consoleBtn) {
      consoleBtn.addEventListener("click", handleOrganizerQuery);
    }
    if (consoleInput) {
      consoleInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") handleOrganizerQuery();
      });
    }

    // Event delegation for volunteer task action buttons
    let volunteerTasksContainer = getElement("volunteer-tasks");
    if (volunteerTasksContainer) {
      volunteerTasksContainer.addEventListener("click", function (e) {
        let button = e.target.closest("button[data-action]");
        if (!button) return;

        let action = button.getAttribute("data-action");
        let incId = button.getAttribute("data-incident-id");
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
  let container = getElement("fan-presets");
  if (!container) return;
  container.innerHTML = "";
  let frag = document.createDocumentFragment();
  PRESET_FAN_MESSAGES.forEach(function (preset) {
    let chip = document.createElement("div");
    chip.className = "preset-chip";
    chip.textContent = preset.label;
    chip.tabIndex = 0;
    chip.setAttribute("role", "button");
    let trigger = function () {
      let input = getElement("chat-input");
      if (input) {
        input.value = preset.text;
        handleFanSend();
      }
    };
    chip.addEventListener("click", trigger);
    chip.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        trigger();
      }
    });
    frag.appendChild(chip);
  });
  container.appendChild(frag);
}

/** Render Organizer Console preset chips */
function renderOrganizerPresets() {
  let container = getElement("organizer-presets");
  if (!container) return;
  container.innerHTML = "";
  let frag = document.createDocumentFragment();
  PRESET_ORGANIZER_QUERIES.forEach(function (query) {
    let chip = document.createElement("div");
    chip.className = "preset-chip";
    chip.textContent = query;
    chip.tabIndex = 0;
    chip.setAttribute("role", "button");
    let trigger = function () {
      let input = getElement("console-input");
      if (input) {
        input.value = query;
        handleOrganizerQuery();
      }
    };
    chip.addEventListener("click", trigger);
    chip.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        trigger();
      }
    });
    frag.appendChild(chip);
  });
  container.appendChild(frag);
}

/** Render Volunteer Selector chips with keyboard support */
function renderVolunteerSelector() {
  let container = getElement("volunteer-selector");
  if (!container) return;
  container.innerHTML = "";
  let frag = document.createDocumentFragment();
  volunteersState.forEach(function (vol) {
    let chip = document.createElement("div");
    chip.className = "preset-chip";
    chip.tabIndex = 0;
    chip.setAttribute("role", "button");
    chip.setAttribute(
      "aria-pressed",
      vol.id === activeVolunteerId ? "true" : "false",
    );
    if (vol.id === activeVolunteerId) {
      chip.style.background = "var(--accent-purple)";
      chip.style.color = "white";
    }
    chip.textContent = vol.name.split(" ")[0];
    let trigger = function () {
      activeVolunteerId = vol.id;
      renderVolunteerSelector();
      renderVolunteerPortal();
    };
    chip.addEventListener("click", trigger);
    chip.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        trigger();
      }
    });
    frag.appendChild(chip);
  });
  container.appendChild(frag);
}

/** Render metrics top row */
function renderMetrics() {
  let activeIncidentsCount = incidentsList.filter(function (inc) {
    return inc.status !== STATUS.RESOLVED;
  }).length;

  let metricEl = getElement("metric-active-incidents");
  if (metricEl) metricEl.textContent = activeIncidentsCount;

  let iconElement = getElement("metric-incidents-icon");
  if (iconElement) {
    if (activeIncidentsCount > 0) {
      iconElement.classList.add("active-incidents");
      iconElement.style.animation = "pulse-red 2s infinite";
    } else {
      iconElement.classList.remove("active-incidents");
      iconElement.style.animation = "none";
    }
  }

  let availVolunteersCount = volunteersState.filter(function (vol) {
    return vol.status === STATUS.AVAILABLE;
  }).length;
  let availEl = getElement("metric-avail-volunteers");
  if (availEl)
    availEl.textContent =
      availVolunteersCount + " / " + volunteersState.length;

  let gate3Status = sectionsState["Gate 3"].status;
  let isGate3Slow =
    gate3Status.includes("Slow") || gate3Status.includes("delay");
  let gateFlowEl = getElement("metric-gate-flow");
  if (gateFlowEl) {
    gateFlowEl.textContent = isGate3Slow ? "Congested" : "Stable";
    gateFlowEl.style.color = isGate3Slow
      ? "var(--severity-med)"
      : "var(--accent-green)";
  }

  let avgTime =
    resolutionTimes.reduce(function (a, b) {
      return a + b;
    }, 0) / resolutionTimes.length;
  let resEl = getElement("metric-resolution-time");
  if (resEl) resEl.textContent = avgTime.toFixed(1) + "m";
}

/** Render Stadium Map Grid with proper ARIA gridcell roles */
function renderStadiumGrid() {
  let gridContainer = getElement("stadium-grid");
  if (!gridContainer) return;
  gridContainer.innerHTML = "";
  let frag = document.createDocumentFragment();

  STADIUM_MAP_LAYOUT.forEach(function (row) {
    let rowDiv = document.createElement("div");
    rowDiv.className = "stadium-grid-row";
    rowDiv.setAttribute("role", "row");

    row.forEach(function (nodeName) {
      let node = document.createElement("div");
      node.className = "stadium-node";
      node.setAttribute("role", "gridcell");
      node.setAttribute("aria-label", nodeName);

      let nodeData = sectionsState[nodeName];
      if (!nodeData) {
        node.style.background = "rgba(255,255,255,0.01)";
        node.style.border = "1px dashed rgba(255,255,255,0.03)";
        let label = document.createElement("span");
        label.style.cssText =
          "font-size: 10px; color: var(--text-muted); align-self: center; margin: auto;";
        label.textContent = nodeName;
        node.appendChild(label);
        rowDiv.appendChild(node);
        return;
      }

      let crowdClass = "crowd-" + nodeData.crowd.toLowerCase();
      node.classList.add(crowdClass);
      node.tabIndex = 0;

      if (selectedSection === nodeName) {
        node.classList.add("selected");
      }

      let hasActiveIncident = incidentsList.some(function (inc) {
        return inc.location === nodeName && inc.status !== STATUS.RESOLVED;
      });

      let titleDiv = document.createElement("div");
      titleDiv.className = "node-title";
      titleDiv.textContent = nodeName;

      let statusDiv = document.createElement("div");
      statusDiv.className = "node-status";

      let symbolSpan = document.createElement("span");
      symbolSpan.className = "node-symbol";
      symbolSpan.textContent = nodeData.icon;

      let crowdSpan = document.createElement("span");
      crowdSpan.style.cssText =
        "font-size: 9px; color: var(--text-secondary);";
      crowdSpan.textContent = nodeData.crowd;

      statusDiv.appendChild(symbolSpan);
      statusDiv.appendChild(crowdSpan);

      node.appendChild(titleDiv);
      node.appendChild(statusDiv);

      if (hasActiveIncident) {
        let alertDot = document.createElement("div");
        alertDot.className = "node-alert";
        node.appendChild(alertDot);
      }

      let trigger = function () {
        selectedSection = selectedSection === nodeName ? null : nodeName;
        renderStadiumGrid();
        showSectionDetailsInConsole(nodeName);
      };
      node.addEventListener("click", trigger);
      node.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          trigger();
        }
      });

      rowDiv.appendChild(node);
    });

    frag.appendChild(rowDiv);
  });
  gridContainer.appendChild(frag);
}

/** Show section status summary in organizer box if clicked */
function showSectionDetailsInConsole(nodeName) {
  let outputBox = getElement("console-output");
  if (!outputBox) return;

  let nodeData = sectionsState[nodeName];
  if (!nodeData) {
    outputBox.innerHTML =
      "<strong>Selected Section: " +
      sanitizeHTML(nodeName) +
      "</strong><br>No operational indicators active in this sector.";
    return;
  }

  let activeIncidents = incidentsList.filter(function (inc) {
    return inc.location === nodeName && inc.status !== STATUS.RESOLVED;
  });
  let activeVolunteers = volunteersState.filter(function (vol) {
    return vol.location === nodeName;
  });

  let html =
    "<strong>📍 Sector Intel: " +
    sanitizeHTML(nodeName) +
    " " +
    sanitizeHTML(nodeData.icon) +
    "</strong><br>";
  html +=
    'Crowd Wait Level: <span style="font-weight:600; color:' +
    getCrowdColor(nodeData.crowd) +
    '">' +
    sanitizeHTML(nodeData.crowd) +
    " Wait</span><br>";
  html +=
    "Operational Status: <em>" + sanitizeHTML(nodeData.status) + "</em><br>";

  if (activeIncidents.length > 0) {
    html +=
      '<br><span style="color:var(--severity-high); font-weight:600;">🚨 Active Incidents in Section:</span><br>';
    activeIncidents.forEach(function (inc) {
      html +=
        "- [" +
        sanitizeHTML(inc.id) +
        "] " +
        sanitizeHTML(inc.type) +
        " (" +
        sanitizeHTML(inc.severity) +
        " Severity) - Assigned: " +
        sanitizeHTML(getVolunteerName(inc.assignedTo)) +
        "<br>";
    });
  } else {
    html +=
      '<br><span style="color:var(--accent-green);">✓ No active hazard logs for this sector.</span><br>';
  }

  if (activeVolunteers.length > 0) {
    html += "<br><strong>🏃 Crew in Sector:</strong><br>";
    activeVolunteers.forEach(function (v) {
      html +=
        "- " +
        sanitizeHTML(v.name) +
        ' (Status: <span style="color: ' +
        (v.status === STATUS.AVAILABLE
          ? "var(--accent-green)"
          : "var(--severity-high)") +
        '">' +
        sanitizeHTML(v.status) +
        "</span>)<br>";
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
  let vol = volunteersState.find(function (v) {
    return v.id === id;
  });
  return vol ? vol.name : id;
}

/** Render Fan Chat Messages — sanitizes all user-generated text */
function renderFanChat() {
  let container = getElement("chat-feed");
  if (!container) return;

  let newMessages = fanChatHistory.slice(renderedChatIndex);
  if (newMessages.length === 0) return;

  let frag = document.createDocumentFragment();

  newMessages.forEach(function (msg) {
    let msgDiv = document.createElement("div");
    msgDiv.className = "message " + msg.sender;

    if (msg.sender === "user") {
      let textNode = document.createTextNode(msg.text);
      msgDiv.appendChild(textNode);
    } else {
      let contentSpan = document.createElement("span");
      contentSpan.innerHTML = msg.text;
      msgDiv.appendChild(contentSpan);
    }

    let timeSpan = document.createElement("span");
    timeSpan.className = "time";
    timeSpan.textContent = msg.time;
    msgDiv.appendChild(timeSpan);

    frag.appendChild(msgDiv);
  });
  container.appendChild(frag);
  renderedChatIndex = fanChatHistory.length;
  container.scrollTop = container.scrollHeight;
}

/**
 * Render Volunteer Portal view for active volunteer.
 * Uses DOM API instead of string concatenation for maintainability.
 * Action buttons use data-* attributes for event delegation.
 */
function renderVolunteerPortal() {
  let vol = volunteersState.find(function (v) {
    return v.id === activeVolunteerId;
  });
  if (!vol) return;

  // Header details update
  let nameEl = getElement("vol-name");
  if (nameEl) nameEl.textContent = vol.name;

  let locEl = getElement("vol-loc");
  if (locEl) locEl.textContent = "Zone: " + vol.location;

  let avatarEl = getElement("vol-avatar");
  if (avatarEl)
    avatarEl.textContent = vol.name
      .split(" ")
      .map(function (n) {
        return n[0];
      })
      .join("");

  let statusBadge = getElement("vol-status");
  if (statusBadge) {
    statusBadge.textContent = vol.status;
    statusBadge.className = "vol-status-badge " + vol.status.toLowerCase();
  }

  let tasksContainer = getElement("volunteer-tasks");
  if (!tasksContainer) return;
  tasksContainer.innerHTML = "";

  if (vol.task) {
    let activeTask = incidentsList.find(function (inc) {
      return inc.id === vol.task;
    });
    if (activeTask) {
      let card = document.createElement("div");
      card.className = "task-card active";

      // Build card header
      let headerDiv = document.createElement("div");
      headerDiv.className = "task-card-header";

      let taskIdSpan = document.createElement("span");
      taskIdSpan.className = "task-id";
      taskIdSpan.textContent = activeTask.id;
      headerDiv.appendChild(taskIdSpan);

      let severityBadge = document.createElement("span");
      severityBadge.className =
        "severity-badge " + activeTask.severity.toLowerCase();
      severityBadge.textContent = activeTask.severity + " Severity";
      headerDiv.appendChild(severityBadge);

      card.appendChild(headerDiv);

      // Build task title
      let titleDiv = document.createElement("div");
      titleDiv.className = "task-title";
      titleDiv.textContent =
        activeTask.type + ": Location " + activeTask.location;
      card.appendChild(titleDiv);

      // Build details paragraph
      let detailsP = document.createElement("p");
      detailsP.style.cssText =
        "font-size: 12px; color: var(--text-secondary); line-height: 1.4;";
      detailsP.textContent = activeTask.details;
      card.appendChild(detailsP);

      // Build task meta
      let metaDiv = document.createElement("div");
      metaDiv.className = "task-meta";

      let locSpan = document.createElement("span");
      locSpan.textContent = "📍 " + activeTask.location;
      metaDiv.appendChild(locSpan);

      let timeSpan = document.createElement("span");
      timeSpan.textContent = "⏱️ " + formatTime(activeTask.reportedAt);
      metaDiv.appendChild(timeSpan);

      card.appendChild(metaDiv);

      // Build action buttons via DOM (data-* for event delegation)
      if (
        activeTask.status === STATUS.DISPATCHED ||
        activeTask.status === STATUS.IN_PROGRESS
      ) {
        let actionDiv = document.createElement("div");
        actionDiv.className = "task-action-btns";

        let btn = document.createElement("button");
        btn.setAttribute("data-incident-id", activeTask.id);

        if (activeTask.status === STATUS.DISPATCHED) {
          btn.className = "btn primary";
          btn.setAttribute("data-action", "acknowledge");
          btn.textContent = "Acknowledge";
        } else {
          btn.className = "btn success";
          btn.setAttribute("data-action", "resolve");
          btn.textContent = "Mark Resolved";
        }

        actionDiv.appendChild(btn);
        card.appendChild(actionDiv);
      }

      tasksContainer.appendChild(card);
      return;
    }
  }

  // No active task — build empty state via DOM
  let emptyCard = document.createElement("div");
  emptyCard.className = "task-card";
  emptyCard.style.cssText =
    "border: 1px dashed var(--border-light); text-align: center; color: var(--text-muted); justify-content: center; height: 120px;";
  emptyCard.textContent =
    "No active incidents assigned near you. Ready for dispatch!";
  tasksContainer.appendChild(emptyCard);
}

/** Sync volunteer tasks from incidents in case state updates */
function syncVolunteerTasks() {
  volunteersState.forEach(function (vol) {
    // Find if any active (non-resolved) incident is assigned to this volunteer
    let assignedInc = incidentsList.find(function (inc) {
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

/**
 * Render Incident Logs list on Organizer view.
 * Uses DOM API and cached sorted incidents for efficiency.
 */
function renderIncidentLogs() {
  let container = getElement("incidents-list");
  if (!container) return;
  container.innerHTML = "";

  let sortedIncidents = getSortedIncidents();

  if (sortedIncidents.length === 0) {
    let emptyDiv = document.createElement("div");
    emptyDiv.style.cssText =
      "text-align:center; padding: 20px; color: var(--text-muted); font-size:12px;";
    emptyDiv.textContent =
      "No logged incidents. Stadium functioning nominal.";
    container.appendChild(emptyDiv);
    return;
  }

  let frag = document.createDocumentFragment();

  sortedIncidents.forEach(function (inc) {
    let card = document.createElement("div");
    card.className =
      "incident-log-card" +
      (inc.status === STATUS.RESOLVED ? " resolved" : "");

    let assignedVol = volunteersState.find(function (v) {
      return v.id === inc.assignedTo;
    });
    let assignee = assignedVol ? assignedVol.name : "Unassigned (Queue)";

    // Determine severity color
    let severityColor = "var(--severity-low)";
    if (inc.severity === SEVERITY.HIGH)
      severityColor = "var(--severity-high)";
    else if (inc.severity === SEVERITY.MEDIUM)
      severityColor = "var(--severity-med)";

    // Build card top row
    let topDiv = document.createElement("div");
    topDiv.className = "incident-log-top";

    let locSpan = document.createElement("span");
    locSpan.className = "incident-log-loc";
    locSpan.textContent = "📍 " + inc.location + " • " + inc.type;
    topDiv.appendChild(locSpan);

    let statusBadge = document.createElement("span");
    statusBadge.className =
      "status-badge " + inc.status.toLowerCase().replace(" ", "");
    statusBadge.textContent = inc.status;
    topDiv.appendChild(statusBadge);

    card.appendChild(topDiv);

    // Build description
    let descDiv = document.createElement("div");
    descDiv.className = "incident-log-desc";
    descDiv.textContent = inc.description;
    card.appendChild(descDiv);

    // Build bottom row
    let bottomDiv = document.createElement("div");
    bottomDiv.className = "incident-log-bottom";

    let idSpan = document.createElement("span");
    idSpan.innerHTML =
      "ID: " +
      sanitizeHTML(inc.id) +
      ' • Severity: <strong style="color: ' +
      severityColor +
      '">' +
      sanitizeHTML(inc.severity) +
      "</strong>";
    bottomDiv.appendChild(idSpan);

    let staffSpan = document.createElement("span");
    staffSpan.textContent = "Staff: " + assignee;
    bottomDiv.appendChild(staffSpan);

    card.appendChild(bottomDiv);

    frag.appendChild(card);
  });
  container.appendChild(frag);
}

// ─── Fan Input Processing ─────────────────────────────────────────

/** Handle fan chat message submission with debounce + validation */
function handleFanSend() {
  let now = Date.now();
  if (now - lastFanSendTime < DEBOUNCE_INTERVAL_MS) return;
  lastFanSendTime = now;

  let inputEl = getElement("chat-input");
  if (!inputEl) return;

  let text = inputEl.value.trim();
  if (!text) return;
  if (text.length > INPUT_MAX_LENGTH) {
    text = text.substring(0, INPUT_MAX_LENGTH);
  }

  // Clear input
  inputEl.value = "";

  // Get time stamp
  let currentTime = new Date();
  let timeStr =
    String(currentTime.getHours()).padStart(2, "0") +
    ":" +
    String(currentTime.getMinutes()).padStart(2, "0");

  // Add user message
  fanChatHistory.push({ sender: "user", text: text, time: timeStr });
  renderFanChat();

  // Show typing indicator while bot is "thinking"
  showTypingIndicator();

  // Trigger AI Response after delay
  setTimeout(function () {
    removeTypingIndicator();
    processFanGenAI(text, timeStr);
  }, 1000);
}

/**
 * Shows a typing indicator bubble in the chat feed.
 * Provides visual feedback while the bot "processes" the message.
 */
function showTypingIndicator() {
  let container = getElement("chat-feed");
  if (!container) return;

  let indicator = document.createElement("div");
  indicator.className = "typing-indicator";
  indicator.id = "typing-indicator";
  indicator.setAttribute("aria-label", "Bot is typing");

  for (let i = 0; i < 3; i++) {
    indicator.appendChild(document.createElement("span"));
  }

  container.appendChild(indicator);
  container.scrollTop = container.scrollHeight;
}

/**
 * Removes the typing indicator bubble from the chat feed.
 */
function removeTypingIndicator() {
  let indicator = document.getElementById("typing-indicator");
  if (indicator) {
    indicator.remove();
  }
}

/**
 * Simulated Multilingual GenAI Engine for Fan Chat Intake.
 *
 * SECURITY CONTRACT: All AI reply text in this function is author-controlled
 * HTML markup. Any user-supplied text (rawMessage) is sanitized via
 * sanitizeHTML() before being embedded in reply HTML. This function MUST NOT
 * insert raw user input into bot reply strings without sanitization.
 *
 * @param {string} rawMessage - The original user message (untrusted input).
 * @param {string} timeStr - The formatted time string for the message.
 */
function processFanGenAI(rawMessage, timeStr) {
  let message = rawMessage.toLowerCase();
  let safeRawMessage = sanitizeHTML(rawMessage);

  // Lang detection
  let detectedLanguage = "English";
  let translatedText = rawMessage;
  let isTranslationNotice = "";

  if (
    message.includes("¿") ||
    message.includes("donde") ||
    message.includes("baño") ||
    message.includes("fila") ||
    message.includes("comida")
  ) {
    detectedLanguage = "Spanish";
    // Simulated translation
    if (message.includes("baño")) {
      translatedText = "Where is the restroom near me?";
    } else if (message.includes("comida") || message.includes("agua")) {
      translatedText =
        "Where can I buy food and water without waiting in a long line?";
    }
    isTranslationNotice =
      '<em style="color: var(--text-muted); font-size:11px; display:block; margin-bottom: 4px;">[Translated from Spanish: "' +
      sanitizeHTML(translatedText) +
      '"]</em>';
  } else if (
    message.includes("où") ||
    message.includes("porte") ||
    message.includes("sortie") ||
    message.includes("file d'attente")
  ) {
    detectedLanguage = "French";
    if (message.includes("sortie") || message.includes("porte")) {
      translatedText = "Where is the closest exit to section 106?";
    }
    isTranslationNotice =
      '<em style="color: var(--text-muted); font-size:11px; display:block; margin-bottom: 4px;">[Translated from French: "' +
      sanitizeHTML(translatedText) +
      '"]</em>';
  }

  let aiReplyText = "";

  // 1. SCENARIO: Accessible restrooms near Sec 102
  if (
    message.includes("stroller") ||
    message.includes("restroom") ||
    message.includes("accessible") ||
    message.includes("baño")
  ) {
    let rwCrowd = sectionsState["Restrooms West"].crowd;
    let reCrowd = sectionsState["Restrooms East"].crowd;

    aiReplyText =
      "Based on real-time stadium sensors, you are currently at Section 102. <br><br>" +
      "♿ <strong>Closest Accessible Restrooms:</strong><br>" +
      "- <strong>Restrooms West</strong> (Adjacent to Sec 102): Currently experiencing <strong>" +
      sanitizeHTML(rwCrowd) +
      " wait times</strong> (estimated 12-minute wait).<br>" +
      "- <strong>Restrooms East</strong> (Adjacent to Sec 106): Currently experiencing <strong>" +
      sanitizeHTML(reCrowd) +
      " wait times</strong> (under 2 minutes).<br><br>" +
      "<strong>Navigation Route:</strong> Proceed east along the main concourse path toward Section 106. Restrooms East will be on your left, offering stroller access with zero lines.";

    if (detectedLanguage === "Spanish") {
      aiReplyText =
        "He detectado tu consulta en Español. Buscando baños accesibles:<br><br>" +
        "♿ <strong>Baños Accesibles más cercanos:</strong><br>" +
        "- <strong>Restrooms West</strong> (Junto a Sec 102): Espera <strong>" +
        (rwCrowd === "High" ? "Alta" : "Baja") +
        "</strong> (aprox. 12 min).<br>" +
        "- <strong>Restrooms East</strong> (Junto a Sec 106): Espera <strong>" +
        (reCrowd === "Low" ? "Baja" : "Alta") +
        "</strong> (menos de 2 min).<br><br>" +
        "<strong>Ruta:</strong> Camina hacia el este por el pasillo principal hacia la Sección 106. Los baños del este estarán a tu izquierda, libres de fila y con acceso de cochecitos.";
    }
  }

  // 2. SCENARIO: Operational spill report at Sec 102
  else if (
    message.includes("spill") ||
    message.includes("derrame") ||
    message.includes("beer") ||
    message.includes("cerveza") ||
    message.includes("slip") ||
    message.includes("caer")
  ) {
    let incId = generateIncidentId();

    // Add new incident to system state
    let newInc = {
      id: incId,
      type: "Safety Hazard",
      location: "Sec 102",
      description: "Liquid spill reported on the stairs at Section 102.",
      severity: SEVERITY.HIGH,
      status: STATUS.DISPATCHED,
      reportedAt: new Date().toISOString(),
      assignedTo: null,
      details:
        "Fan reported liquid/beer spill on steps. Risk of slip. Requesting immediate cleanup block-off.",
    };

    // Find closest available volunteer to Sec 102
    let matchedVolunteer = null;
    for (let i = 0; i < volunteersState.length; i++) {
      if (
        volunteersState[i].location === "Sec 102" &&
        volunteersState[i].status === STATUS.AVAILABLE
      ) {
        matchedVolunteer = volunteersState[i];
        break;
      }
    }

    if (!matchedVolunteer) {
      // Fallback: pick any available volunteer
      matchedVolunteer =
        volunteersState.find(function (v) {
          return v.status === STATUS.AVAILABLE;
        }) || volunteersState[0];
    }

    newInc.assignedTo = matchedVolunteer.id;
    incidentsList.push(newInc);
    markIncidentsDirty();

    // Update matched volunteer task state
    matchedVolunteer.status = STATUS.DISPATCHED;
    matchedVolunteer.task = incId;

    // Trigger operational blueprint logs (Triage report)
    logTriageAction(
      "AI Automated Triage: Logged " +
        incId +
        " (High Severity Hazard - Spill at Sec 102). Automatically matching closest available crew. Dispatch alert pushed to " +
        matchedVolunteer.name +
        " (Zone: " +
        matchedVolunteer.location +
        ").",
    );

    aiReplyText =
      "⚠️ <strong>Safety Report Logged</strong><br>" +
      "Thank you for reporting this. I have immediately logged a <strong>High Severity Hazard (Spill)</strong> at Section 102 and dispatched nearby crew member <strong>" +
      sanitizeHTML(matchedVolunteer.name) +
      "</strong> to handle it. <br><br>" +
      "Please avoid the stairs in Section 102 until they secure the area.";

    if (detectedLanguage === "Spanish") {
      aiReplyText =
        "⚠️ <strong>Reporte de Seguridad Registrado</strong><br>" +
        "Gracias por informar. He registrado una alerta de <strong>Gravedad Alta (Derrame)</strong> en la Sección 102 y he enviado a nuestro voluntario de zona <strong>" +
        sanitizeHTML(matchedVolunteer.name) +
        "</strong> para resolverlo.<br><br>" +
        "Evita las escaleras en la Sección 102 mientras se asegura el área.";
    }

    // Refresh panels via batched render
    syncVolunteerTasks();
    scheduleRender(
      renderVolunteerPortal,
      renderMetrics,
      renderStadiumGrid,
      renderIncidentLogs,
    );
  }

  // 3. SCENARIO: Gate 3 delays / Operational backups
  else if (
    message.includes("gate 3") ||
    message.includes("scanner") ||
    message.includes("delay") ||
    message.includes("porte 3") ||
    message.includes("lent")
  ) {
    let gateIncId = generateIncidentId();

    // Add incident
    let gateInc = {
      id: gateIncId,
      type: "Operations",
      location: "Gate 3",
      description:
        "Gate 3 scanners reports extremely slow queue progression.",
      severity: SEVERITY.MEDIUM,
      status: STATUS.DISPATCHED,
      reportedAt: new Date().toISOString(),
      assignedTo: "VOL-02", // Marco is at Gate 3
      details:
        "Multiple scanner delays. Volunteers requested to redirect incoming traffic to Gate 4.",
    };

    incidentsList.push(gateInc);
    markIncidentsDirty();
    sectionsState["Gate 3"].crowd = "Critical";
    sectionsState["Gate 3"].status = "Delay - Slow Scanners";

    syncVolunteerTasks();

    logTriageAction(
      "AI Automated Triage: Registered " +
        gateIncId +
        " (Medium Severity Operational - Gate 3 scanners bottleneck). Alert dispatched to Gate 3 manager and Crew Marco Silva.",
    );

    aiReplyText =
      "🚧 <strong>Gate Delay Alert</strong><br>" +
      "We detect high congestion at <strong>Gate 3</strong> due to a scanning bottleneck. Operations staff have been notified to address the scanners.<br><br>" +
      "💡 <strong>AI Suggestion:</strong> If you are arriving, please proceed to <strong>Gate 4</strong> (2-minute walk south), which currently has <strong>Low wait times</strong> (under 1 minute) and clear flow.";

    if (detectedLanguage === "French") {
      aiReplyText =
        "🚧 <strong>Alerte de retard au guichet</strong><br>" +
        "Nous détectons un engorgement important à la <strong>Porte 3</strong> en raison d'un problème de scanner. Le personnel a été dépêché.<br><br>" +
        "💡 <strong>Suggestion IA :</strong> Si vous arrivez, veuillez vous diriger vers la <strong>Porte 4</strong> (2 minutes de marche au sud), qui a un temps d'attente faible (moins d'une minute).";
    }

    // Refresh panels via batched render
    scheduleRender(
      renderVolunteerPortal,
      renderMetrics,
      renderStadiumGrid,
      renderIncidentLogs,
    );
  }

  // 4. SCENARIO: General Spanish food search
  else if (
    detectedLanguage === "Spanish" &&
    (message.includes("comida") || message.includes("agua"))
  ) {
    let cwCrowd = sectionsState["Concessions West"].crowd;
    let ceCrowd = sectionsState["Concessions East"].crowd;

    aiReplyText =
      "🍔 <strong>Guía de Concesiones de Comida:</strong><br>" +
      "- <strong>Concessions West</strong> (Cerca Sec 102): Actualmente <strong>muy congestionado</strong> (" +
      sanitizeHTML(cwCrowd) +
      "). Tiempo de espera aprox: 15 min.<br>" +
      "- <strong>Concessions East</strong> (Cerca Sec 106): Actualmente <strong>despejado</strong> (" +
      sanitizeHTML(ceCrowd) +
      "). Tiempo de espera aprox: menos de 2 min.<br><br>" +
      "<strong>Recomendación IA:</strong> Te aconsejamos caminar hacia el este (Sección 106) para comprar comida sin hacer largas filas.";
  }

  // 5. Default generic response — user input is sanitized
  else {
    aiReplyText =
      'I have received your query: "' +
      safeRawMessage +
      '".<br><br>' +
      "I am analyzing it against real-time stadium metrics. If you are reporting a spill, broken asset, or medical emergency, please specify the location (e.g., Section 102) so I can immediately dispatch volunteers. For food, restrooms, or exits, simply type your location.";
  }

  // Append response
  fanChatHistory.push({
    sender: "bot",
    text: isTranslationNotice + aiReplyText,
    time: timeStr,
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
  let inc = incidentsList.find(function (i) {
    return i.id === incId;
  });
  if (!inc) return;

  inc.status = STATUS.IN_PROGRESS;
  markIncidentsDirty();

  // Log triage action
  logTriageAction(
    "Crew Action: Volunteer " +
      getVolunteerName(inc.assignedTo) +
      " Acknowledged incident " +
      incId +
      ". State set to IN PROGRESS.",
  );

  scheduleRender(renderVolunteerPortal, renderIncidentLogs, renderMetrics);
}

/** Volunteer Action: Resolve Task */
function handleVolunteerResolve(incId) {
  let inc = incidentsList.find(function (i) {
    return i.id === incId;
  });
  if (!inc) return;

  inc.status = STATUS.RESOLVED;
  markIncidentsDirty();

  // Record resolution time (randomly between 3 and 8 minutes for realistic metrics)
  let resolvedIn = parseFloat((3 + Math.random() * 5).toFixed(1));
  resolutionTimes.push(resolvedIn);

  // Reset volunteer state
  let vol = volunteersState.find(function (v) {
    return v.id === inc.assignedTo;
  });
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

  logTriageAction(
    "Crew Action: Volunteer " +
      (vol ? vol.name : "Unknown") +
      " marked incident " +
      incId +
      " as RESOLVED in " +
      resolvedIn +
      "m. Stadium section status cleared.",
  );

  // Simulate WhatsApp follow-up notification to fan
  fanChatHistory.push({
    sender: "bot",
    text:
      "✅ <strong>Incident Update:</strong> The issue you reported at <strong>" +
      sanitizeHTML(inc.location) +
      "</strong> has been fully resolved by our Crew. Thank you for helping keep our venue safe and clean! Enjoy the match!",
    time: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  });

  // Update UI elements via batched render
  renderFanChat();
  syncVolunteerTasks();
  scheduleRender(
    renderVolunteerPortal,
    renderMetrics,
    renderStadiumGrid,
    renderIncidentLogs,
  );
}

// ─── Organizer Query Engine ───────────────────────────────────────

/**
 * Simulated GenAI Organizer Natural Language Query Engine.
 *
 * SECURITY CONTRACT: All generated answer text in this function is
 * author-controlled HTML markup. User-supplied query text is sanitized
 * via sanitizeHTML() before echo-back in responses. This function MUST
 * NOT insert raw user input into answer strings without sanitization.
 */
function handleOrganizerQuery() {
  let now = Date.now();
  if (now - lastOrgSendTime < DEBOUNCE_INTERVAL_MS) return;
  lastOrgSendTime = now;

  let inputEl = getElement("console-input");
  if (!inputEl) return;

  let query = inputEl.value.trim();
  if (!query) return;
  if (query.length > INPUT_MAX_LENGTH) {
    query = query.substring(0, INPUT_MAX_LENGTH);
  }

  inputEl.value = "";

  let outputBox = getElement("console-output");
  if (!outputBox) return;

  outputBox.classList.add("generating");
  outputBox.innerHTML =
    "⚙️ <strong>GenAI Synthesis Engine:</strong> Correlating live crowd sensors, volunteer dispatches, and incident databases...";

  setTimeout(function () {
    outputBox.classList.remove("generating");

    // Calculate live operational variables
    let activeIncidents = incidentsList.filter(function (i) {
      return i.status !== STATUS.RESOLVED;
    });
    let activeCount = activeIncidents.length;
    let availVolunteers = volunteersState.filter(function (v) {
      return v.status === STATUS.AVAILABLE;
    });

    let isSpillActive = incidentsList.some(function (i) {
      return (
        i.location === "Sec 102" &&
        i.type === "Safety Hazard" &&
        i.status !== STATUS.RESOLVED
      );
    });
    let isGate3Congested = sectionsState["Gate 3"].crowd === "Critical";

    let answerText = "";
    let queryLower = query.toLowerCase();

    // Sanitize user query for safe echo-back
    let safeQuery = sanitizeHTML(query);

    // 1. "Give me a 2-minute summary of the biggest operational bottlenecks right now."
    if (
      queryLower.includes("2-minute") ||
      queryLower.includes("summary") ||
      queryLower.includes("bottleneck")
    ) {
      let bottleneckDetails = "";
      let recommendations = "";

      if (isGate3Congested) {
        bottleneckDetails +=
          "- <strong>Gate 3 Flow Rate</strong>: Bottlenecked at <strong>Critical congestion</strong> due to a suspected hardware/scanning slowdown. Estimated entrance delay is 15 minutes.<br>";
        recommendations +=
          "- Divert incoming crowd streams from Gate 3 to <strong>Gate 4</strong> (which reports Low crowd wait times). Send a push notification to fans in transit.<br>";
      }

      if (isSpillActive) {
        let spillInc = incidentsList.find(function (i) {
          return (
            i.location === "Sec 102" &&
            i.type === "Safety Hazard" &&
            i.status !== STATUS.RESOLVED
          );
        });
        let assignedCrew = getVolunteerName(spillInc.assignedTo);
        bottleneckDetails +=
          "- <strong>Section 102 Spill</strong>: Active slip hazard reported on stairs. Currently assigned to volunteer <strong>" +
          sanitizeHTML(assignedCrew) +
          "</strong> (Status: <em>" +
          sanitizeHTML(spillInc.status) +
          "</em>).<br>";
        recommendations +=
          "- Maintain monitoring on Section 102 stair access until volunteer <strong>" +
          sanitizeHTML(assignedCrew) +
          "</strong> confirms cleanup crew completes cleaning.<br>";
      }

      if (!isGate3Congested && !isSpillActive) {
        bottleneckDetails =
          "- <strong>No major physical bottlenecks active.</strong> All crowd flows are within nominal values.<br>";
        recommendations =
          "- Routine monitoring active. Next volunteer rotation scheduled in 15 minutes.<br>";
      }

      let allocationPct = (
        ((volunteersState.length - availVolunteers.length) /
          volunteersState.length) *
        100
      ).toFixed(0);

      answerText =
        "<strong>⚡ GenAI Operational Narrative (2-Minute Briefing):</strong><br>" +
        "Stadium metrics show <strong>" +
        activeCount +
        " active incident(s)</strong>. Volunteers are at <strong>" +
        allocationPct +
        "% allocation</strong>.<br><br>" +
        "<strong>Key Bottlenecks identified:</strong><br>" +
        bottleneckDetails +
        "<strong>Recommended Actions:</strong><br>" +
        recommendations +
        "- Dispatch floating volunteers to reinforce Gate 3 queues if scanning rates don't recover in 5 minutes.";
    }

    // 2. "Check status of Section 102 spill and list closest available volunteers."
    else if (queryLower.includes("102") && queryLower.includes("spill")) {
      let spillInc2 = incidentsList.find(function (i) {
        return i.location === "Sec 102" && i.status !== STATUS.RESOLVED;
      });

      if (spillInc2) {
        let assignedCrew2 = volunteersState.find(function (v) {
          return v.id === spillInc2.assignedTo;
        });
        let availableNearby = volunteersState.filter(function (v) {
          return v.status === STATUS.AVAILABLE;
        });

        let crewListStr = availableNearby
          .map(function (v) {
            return (
              sanitizeHTML(v.name) +
              " (Zone: " +
              sanitizeHTML(v.location) +
              ")"
            );
          })
          .join(", ");
        if (!crewListStr) crewListStr = "None (All volunteers allocated)";

        answerText =
          "<strong>🔍 Section 102 Spill Query:</strong><br>" +
          "- <strong>Incident ID:</strong> " +
          sanitizeHTML(spillInc2.id) +
          " (Safety Hazard - Spill)<br>" +
          '- <strong>Current Status:</strong> <span style="color:var(--severity-med); font-weight:600;">' +
          sanitizeHTML(spillInc2.status) +
          "</span><br>" +
          "- <strong>Primary Assignee:</strong> " +
          (assignedCrew2 ? sanitizeHTML(assignedCrew2.name) : "Unassigned") +
          "<br>" +
          "- <strong>Action Logs:</strong> Dispatch notification received. Volunteer is on-ground securing steps.<br><br>" +
          "<strong>👥 Nearby Available Volunteers (Backup):</strong><br>" +
          crewListStr;
      } else {
        answerText =
          "<strong>🔍 Section 102 Spill Query:</strong><br>" +
          '- <strong>Current Status:</strong> <span style="color:var(--accent-green); font-weight:600;">Resolved / Clear</span><br>' +
          "No active spill incident is registered for Section 102. Stairs are dry and clear.";
      }
    }

    // 3. "What is the status of Gate 3 and what are the recommendations?"
    else if (queryLower.includes("gate 3")) {
      let gateData = sectionsState["Gate 3"];

      answerText =
        "<strong>🚪 Gate 3 Analysis Node:</strong><br>" +
        '- <strong>Current Congestion:</strong> <span style="color:#ff0055; font-weight:600;">' +
        sanitizeHTML(gateData.crowd) +
        " Wait</span><br>" +
        "- <strong>System Diagnostic:</strong> " +
        sanitizeHTML(gateData.status) +
        "<br><br>" +
        "<strong>📈 Live Flow Recommendations:</strong><br>" +
        "1. <strong>Reroute</strong>: Immediately direct arriving fans from MetLife South transit loops away from Gate 3 to <strong>Gate 4</strong> (Low traffic, 1-min entry time).<br>" +
        "2. <strong>Volunteer Shift</strong>: Reassign volunteer Marco Silva (currently available at Gate 3) to manual ticketing check to double scanning rates.<br>" +
        "3. <strong>Broadcast</strong>: Update the mobile app home screen banner to advise arrivals to bypass main Gate 3 entrances.";
    }

    // 4. Default search fallback — user query is sanitized
    else {
      let activeIncList = incidentsList
        .filter(function (i) {
          return i.status !== STATUS.RESOLVED;
        })
        .map(function (i) {
          return (
            "- [" +
            sanitizeHTML(i.id) +
            "] " +
            sanitizeHTML(i.type) +
            " in " +
            sanitizeHTML(i.location) +
            " (" +
            sanitizeHTML(i.status) +
            ")"
          );
        })
        .join("<br>");
      if (!activeIncList) activeIncList = "No active incidents.";

      answerText =
        '<strong>💡 GenAI Search Results for "' +
        safeQuery +
        '":</strong><br>' +
        "I have compiled stadium status data for your query.<br><br>" +
        "<strong>Active Incidents Queue:</strong><br>" +
        activeIncList +
        "<br><br>" +
        "<strong>Volunteer Allocation:</strong><br>" +
        "- Total Crew: " +
        volunteersState.length +
        "<br>" +
        "- Available: " +
        availVolunteers.length +
        "<br>" +
        "- Active Missions: " +
        (volunteersState.length - availVolunteers.length);
    }

    outputBox.innerHTML = answerText;
    outputBox.tabIndex = -1;
    outputBox.focus();
  }, 1200);
}
