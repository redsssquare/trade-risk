"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const { renderTelegramTextTemplate } = require("../services/bridge/render/telegram-render");

describe("renderTelegramTextTemplate", () => {
  it("anchor event: state RED, impact_type anchor_high, phase pre_event, cluster_size 1 → output contains ⚡", () => {
    const payload = {
      state: "RED",
      impact_type: "anchor_high",
      phase: "pre_event",
      cluster_size: 1,
      minutes_to_event: 15,
      anchor_label: "US CPI",
    };
    const output = renderTelegramTextTemplate(payload);
    assert.ok(output.includes("⚡"), `Expected output to contain ⚡, got: ${output}`);
  });

  it("high event: state RED, impact_type high, phase pre_event, cluster_size 1 → output contains ⏳", () => {
    const payload = {
      state: "RED",
      impact_type: "high",
      phase: "pre_event",
      cluster_size: 1,
      minutes_to_event: 10,
    };
    const output = renderTelegramTextTemplate(payload);
    assert.ok(output.includes("⏳"), `Expected output to contain ⏳, got: ${output}`);
  });

  it("anchor cluster: state RED, cluster_has_anchor true, cluster_size 2, phase pre_event → output contains ⚡", () => {
    const payload = {
      state: "RED",
      cluster_has_anchor: true,
      cluster_size: 2,
      phase: "pre_event",
      minutes_to_event: 20,
      cluster_anchor_names: ["US CPI"],
    };
    const output = renderTelegramTextTemplate(payload);
    assert.ok(output.includes("⚡"), `Expected output to contain ⚡, got: ${output}`);
  });
});
