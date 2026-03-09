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
      name: "high non-anchor: Unemployment Claims => high",
      now: "2026-03-03T11:58:00Z",
      events: [toEvent("Unemployment Claims", "2026-03-03T12:00:00Z")],
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
        toEvent("JOLTS Job Openings", "2026-03-03T09:05:00Z"),
        toEvent("Non-Farm Payrolls", "2026-03-03T09:07:00Z"),
        toEvent("US Jobless Claims", "2026-03-03T09:09:00Z")
      ],
      check: (result) =>
        result.cluster_has_anchor === true &&
        result.contextual_anchor === true &&
        Array.isArray(result.cluster_anchor_names) &&
        result.cluster_anchor_names.includes("Non-Farm Payrolls") &&
        (result.impact_type === "high" || result.impact_type === "anchor_high")
    },
    {
      name: "ADP Nonfarm Employment Change => high (excluded from NFP)",
      now: "2026-03-03T12:58:00Z",
      events: [toEvent("ADP Nonfarm Employment Change", "2026-03-03T13:00:00Z", "High", "USD")],
      check: (result) =>
        result.impact_type === "high" &&
        result.anchor_label === null
    },
    {
      name: "Change in Nonfarm Payrolls USD => anchor",
      now: "2026-03-03T13:28:00Z",
      events: [toEvent("Change in Nonfarm Payrolls", "2026-03-03T13:30:00Z", "High", "USD")],
      check: (result) =>
        result.impact_type === "anchor_high" &&
        (result.anchor_label === "NFP" || result.anchor_label === "Non-Farm Payrolls")
    },
    {
      name: "Unemployment Rate + Average Hourly Earnings same slot => both anchor",
      now: "2026-03-07T13:28:00Z",
      events: [
        toEvent("Unemployment Rate", "2026-03-07T13:30:00Z", "High", "USD"),
        toEvent("Average Hourly Earnings", "2026-03-07T13:30:00Z", "High", "USD")
      ],
      check: (result) =>
        result.impact_type === "anchor_high" &&
        result.cluster_has_anchor === true &&
        Array.isArray(result.cluster_anchor_names) &&
        result.cluster_anchor_names.length >= 2 &&
        result.cluster_anchor_names.includes("Unemployment Rate") &&
        result.cluster_anchor_names.includes("Average Hourly Earnings")
    },
    {
      name: "ECB Rate Decision EUR => anchor_high",
      now: "2026-03-03T12:28:00Z",
      events: [toEvent("ECB Rate Decision", "2026-03-03T12:30:00Z", "High", "EUR")],
      check: (result) =>
        result.impact_type === "anchor_high" &&
        result.anchor_label === "ECB Rate Decision"
    },
    {
      name: "CPI m/m EUR => high (country constraint, anchor only for USD)",
      now: "2026-03-03T12:28:00Z",
      events: [toEvent("CPI m/m", "2026-03-03T12:30:00Z", "High", "EUR")],
      check: (result) =>
        result.impact_type === "high" &&
        result.anchor_label === null
    },
    {
      name: "Retail Sales m/m USD => anchor_high",
      now: "2026-03-03T12:28:00Z",
      events: [toEvent("Retail Sales m/m", "2026-03-03T12:30:00Z", "High", "USD")],
      check: (result) =>
        result.impact_type === "anchor_high" &&
        (result.anchor_label === "US Retail Sales" || result.anchor_label === "Retail Sales")
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
