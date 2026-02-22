#!/usr/bin/env node

const { computeFromRawEvents } = require("../lib/volatility-compute");

function toEvent(title, date, impact = "High", currency = "USD") {
  return { title, date, impact, currency };
}

function assertCase(name, condition, details) {
  if (!condition) {
    console.error(`FAIL: ${name}`);
    if (details) {
      console.error(JSON.stringify(details, null, 2));
    }
    return false;
  }
  console.log(`PASS: ${name}`);
  return true;
}

function run() {
  const cases = [
    {
      name: "anchor match: NFP => anchor_high",
      now: "2026-03-03T12:58:00Z",
      events: [toEvent("Non-Farm Payrolls", "2026-03-03T13:00:00Z")],
      check: (result) =>
        result.impact_type === "anchor_high" &&
        result.anchor_label === "NFP"
    },
    {
      name: "high non-anchor: Retail Sales => high",
      now: "2026-03-03T11:58:00Z",
      events: [toEvent("US Retail Sales", "2026-03-03T12:00:00Z")],
      check: (result) =>
        result.impact_type === "high" &&
        result.anchor_label === null
    },
    {
      name: "ambiguous title: FOMC Minutes should stay high",
      now: "2026-03-03T15:58:00Z",
      events: [toEvent("FOMC Meeting Minutes", "2026-03-03T16:00:00Z")],
      check: (result) =>
        result.impact_type === "high" &&
        result.anchor_label === null
    },
    {
      name: "series cluster: anchor inside cluster exposed in LLM context fields",
      now: "2026-03-03T09:04:00Z",
      events: [
        toEvent("US ISM Services", "2026-03-03T09:05:00Z"),
        toEvent("Non-Farm Payrolls", "2026-03-03T09:07:00Z"),
        toEvent("US Jobless Claims", "2026-03-03T09:09:00Z")
      ],
      check: (result) =>
        result.impact_type === "high" &&
        result.cluster_has_anchor === true &&
        Array.isArray(result.cluster_anchor_names) &&
        result.cluster_anchor_names.includes("Non-Farm Payrolls")
    }
  ];

  let failed = 0;
  for (const testCase of cases) {
    const nowMs = Date.parse(testCase.now);
    const result = computeFromRawEvents(nowMs, testCase.events);
    const ok = assertCase(testCase.name, testCase.check(result), result);
    if (!ok) failed++;
  }

  if (failed > 0) {
    process.exit(1);
  }
}

run();
