/**
 * Volatility window computation logic.
 * Extracted from n8n "Compute Volatility State" workflow for reuse in tests.
 * Uses data/anchor_events.json for anchor detection (same as bridge).
 */

const fs = require("fs");
const path = require("path");

const PRE_EVENT_WINDOW_MS = 7 * 60 * 1000;
const DURING_EVENT_WINDOW_MS = 4 * 60 * 1000;
const POST_EVENT_WINDOW_MS = 9 * 60 * 1000;

const ANCHOR_EVENTS_PATH = path.resolve(__dirname, "../data/anchor_events.json");

function normalizeText(value) {
  return String(value || "").toLowerCase().trim();
}

function loadAnchorHighAliases() {
  try {
    const raw = fs.readFileSync(ANCHOR_EVENTS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const events = parsed && Array.isArray(parsed.anchor_high_events)
      ? parsed.anchor_high_events
      : [];
    return events
      .flatMap((entry) => (Array.isArray(entry.aliases) ? entry.aliases : []))
      .map((alias) => normalizeText(alias))
      .filter(Boolean);
  } catch (error) {
    return [];
  }
}

const ANCHOR_HIGH_ALIASES = loadAnchorHighAliases();

function isAnchorHighEvent(title) {
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) return false;
  return ANCHOR_HIGH_ALIASES.some((alias) => normalizedTitle.includes(alias));
}

function resolvePhase(eventMs, nowMs) {
  if (eventMs - PRE_EVENT_WINDOW_MS <= nowMs && nowMs < eventMs) {
    return "pre_event";
  }
  if (eventMs <= nowMs && nowMs < eventMs + DURING_EVENT_WINDOW_MS) {
    return "during_event";
  }
  if (eventMs + DURING_EVENT_WINDOW_MS <= nowMs && nowMs < eventMs + POST_EVENT_WINDOW_MS) {
    return "post_event";
  }
  return null;
}

function sortByNearestTime(nowMs) {
  return (a, b) => {
    const distanceA = Math.abs(a.eventMs - nowMs);
    const distanceB = Math.abs(b.eventMs - nowMs);
    if (distanceA !== distanceB) return distanceA - distanceB;
    return a.eventMs - b.eventMs;
  };
}

/**
 * Compute volatility state from raw events.
 * @param {number} nowMs - Current time in milliseconds (simulation or real)
 * @param {Array<{title: string, date: string, impact: string, currency?: string}>} events - Raw events
 * @returns {{ state: string, phase: string, primary_event: object|null, impact_type: string|null, contextual_anchor: boolean, contextual_anchor_names: string[] }}
 */
function computeFromRawEvents(nowMs, events) {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      state: "GREEN",
      phase: "none",
      primary_event: null,
      impact_type: null,
      contextual_anchor: false,
      contextual_anchor_names: []
    };
  }

  const highEvents = events
    .filter((e) => e && e.impact === "High" && e.title && e.date)
    .map((event) => {
      const eventMs = Date.parse(event.date);
      if (Number.isNaN(eventMs)) return null;
      return {
        ...event,
        eventMs,
        is_anchor_high: isAnchorHighEvent(event.title)
      };
    })
    .filter(Boolean);

  if (highEvents.length === 0) {
    return {
      state: "GREEN",
      phase: "none",
      primary_event: null,
      impact_type: null,
      contextual_anchor: false,
      contextual_anchor_names: []
    };
  }

  const primaryEvent = [...highEvents].sort(sortByNearestTime(nowMs))[0];
  const primaryPhase = resolvePhase(primaryEvent.eventMs, nowMs);

  const windowStartMs = primaryEvent.eventMs - PRE_EVENT_WINDOW_MS;
  const windowEndMs = primaryEvent.eventMs + POST_EVENT_WINDOW_MS;
  const sameWindowHighEvents = highEvents.filter(
    (e) => windowStartMs <= e.eventMs && e.eventMs < windowEndMs
  );
  const contextualAnchorEvents =
    primaryEvent && !primaryEvent.is_anchor_high
      ? sameWindowHighEvents.filter(
          (e) => e !== primaryEvent && e.is_anchor_high
        )
      : [];
  const contextualAnchorNames = [...new Set(contextualAnchorEvents.map((e) => e.title))];
  const contextualAnchor = contextualAnchorNames.length > 0;

  const state = primaryPhase ? "RED" : "GREEN";
  const phase = primaryPhase || "none";
  const impact_type = state === "RED" ? (primaryEvent.is_anchor_high ? "anchor_high" : "high") : null;
  const primary_event =
    state === "RED" && primaryEvent
      ? {
          name: primaryEvent.title,
          time: new Date(primaryEvent.eventMs).toISOString()
        }
      : null;

  return {
    state,
    phase,
    primary_event,
    impact_type,
    contextual_anchor: primaryEvent?.is_anchor_high ? false : contextualAnchor,
    contextual_anchor_names: primaryEvent?.is_anchor_high ? [] : contextualAnchorNames
  };
}

module.exports = {
  computeFromRawEvents,
  PRE_EVENT_WINDOW_MS,
  DURING_EVENT_WINDOW_MS,
  POST_EVENT_WINDOW_MS
};
