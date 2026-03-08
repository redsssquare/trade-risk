"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const { computeFromRawEvents } = require("../lib/volatility-compute");

function toEvent(title, date, impact = "High", currency = "USD") {
  return { title, date, impact, currency };
}

describe("volatility window", () => {
  const EVENT_TIME = "2026-03-03T14:00:00Z";
  const eventMs = Date.parse(EVENT_TIME);

  it("now = event - 16 min, 1 anchor → phase none (GREEN), impact_type null", () => {
    const now = new Date(eventMs - 16 * 60 * 1000).toISOString();
    const nowMs = Date.parse(now);
    const events = [toEvent("CPI m/m", EVENT_TIME)];
    const result = computeFromRawEvents(nowMs, events);
    assert.strictEqual(result.phase, "none");
    assert.strictEqual(result.state, "GREEN");
    assert.strictEqual(result.impact_type, null);
  });

  it("now = event - 14 min, 1 anchor → phase pre_event, impact_type anchor_high", () => {
    const nowMs = eventMs - 14 * 60 * 1000;
    const events = [toEvent("CPI m/m", EVENT_TIME)];
    const result = computeFromRawEvents(nowMs, events);
    assert.strictEqual(result.phase, "pre_event");
    assert.strictEqual(result.impact_type, "anchor_high");
  });

  it("now = event + 2 min, 1 anchor → phase during_event, impact_type anchor_high", () => {
    const nowMs = eventMs + 2 * 60 * 1000;
    const events = [toEvent("CPI m/m", EVENT_TIME)];
    const result = computeFromRawEvents(nowMs, events);
    assert.strictEqual(result.phase, "during_event");
    assert.strictEqual(result.impact_type, "anchor_high");
  });

  it("now = event + 6 min, 1 anchor → phase none (GREEN), post_event removed", () => {
    const nowMs = eventMs + 6 * 60 * 1000;
    const events = [toEvent("CPI m/m", EVENT_TIME)];
    const result = computeFromRawEvents(nowMs, events);
    assert.strictEqual(result.phase, "none");
    assert.strictEqual(result.state, "GREEN");
    assert.strictEqual(result.impact_type, null);
  });

  it("now = event + 21 min, 1 anchor → phase none (GREEN), impact_type null", () => {
    const nowMs = eventMs + 21 * 60 * 1000;
    const events = [toEvent("CPI m/m", EVENT_TIME)];
    const result = computeFromRawEvents(nowMs, events);
    assert.strictEqual(result.phase, "none");
    assert.strictEqual(result.state, "GREEN");
    assert.strictEqual(result.impact_type, null);
  });

  it("now = event - 10 min, 2 events (cluster) → phase pre_event, impact_type anchor_high or high+contextual", () => {
    const event2Time = "2026-03-03T14:03:00Z";
    const nowMs = eventMs - 10 * 60 * 1000;
    const events = [
      toEvent("CPI m/m", EVENT_TIME),
      toEvent("Retail Sales m/m", event2Time)
    ];
    const result = computeFromRawEvents(nowMs, events);
    assert.strictEqual(result.phase, "pre_event");
    assert.ok(
      result.impact_type === "anchor_high" || (result.impact_type === "high" && result.contextual_anchor === true),
      `expected anchor_high or high+contextual, got impact_type=${result.impact_type} contextual_anchor=${result.contextual_anchor}`
    );
    assert.strictEqual(result.cluster_has_anchor, true);
  });
});
