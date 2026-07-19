/**
 * @fileoverview DOM-based integration tests for the FIFA Smart Venue Dashboard.
 * Tests core application logic: incident lifecycle, volunteer dispatch,
 * chat interactions, debouncing, and input validation.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";

// Read the HTML file for DOM setup
const htmlContent = fs.readFileSync(
  path.resolve(__dirname, "index.html"),
  "utf-8",
);

/**
 * Sets up a fresh DOM from index.html and loads app.js module.
 * Each test gets a clean state to avoid cross-contamination.
 */
async function setupDOM() {
  document.documentElement.innerHTML = htmlContent;
  // Dynamically import app.js to trigger DOMContentLoaded logic
  // We need to dispatch the event since the module loads after parsing
  vi.resetModules();
  await import("./app.js");
  document.dispatchEvent(new Event("DOMContentLoaded"));
  // Allow rAF-based renders to flush
  await new Promise((r) => setTimeout(r, 50));
}

describe("Initial Render", () => {
  beforeEach(async () => {
    await setupDOM();
  });

  test("renders fan chat preset chips", () => {
    const presets = document.querySelectorAll("#fan-presets .preset-chip");
    expect(presets.length).toBeGreaterThan(0);
  });

  test("renders organizer preset chips", () => {
    const presets = document.querySelectorAll(
      "#organizer-presets .preset-chip",
    );
    expect(presets.length).toBeGreaterThan(0);
  });

  test("renders volunteer selector chips", () => {
    const chips = document.querySelectorAll(
      "#volunteer-selector .preset-chip",
    );
    expect(chips.length).toBe(4); // 4 volunteers in initial data
  });

  test("renders stadium grid with nodes", () => {
    const nodes = document.querySelectorAll("#stadium-grid .stadium-node");
    expect(nodes.length).toBeGreaterThan(0);
  });

  test("renders initial incident in incident logs", () => {
    const cards = document.querySelectorAll(
      "#incidents-list .incident-log-card",
    );
    expect(cards.length).toBe(1); // INC-089
  });

  test("displays correct initial metrics", () => {
    const activeIncidents = document.getElementById(
      "metric-active-incidents",
    );
    expect(activeIncidents.textContent).toBe("1"); // INC-089 is active
  });

  test("skip-nav link exists in DOM", () => {
    const skipLink = document.querySelector(".skip-link");
    expect(skipLink).not.toBeNull();
    expect(skipLink.getAttribute("href")).toBe("#main-content");
  });

  test("main element has correct id for skip-nav target", () => {
    const main = document.getElementById("main-content");
    expect(main).not.toBeNull();
    expect(main.tagName.toLowerCase()).toBe("main");
  });
});

describe("Fan Chat Interaction", () => {
  beforeEach(async () => {
    await setupDOM();
  });

  test("fan message submission adds user message to chat feed", async () => {
    const input = document.getElementById("chat-input");
    const sendBtn = document.getElementById("chat-send-btn");

    input.value = "Where is the closest restroom?";
    sendBtn.click();

    // User message should appear immediately
    const userMessages = document.querySelectorAll(
      "#chat-feed .message.user",
    );
    expect(userMessages.length).toBeGreaterThanOrEqual(1);
    expect(userMessages[userMessages.length - 1].textContent).toContain(
      "Where is the closest restroom?",
    );
  });

  test("fan message clears input after sending", () => {
    const input = document.getElementById("chat-input");
    const sendBtn = document.getElementById("chat-send-btn");

    input.value = "Test message";
    sendBtn.click();

    expect(input.value).toBe("");
  });

  test("empty input does not add a message", () => {
    const sendBtn = document.getElementById("chat-send-btn");
    const messagesBefore = document.querySelectorAll(
      "#chat-feed .message",
    ).length;

    document.getElementById("chat-input").value = "";
    sendBtn.click();

    const messagesAfter = document.querySelectorAll(
      "#chat-feed .message",
    ).length;
    expect(messagesAfter).toBe(messagesBefore);
  });

  test("typing indicator appears while bot is thinking", async () => {
    const input = document.getElementById("chat-input");
    const sendBtn = document.getElementById("chat-send-btn");

    input.value = "Where is the restroom?";
    sendBtn.click();

    // Typing indicator should appear immediately after send
    await new Promise((r) => setTimeout(r, 100));
    const indicator = document.getElementById("typing-indicator");
    expect(indicator).not.toBeNull();
  });

  test("typing indicator is removed after bot responds", async () => {
    const input = document.getElementById("chat-input");
    const sendBtn = document.getElementById("chat-send-btn");

    input.value = "Where is the restroom?";
    sendBtn.click();

    // Wait for bot response (1000ms delay + buffer)
    await new Promise((r) => setTimeout(r, 1200));
    const indicator = document.getElementById("typing-indicator");
    expect(indicator).toBeNull();
  });

  test("input truncation at max length", () => {
    const input = document.getElementById("chat-input");
    const sendBtn = document.getElementById("chat-send-btn");

    // Generate a string longer than 500 chars
    input.value = "A".repeat(600);
    sendBtn.click();

    const userMessages = document.querySelectorAll(
      "#chat-feed .message.user",
    );
    const lastMsg = userMessages[userMessages.length - 1];
    // The displayed text (minus time span) should be <= 500 chars
    const textContent = lastMsg.childNodes[0].textContent;
    expect(textContent.length).toBeLessThanOrEqual(500);
  });
});

describe("Debounce Protection", () => {
  beforeEach(async () => {
    await setupDOM();
  });

  test("rapid-fire fan submissions are debounced", () => {
    const input = document.getElementById("chat-input");
    const sendBtn = document.getElementById("chat-send-btn");

    // First send
    input.value = "First message";
    sendBtn.click();

    // Immediate second send (within debounce window)
    input.value = "Second message";
    sendBtn.click();

    const userMessages = document.querySelectorAll(
      "#chat-feed .message.user",
    );
    // Only one message should have been sent (second is debounced)
    expect(userMessages.length).toBe(1);
  });
});

describe("Spill Incident Lifecycle", () => {
  beforeEach(async () => {
    await setupDOM();
    // Wait for debounce to clear from previous test
    await new Promise((r) => setTimeout(r, 700));
  });

  test("spill report creates a new incident", async () => {
    const input = document.getElementById("chat-input");
    const sendBtn = document.getElementById("chat-send-btn");

    input.value = "There is a beer spill on the stairs at Section 102!";
    sendBtn.click();

    // Wait for bot response and rAF renders
    await new Promise((r) => setTimeout(r, 1500));

    // Should now have 2 incidents (original + spill)
    const cards = document.querySelectorAll(
      "#incidents-list .incident-log-card",
    );
    expect(cards.length).toBe(2);
  });

  test("spill report dispatches a volunteer", async () => {
    const input = document.getElementById("chat-input");
    const sendBtn = document.getElementById("chat-send-btn");

    input.value = "There is a beer spill!";
    sendBtn.click();

    await new Promise((r) => setTimeout(r, 1500));

    // Active incidents count should increase
    const activeEl = document.getElementById("metric-active-incidents");
    expect(parseInt(activeEl.textContent)).toBeGreaterThanOrEqual(2);
  });
});

describe("Accessibility", () => {
  beforeEach(async () => {
    await setupDOM();
  });

  test("stadium grid nodes have role=gridcell", () => {
    const nodes = document.querySelectorAll("#stadium-grid .stadium-node");
    nodes.forEach((node) => {
      expect(node.getAttribute("role")).toBe("gridcell");
    });
  });

  test("stadium grid rows have role=row", () => {
    const rows = document.querySelectorAll("#stadium-grid .stadium-grid-row");
    rows.forEach((row) => {
      expect(row.getAttribute("role")).toBe("row");
    });
  });

  test("volunteer selector chips have role=button", () => {
    const chips = document.querySelectorAll(
      "#volunteer-selector .preset-chip",
    );
    chips.forEach((chip) => {
      expect(chip.getAttribute("role")).toBe("button");
    });
  });

  test("fan preset chips have role=button and tabIndex", () => {
    const chips = document.querySelectorAll("#fan-presets .preset-chip");
    chips.forEach((chip) => {
      expect(chip.getAttribute("role")).toBe("button");
      expect(chip.tabIndex).toBe(0);
    });
  });

  test("chat feed has aria-live=polite", () => {
    const feed = document.getElementById("chat-feed");
    expect(feed.getAttribute("aria-live")).toBe("polite");
  });
});
