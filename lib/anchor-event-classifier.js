const fs = require("fs");
const path = require("path");

const ANCHOR_EVENTS_PATH = path.resolve(__dirname, "../data/anchor_events.json");

function normalizeText(value) {
  return String(value || "").toLowerCase().trim();
}

function normalizeForTokenMatch(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function toTokens(value) {
  const normalized = normalizeForTokenMatch(value);
  return normalized ? normalized.split(/\s+/).filter(Boolean) : [];
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
const ANCHOR_COUNTRY_CONSTRAINTS = {
  us_nfp: ["USD", "US"],
  us_cpi_main_release: ["USD", "US"],
  fomc_rate_decision: ["USD", "US"],
  us_gdp_release: ["USD", "US"],
  us_retail_sales_release: ["USD", "US"],
  us_ism_pmi_release: ["USD", "US"],
  ecb_rate_decision: ["EUR", "EU"],
  boe_rate_decision: ["GBP", "UK"],
  boj_rate_decision: ["JPY", "JP"]
};

function matchesAlias(normalizedTitle, normalizedAlias, titleTokens) {
  if (!normalizedTitle || !normalizedAlias) return false;
  if (normalizedAlias.includes(" ")) {
    if (normalizedTitle.includes(normalizedAlias)) return true;
    const aliasTokens = toTokens(normalizedAlias);
    // Deterministic subset match: alias tokens must all be present in title tokens.
    if (aliasTokens.length >= 2 && Array.isArray(titleTokens) && titleTokens.length > 0) {
      return aliasTokens.every((token) => titleTokens.includes(token));
    }
    return false;
  }
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedAlias)}([^a-z0-9]|$)`);
  return re.test(normalizedTitle);
}

function matchesExclude(normalizedTitle, normalizedExclude) {
  if (!normalizedTitle || !normalizedExclude) return false;
  return normalizedTitle.includes(normalizedExclude);
}

function isCountryAllowedForAnchor(anchorKey, countryNorm) {
  const allowedCountries = ANCHOR_COUNTRY_CONSTRAINTS[anchorKey];
  if (!Array.isArray(allowedCountries) || allowedCountries.length === 0) return true;
  // Keep backward compatibility when country is absent.
  if (!countryNorm) return true;
  return allowedCountries.includes(countryNorm);
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
  const titleTokens = toTokens(normalizedTitle);
  const countryNorm = country != null ? String(country || "").trim().toUpperCase() : "";

  for (const anchor of ANCHOR_EVENTS) {
    const matched = anchor.aliases.some((alias) => matchesAlias(normalizedTitle, alias, titleTokens));
    if (!matched) continue;

    const excluded = anchor.exclude && anchor.exclude.some((ex) => matchesExclude(normalizedTitle, ex));
    if (excluded) continue;

    // Apply deterministic country constraints for anchors where geography matters.
    if (!isCountryAllowedForAnchor(anchor.key, countryNorm)) {
      continue;
    }

    // Keep explicit NFP guard for backwards-compatible behavior.
    if (anchor.key === "us_nfp") {
      const isUsCountry = countryNorm === "" || US_COUNTRY_CODES.includes(countryNorm);
      if (!isUsCountry) continue;
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
  const explicitAnchors = events
    .filter((event) => event && (event.is_anchor_high === true || event.is_anchor === true))
    .map((event) => String(event.title || event.name || "").trim())
    .filter(Boolean);

  const normalizedForContext = events
    .map((event) => {
      if (!event || typeof event !== "object") return null;
      const title = String(event.title || event.name || "").trim();
      if (!title) return null;
      return {
        title,
        date: String(event.date || event.time || "").trim(),
        impact: String(event.impact || "High").trim(),
        country: String(event.country || event.currency || "USD").trim().toUpperCase()
      };
    })
    .filter(Boolean);

  const contextualAnchors = classifyAnchorWithContext(normalizedForContext)
    .filter((event) => event && event.is_anchor === true)
    .map((event) => String(event.title || "").trim())
    .filter(Boolean);

  return [...new Set([...explicitAnchors, ...contextualAnchors])];
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
