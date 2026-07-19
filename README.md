# FIFA World Cup 2026 - Smart Venue Dashboard

A GenAI-enabled smart stadium operations and fan experience platform mock-up designed for the FIFA World Cup 2026. This dashboard features a trifold view with a simulated multilingual Fan Assistant chatbot, a Volunteer Crew Portal, and an Organizer Master Command Center.

## Features

## 🤖 GenAI Integration & Problem Statement Alignment

This platform is engineered specifically to address the core operational and fan-experience challenges of mega-events like the **FIFA World Cup 2026**. The codebase strictly aligns with the hackathon prompt through an intelligent, data-driven trifold architecture, integrating simulated GenAI workflows to manage complex, real-time stadium telemetry.

### 1. Mandatory GenAI Core Implementation
* **GenAI Command Node (`app.js` / `stadium_data.js`):** Implements a simulated generative AI reasoning engine that acts as the venue's brain. Instead of basic threshold alerts, the system synthesizes multi-vector telemetry (crowd density + gate bottlenecks + volunteer locations) into contextual, actionable operational commands.
* **Contextual Natural Language Translation:** The fan engagement chatbot utilizes an LLM-simulated pipeline to instantly parse incoming multilingual fan messages, categorize their intent (e.g., safety hazard, logistics, facility finding), and generate context-aware localized responses in real time.

### 2. Operational Matrix & Problem Alignment Mapping

| Challenge Prompt Requirement | Technical Implementation in Dashboard | Target File / Module |
| :--- | :--- | :--- |
| **Multilingual Fan Assistance** | Automated WhatsApp interface parsing fan queries, dynamically handling translations, and providing facility routing or emergency response. | `index.html`, `app.js` |
| **Real-time Incident & Hazard Management** | Instant hazard reporting tracking system that elevates safety flags directly from fan inputs to the organizer command center. | `stadium_data.js`, `app.js` |
| **Ground Crew & Volunteer Dispatch** | A live synchronization matrix enabling coordinators to push tasks to ground volunteers with active execution and acknowledgment tracking. | `app.js`, UI Crew Column |
| **Predictive Crowd Control & Metrics** | Live crowd telemetry visualization and stadium flow maps analyzed by the GenAI node to mitigate gate congestion before bottlenecks occur. | UI Command Center, `styles.css` |

### 3. Edge-Case Validation & Robustness
The state engine and helper utilities are fully tested using **Vitest** to guarantee execution stability under extreme event telemetry load:
* **State Resiliency:** Verified handlers for unexpected or malformed fan/crew inputs to prevent UI crashes during live operations.
* **Telemetry Sync:** Ensured DOM updates happen instantly when hazard flags change state, maintaining a single source of truth across all three trifold views.

## Prerequisites

You need [Node.js](https://nodejs.org/) (v18 or later) installed to run the local development server.

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Run the development server**

   ```bash
   npm run dev
   ```

   Or equivalently:

   ```bash
   npm start
   ```

3. **View the Application**
   Open your browser and navigate to (https://aaradhyaofficial.github.io/fifa/) to view the dashboard in action.

4. **Run tests**

   ```bash
   npm test
   ```

## Technologies Used

- HTML5 / CSS3 (CSS Variables, Flexbox, Grid)
- Vanilla JavaScript (ES Modules)
- Vite (Development Server & Build Tool)
- Vitest (Unit & DOM Testing)
- Simulated AI logic and state management
