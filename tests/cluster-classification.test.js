"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const { classifyAnchorWithContext } = require("../lib/anchor-event-classifier");

function deriveClusterFlags(classified) {
  const cluster_has_anchor = classified.some((e) => e && e.is_anchor === true);
  const impact_type = cluster_has_anchor ? "anchor_high" : "high";
  return { cluster_has_anchor, impact_type };
}

describe("cluster classification", () => {
  it("CPI m/m + Retail Sales m/m (same date) → cluster_has_anchor true, impact_type anchor_high", () => {
    const events = [
      { title: "CPI m/m", date: "2025-03-12", country: "USD", impact: "High" },
      { title: "Retail Sales m/m", date: "2025-03-12", country: "USD", impact: "High" }
    ];
    const classified = classifyAnchorWithContext(events);
    const { cluster_has_anchor, impact_type } = deriveClusterFlags(classified);
    assert.strictEqual(cluster_has_anchor, true);
    assert.strictEqual(impact_type, "anchor_high");
  });

  it("Unemployment Claims + CPI m/m → cluster_has_anchor true", () => {
    const events = [
      { title: "Unemployment Claims", date: "2025-03-13", country: "USD", impact: "High" },
      { title: "CPI m/m", date: "2025-03-13", country: "USD", impact: "High" }
    ];
    const classified = classifyAnchorWithContext(events);
    const { cluster_has_anchor } = deriveClusterFlags(classified);
    assert.strictEqual(cluster_has_anchor, true);
  });

  it("Unemployment Claims + JOLTS Job Openings → cluster_has_anchor false, impact_type high", () => {
    const events = [
      { title: "Unemployment Claims", date: "2025-03-14", country: "USD", impact: "High" },
      { title: "JOLTS Job Openings", date: "2025-03-14", country: "USD", impact: "High" }
    ];
    const classified = classifyAnchorWithContext(events);
    const { cluster_has_anchor, impact_type } = deriveClusterFlags(classified);
    assert.strictEqual(cluster_has_anchor, false);
    assert.strictEqual(impact_type, "high");
  });
});
