"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const { classifyImpactTypeForEvent } = require("../lib/anchor-event-classifier");

describe("classifyImpactTypeForEvent", () => {
  it("CPI m/m USD High → anchor_high, US CPI", () => {
    const result = classifyImpactTypeForEvent({
      title: "CPI m/m",
      country: "USD",
      impact: "High"
    });
    assert.strictEqual(result.impact_type, "anchor_high");
    assert.strictEqual(result.anchor_label, "US CPI");
  });

  it("Retail Sales m/m USD High → anchor_high, US Retail Sales", () => {
    const result = classifyImpactTypeForEvent({
      title: "Retail Sales m/m",
      country: "USD",
      impact: "High"
    });
    assert.strictEqual(result.impact_type, "anchor_high");
    assert.strictEqual(result.anchor_label, "US Retail Sales");
  });

  it("ISM Manufacturing PMI USD High → anchor_high, US ISM PMI", () => {
    const result = classifyImpactTypeForEvent({
      title: "ISM Manufacturing PMI",
      country: "USD",
      impact: "High"
    });
    assert.strictEqual(result.impact_type, "anchor_high");
    assert.strictEqual(result.anchor_label, "US ISM PMI");
  });

  it("Non-Farm Employment Change USD High → anchor_high, NFP", () => {
    const result = classifyImpactTypeForEvent({
      title: "Non-Farm Employment Change",
      country: "USD",
      impact: "High"
    });
    assert.strictEqual(result.impact_type, "anchor_high");
    assert.strictEqual(result.anchor_label, "NFP");
  });

  it("Unemployment Claims USD High → high, anchor_label null", () => {
    const result = classifyImpactTypeForEvent({
      title: "Unemployment Claims",
      country: "USD",
      impact: "High"
    });
    assert.strictEqual(result.impact_type, "high");
    assert.strictEqual(result.anchor_label, null);
  });

  it("ADP Non-Farm Employment Change USD High → high (excluded from NFP)", () => {
    const result = classifyImpactTypeForEvent({
      title: "ADP Non-Farm Employment Change",
      country: "USD",
      impact: "High"
    });
    assert.strictEqual(result.impact_type, "high");
    assert.strictEqual(result.anchor_label, null);
  });
});
