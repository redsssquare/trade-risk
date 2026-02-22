const fs = require("fs");
const path = require("path");

const ANCHOR_EVENTS_PATH = path.resolve(__dirname, "../data/anchor_events.json");

function normalizeText(value) {
  return String(value || "").toLowerCase().trim();
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadAnchorEventsConfig() {
  try {
    const raw = fs.readFileSync(ANCHOR_EVENTS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const events = parsed && Array.isArray(parsed.anchor_high_events)
      ? parsed.anchor_high_events
      : [];
    return events
      .map((entry) => ({
        key: String(entry && entry.key ? entry.key : "").trim(),
        anchor_label: String(entry && entry.anchor_label ? entry.anchor_label : "").trim(),
        aliases: Array.isArray(entry && entry.aliases)
          ? entry.aliases.map((alias) => normalizeText(alias)).filter(Boolean)
          : []
      }))
      .filter((entry) => entry.aliases.length > 0);
  } catch (_error) {
    return [];
  }
}

const ANCHOR_EVENTS = loadAnchorEventsConfig();

function matchesAlias(normalizedTitle, normalizedAlias) {
  if (!normalizedTitle || !normalizedAlias) return false;
  if (normalizedAlias.includes(" ")) {
    return normalizedTitle.includes(normalizedAlias);
  }
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedAlias)}([^a-z0-9]|$)`);
  return re.test(normalizedTitle);
}

function classifyAnchorByTitle(title) {
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) {
    return { is_anchor: false, anchor_label: null };
  }

  for (const anchor of ANCHOR_EVENTS) {
    const matched = anchor.aliases.some((alias) => matchesAlias(normalizedTitle, alias));
    if (matched) {
      return {
        is_anchor: true,
        anchor_label: anchor.anchor_label || anchor.key || null
      };
    }
  }

  return { is_anchor: false, anchor_label: null };
}

function classifyImpactTypeForEvent({ title, impact }) {
  const normalizedImpact = normalizeText(impact);
  if (normalizedImpact !== "high") {
    return { impact_type: null, anchor_label: null };
  }
  const anchorClassification = classifyAnchorByTitle(title);
  return {
    impact_type: anchorClassification.is_anchor ? "anchor_high" : "high",
    anchor_label: anchorClassification.anchor_label
  };
}

function getClusterAnchorNames(events) {
  if (!Array.isArray(events)) return [];
  return [...new Set(
    events
      .filter((event) => event && event.is_anchor_high === true)
      .map((event) => String(event.title || "").trim())
      .filter(Boolean)
  )];
}

module.exports = {
  classifyAnchorByTitle,
  classifyImpactTypeForEvent,
  getClusterAnchorNames
};
