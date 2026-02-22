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
const CLUSTER_WINDOW_MIN = 5;
const CLUSTER_WINDOW_MS = CLUSTER_WINDOW_MIN * 60 * 1000;

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

function resolveClusterPhase(clusterStartMs, clusterEndMs, nowMs) {
  if (clusterStartMs - PRE_EVENT_WINDOW_MS <= nowMs && nowMs < clusterStartMs) {
    return "pre_event";
  }
  if (clusterStartMs <= nowMs && nowMs < clusterEndMs + DURING_EVENT_WINDOW_MS) {
    return "during_event";
  }
  if (
    clusterEndMs + DURING_EVENT_WINDOW_MS <= nowMs &&
    nowMs < clusterEndMs + POST_EVENT_WINDOW_MS
  ) {
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

function buildEventClusters(events) {
  const sorted = [...events].sort((a, b) => a.eventMs - b.eventMs);
  const clusters = [];
  for (const event of sorted) {
    const prevCluster = clusters[clusters.length - 1];
    if (!prevCluster) {
      clusters.push({
        events: [event],
        clusterStartMs: event.eventMs,
        clusterEndMs: event.eventMs
      });
      continue;
    }
    const prevEvent = prevCluster.events[prevCluster.events.length - 1];
    if (event.eventMs - prevEvent.eventMs <= CLUSTER_WINDOW_MS) {
      prevCluster.events.push(event);
      prevCluster.clusterEndMs = event.eventMs;
      continue;
    }
    clusters.push({
      events: [event],
      clusterStartMs: event.eventMs,
      clusterEndMs: event.eventMs
    });
  }
  return clusters;
}

function sortClustersByNearestEvent(nowMs) {
  return (a, b) => {
    const nearestA = [...a.events].sort(sortByNearestTime(nowMs))[0];
    const nearestB = [...b.events].sort(sortByNearestTime(nowMs))[0];
    const distanceA = nearestA ? Math.abs(nearestA.eventMs - nowMs) : Number.MAX_SAFE_INTEGER;
    const distanceB = nearestB ? Math.abs(nearestB.eventMs - nowMs) : Number.MAX_SAFE_INTEGER;
    if (distanceA !== distanceB) return distanceA - distanceB;
    return a.clusterStartMs - b.clusterStartMs;
  };
}

/**
 * Compute volatility state from raw events.
 * @param {number} nowMs - Current time in milliseconds (simulation or real)
 * @param {Array<{title: string, date: string, impact: string, currency?: string}>} events - Raw events
 * @returns {{ state: string, phase: string, primary_event: object|null, impact_type: string|null, contextual_anchor: boolean, contextual_anchor_names: string[], cluster_size: number, cluster_events: object[], cluster_window_min: number }}
 */
function computeFromRawEvents(nowMs, events) {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      state: "GREEN",
      phase: "none",
      primary_event: null,
      impact_type: null,
      contextual_anchor: false,
      contextual_anchor_names: [],
      cluster_size: 0,
      cluster_events: [],
      cluster_window_min: CLUSTER_WINDOW_MIN
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
      contextual_anchor_names: [],
      cluster_size: 0,
      cluster_events: [],
      cluster_window_min: CLUSTER_WINDOW_MIN
    };
  }

  const clusters = buildEventClusters(highEvents);
  const activeClusters = clusters
    .map((cluster) => ({
      ...cluster,
      phase: resolveClusterPhase(cluster.clusterStartMs, cluster.clusterEndMs, nowMs)
    }))
    .filter((cluster) => cluster.phase !== null)
    .sort(sortClustersByNearestEvent(nowMs));

  const primaryCluster = activeClusters[0] || null;
  const primaryEvent = primaryCluster
    ? [...primaryCluster.events].sort(sortByNearestTime(nowMs))[0]
    : null;
  const primaryPhase = primaryCluster ? primaryCluster.phase : null;
  const contextualAnchorEvents =
    primaryEvent && !primaryEvent.is_anchor_high && primaryCluster
      ? primaryCluster.events.filter(
          (e) => e !== primaryEvent && e.is_anchor_high
        )
      : [];
  const contextualAnchorNames = [...new Set(contextualAnchorEvents.map((e) => e.title))];
  const clusterEvents = primaryCluster
    ? primaryCluster.events.map((event) => ({
        name: event.title,
        time: new Date(event.eventMs).toISOString(),
        impact: event.impact
      }))
    : [];
  const clusterSize = clusterEvents.length;
  const contextualAnchor = contextualAnchorNames.length > 0;

  const state = primaryPhase ? "RED" : "GREEN";
  const phase = primaryPhase || "none";
  const impact_type = state === "RED" ? (primaryEvent && primaryEvent.is_anchor_high ? "anchor_high" : "high") : null;
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
    contextual_anchor: primaryEvent && primaryEvent.is_anchor_high ? false : contextualAnchor,
    contextual_anchor_names: primaryEvent && primaryEvent.is_anchor_high ? [] : contextualAnchorNames,
    cluster_size: clusterSize,
    cluster_events: clusterEvents,
    cluster_window_min: CLUSTER_WINDOW_MIN
  };
}

module.exports = {
  computeFromRawEvents,
  PRE_EVENT_WINDOW_MS,
  DURING_EVENT_WINDOW_MS,
  POST_EVENT_WINDOW_MS,
  CLUSTER_WINDOW_MIN,
  CLUSTER_WINDOW_MS
};
