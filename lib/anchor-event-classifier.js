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
          : [],
        exclude: Array.isArray(entry && entry.exclude)
          ? entry.exclude.map((ex) => normalizeText(ex)).filter(Boolean)
          : []
      }))
      .filter((entry) => entry.aliases.length > 0);
  } catch (_error) {
    return [];
  }
}

const ANCHOR_EVENTS = loadAnchorEventsConfig();
const NFP_ANCHOR_LABEL = (ANCHOR_EVENTS.find((e) => e.key === "us_nfp") || {}).anchor_label || "NFP";

function matchesAlias(normalizedTitle, normalizedAlias) {
  if (!normalizedTitle || !normalizedAlias) return false;
  if (normalizedAlias.includes(" ")) {
    return normalizedTitle.includes(normalizedAlias);
  }
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedAlias)}([^a-z0-9]|$)`);
  return re.test(normalizedTitle);
}

function matchesExclude(normalizedTitle, normalizedExclude) {
  if (!normalizedTitle || !normalizedExclude) return false;
  return normalizedTitle.includes(normalizedExclude);
}

const US_COUNTRY_CODES = ["USD", "US"];

/**
 * Returns true if the given ISO date string falls on the first Friday of the month.
 * Used as additional signal for NFP detection (NFP typically releases first Friday).
 * @param {string} dateIso - ISO date string (e.g. "2025-03-07")
 * @returns {boolean}
 */
function isFirstFridayOfMonth(dateIso) {
  if (!dateIso || typeof dateIso !== "string") return false;
  const d = new Date(dateIso.trim());
  if (Number.isNaN(d.getTime())) return false;
  return d.getDay() === 5 && d.getDate() <= 7;
}

function classifyAnchorByTitle(title, country) {
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) {
    return { is_anchor: false, anchor_label: null };
  }

  for (const anchor of ANCHOR_EVENTS) {
    const matched = anchor.aliases.some((alias) => matchesAlias(normalizedTitle, alias));
    if (!matched) continue;

    const excluded = anchor.exclude && anchor.exclude.some((ex) => matchesExclude(normalizedTitle, ex));
    if (excluded) continue;

    // NFP (us_nfp) is anchor only when country is USD/US or absent (backward compatibility)
    if (anchor.key === "us_nfp") {
      const countryNorm = country != null ? String(country || "").trim().toUpperCase() : "";
      const isUsCountry = countryNorm === "" || US_COUNTRY_CODES.includes(countryNorm);
      if (!isUsCountry) {
        return { is_anchor: false, anchor_label: null };
      }
    }

    return {
      is_anchor: true,
      anchor_label: anchor.anchor_label || anchor.key || null
    };
  }

  return { is_anchor: false, anchor_label: null };
}

function classifyImpactTypeForEvent({ title, impact, country }) {
  const normalizedImpact = normalizeText(impact);
  if (normalizedImpact !== "high") {
    return { impact_type: null, anchor_label: null };
  }
  const anchorClassification = classifyAnchorByTitle(title, country);
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

/**
 * Classify events with context: apply initial impact classification, then NFP package rule.
 * If Unemployment Rate and Average Hourly Earnings (country=USD) are in the same time slot,
 * all events in that slot are marked as NFP anchor.
 * @param {Array<{title: string, date: string, country?: string, impact?: string}>} events
 * @returns {Array} Events with impact_type, anchor_label, is_anchor added/overridden
 */
function classifyAnchorWithContext(events) {
  if (!Array.isArray(events)) return [];

  const withInitial = events.map((item) => {
    const country = item.country || "USD";
    const { impact_type, anchor_label } = classifyImpactTypeForEvent({
      title: item.title || "",
      impact: item.impact || "",
      country
    });
    return {
      ...item,
      impact_type: impact_type || "high",
      anchor_label: anchor_label || null,
      is_anchor: impact_type === "anchor_high"
    };
  });

  const byDate = new Map();
  for (const ev of withInitial) {
    const key = ev.date ? String(ev.date).trim() : "";
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(ev);
  }

  for (const group of byDate.values()) {
    const hasUnemployment = group.some((e) => {
      const t = normalizeText(e.title || "");
      const c = (e.country || "USD").toUpperCase();
      return t.includes("unemployment rate") && (c === "USD" || c === "US");
    });
    const hasEarnings = group.some((e) => {
      const t = normalizeText(e.title || "");
      const c = (e.country || "USD").toUpperCase();
      return t.includes("average hourly earnings") && (c === "USD" || c === "US");
    });
    if (hasUnemployment && hasEarnings) {
      for (const ev of group) {
        ev.is_anchor = true;
        ev.anchor_label = NFP_ANCHOR_LABEL;
        ev.impact_type = "anchor_high";
      }
      continue;
    }

    // Additional signal: first Friday + Employment Change/Nonfarm + USD → boost NFP in edge cases
    const dateKey = (group[0] && group[0].date) ? String(group[0].date).trim() : "";
    if (!isFirstFridayOfMonth(dateKey)) continue;
    const hasEmploymentOrNonfarm = group.some((e) => {
      const t = normalizeText(e.title || "");
      const c = (e.country || "USD").toUpperCase();
      if (t.includes("adp") || t.includes("private nonfarm") || t.includes("private payrolls")) return false;
      return (t.includes("employment change") || t.includes("nonfarm")) && (c === "USD" || c === "US");
    });
    if (hasEmploymentOrNonfarm) {
      for (const ev of group) {
        ev.is_anchor = true;
        ev.anchor_label = NFP_ANCHOR_LABEL;
        ev.impact_type = "anchor_high";
      }
    }
  }

  return withInitial;
}

module.exports = {
  classifyAnchorByTitle,
  classifyImpactTypeForEvent,
  classifyAnchorWithContext,
  getClusterAnchorNames
};
