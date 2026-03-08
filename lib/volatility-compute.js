/**
 * Volatility window computation logic.
 * Extracted from n8n "Compute Volatility State" workflow for reuse in tests.
 */
const {
  classifyImpactTypeForEvent,
  classifyAnchorWithContext,
  getClusterAnchorNames
} = require("./anchor-event-classifier");

const PRE_EVENT_WINDOW_MS = 15 * 60 * 1000;
const DURING_EVENT_WINDOW_MS = 5 * 60 * 1000;
const CLUSTER_WINDOW_MIN = 5;
const CLUSTER_WINDOW_MS = CLUSTER_WINDOW_MIN * 60 * 1000;

function resolveClusterPhase(clusterStartMs, clusterEndMs, nowMs) {
  if (clusterStartMs - PRE_EVENT_WINDOW_MS <= nowMs && nowMs < clusterStartMs) {
    return "pre_event";
  }
  if (clusterStartMs <= nowMs && nowMs < clusterEndMs + DURING_EVENT_WINDOW_MS) {
    return "during_event";
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
 * @returns {{ state: string, phase: string, primary_event: object|null, impact_type: string|null, anchor_label: string|null, contextual_anchor: boolean, contextual_anchor_names: string[], cluster_has_anchor: boolean, cluster_anchor_names: string[], cluster_size: number, cluster_events: object[], cluster_window_min: number }}
 */
function computeFromRawEvents(nowMs, events) {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      state: "GREEN",
      phase: "none",
      primary_event: null,
      impact_type: null,
      anchor_label: null,
      contextual_anchor: false,
      contextual_anchor_names: [],
      cluster_has_anchor: false,
      cluster_anchor_names: [],
      cluster_size: 0,
      cluster_events: [],
      cluster_window_min: CLUSTER_WINDOW_MIN
    };
  }

  const highImpactRaw = events
    .filter((e) => e && e.impact === "High" && e.title && e.date)
    .map((e) => ({
      title: e.title,
      date: e.date,
      impact: e.impact,
      country: e.currency || e.country || "USD"
    }));

  const withContext = classifyAnchorWithContext(highImpactRaw);

  const highEvents = withContext
    .map((event) => {
      const eventMs = Date.parse(event.date);
      if (Number.isNaN(eventMs)) return null;
      return {
        ...event,
        eventMs,
        is_anchor_high: event.is_anchor === true,
        anchor_label: event.anchor_label || null
      };
    })
    .filter(Boolean);

  if (highEvents.length === 0) {
    return {
      state: "GREEN",
      phase: "none",
      primary_event: null,
      impact_type: null,
      anchor_label: null,
      contextual_anchor: false,
      contextual_anchor_names: [],
      cluster_has_anchor: false,
      cluster_anchor_names: [],
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
  const clusterAnchorNames = primaryCluster ? getClusterAnchorNames(primaryCluster.events) : [];
  const clusterHasAnchor = clusterAnchorNames.length > 0;
  const contextualAnchorNames =
    primaryEvent && !primaryEvent.is_anchor_high ? clusterAnchorNames : [];
  const clusterEvents = primaryCluster
    ? primaryCluster.events.map((event) => ({
        name: event.title,
        time: new Date(event.eventMs).toISOString(),
        impact: event.impact,
        currency: event.currency || event.country || null
      }))
    : [];
  const clusterSize = clusterEvents.length;
  const contextualAnchor = contextualAnchorNames.length > 0;
  const primaryIsAnchorHigh = !!(primaryEvent && primaryEvent.is_anchor_high);

  const state = primaryPhase ? "RED" : "GREEN";
  const phase = primaryPhase || "none";
  const impact_type = state === "RED"
    ? (clusterHasAnchor ? "anchor_high" : "high")
    : null;
  const anchor_label = state === "RED" && clusterHasAnchor
    ? (primaryIsAnchorHigh
      ? (primaryEvent.anchor_label || clusterAnchorNames[0] || null)
      : (clusterAnchorNames[0] || null))
    : null;
  const primary_event =
    state === "RED" && primaryEvent
      ? {
          name: primaryEvent.title,
          time: new Date(primaryEvent.eventMs).toISOString()
        }
      : null;

  const currency = primaryEvent && (primaryEvent.currency || primaryEvent.country)
    ? String(primaryEvent.currency || primaryEvent.country).trim().toUpperCase()
    : null;

  return {
    state,
    phase,
    primary_event,
    impact_type,
    anchor_label,
    currency,
    contextual_anchor: state === "RED" ? (!primaryIsAnchorHigh && contextualAnchor) : false,
    contextual_anchor_names: state === "RED" && !primaryIsAnchorHigh ? contextualAnchorNames : [],
    cluster_has_anchor: clusterHasAnchor,
    cluster_anchor_names: clusterAnchorNames,
    cluster_size: clusterSize,
    cluster_events: clusterEvents,
    cluster_window_min: CLUSTER_WINDOW_MIN
  };
}

module.exports = {
  computeFromRawEvents,
  PRE_EVENT_WINDOW_MS,
  DURING_EVENT_WINDOW_MS,
  CLUSTER_WINDOW_MIN,
  CLUSTER_WINDOW_MS
};
