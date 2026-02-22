#!/usr/bin/env node
const { renderTelegramTextTemplate } = require("../services/bridge/render/telegram-render");

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error([
      `Case failed: ${label}`,
      `Expected: ${expected}`,
      `Actual:   ${actual}`
    ].join("\n"));
  }
}

function run() {
  const cases = [
    {
      label: "cluster without anchor",
      payload: {
        state: "RED",
        impact_type: "high",
        phase: "pre_event",
        minutes_to_event: 12,
        event_name: "US Retail Sales",
        cluster_size: 3,
        cluster_has_anchor: false,
        cluster_anchor_names: []
      },
      expectedText: "🔴 Через 12 минут выходит сразу несколько важных данных."
    },
    {
      label: "cluster with anchor",
      payload: {
        state: "RED",
        impact_type: "high",
        phase: "pre_event",
        minutes_to_event: 8,
        event_name: "US Retail Sales",
        cluster_size: 2,
        cluster_has_anchor: true,
        cluster_anchor_names: ["Non-Farm Payrolls"]
      },
      expectedText: "🔴 Через 8 минут выходит серия важных публикаций, включая Non-Farm Payrolls."
    }
  ];

  for (const testCase of cases) {
    const firstRender = renderTelegramTextTemplate(testCase.payload);
    const secondRender = renderTelegramTextTemplate(testCase.payload);
    assertEqual(firstRender, secondRender, `${testCase.label} deterministic`);
    assertEqual(firstRender, testCase.expectedText, `${testCase.label} expected text`);
  }

  console.log("render tests passed: deterministic cluster templates");
}

run();
