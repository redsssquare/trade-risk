#!/usr/bin/env node
/**
 * During Event Publication Name — verification against Testing Criteria.
 * Asserts: first line starts with 🔴, contains event name (single) or count (stack),
 * length ≤ 220, no forbidden words.
 * Run: node scripts/test-during-event-name.js
 * Requires Node 14+ (optional chaining in phrases.js).
 */

"use strict";

const { renderTelegramTextTemplate, getDuringEventFirstLine } = require("../services/bridge/render/telegram-render");

const FORBIDDEN_WORDS = [
  "рекомендуем", "будьте", "следите", "критический",
  "экстремальный", "паника", "режим", "уровень", "контроль"
];

function normalize(s) {
  return String(s || "").toLowerCase().trim();
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function run() {
  let passed = 0;
  let failed = 0;

  function pass(id, note) {
    passed++;
    console.log(`  ✓ [${id}] ${note}`);
  }

  function fail(id, reason) {
    failed++;
    console.log(`  ✗ [${id}] FAIL: ${reason}`);
  }

  console.log("\n=== During Event Publication Name — Testing Criteria ===\n");

  // Single high
  {
    const payload = {
      state: "RED",
      phase: "during_event",
      impact_type: "high",
      event_name: "Initial Jobless Claims",
      cluster_size: 1,
      cluster_has_anchor: false,
      cluster_anchor_names: [],
      currencies: ["USD"],
      cluster_events: []
    };
    const text = renderTelegramTextTemplate(payload, {});
    const firstLine = text.split("\n")[0] || "";

    if (!firstLine.startsWith("🔴")) {
      fail("single_high_1", `first line must start with 🔴, got: "${firstLine.slice(0, 50)}"`);
    } else {
      pass("single_high_1", `first line starts with 🔴`);
    }

    const hasName = normalize(firstLine).includes("initial") || normalize(firstLine).includes("jobless") || normalize(firstLine).includes("claims");
    if (!hasName) {
      fail("single_high_2", `first line must contain event name, got: "${firstLine}"`);
    } else {
      pass("single_high_2", `first line contains event name`);
    }

    const hasUsd = normalize(firstLine).includes("usd");
    if (!hasUsd) {
      fail("single_high_3", `first line should contain USD/currency, got: "${firstLine}"`);
    } else {
      pass("single_high_3", `first line contains currency`);
    }

    if (text.length > 220) {
      fail("single_high_4", `length ${text.length} > 220`);
    } else {
      pass("single_high_4", `length=${text.length} ≤ 220`);
    }

    const fw = FORBIDDEN_WORDS.find(w => normalize(text).includes(w));
    if (fw) {
      fail("single_high_5", `forbidden word: ${fw}`);
    } else {
      pass("single_high_5", `no forbidden words`);
    }
  }

  // Single anchor
  {
    const payload = {
      state: "RED",
      phase: "during_event",
      impact_type: "anchor_high",
      event_name: "NFP",
      anchor_label: "NFP",
      cluster_size: 1,
      cluster_has_anchor: false,
      cluster_anchor_names: [],
      currencies: ["USD"],
      cluster_events: []
    };
    const text = renderTelegramTextTemplate(payload, {});
    const firstLine = text.split("\n")[0] || "";

    if (!firstLine.startsWith("🔴")) {
      fail("single_anchor_1", `first line must start with 🔴, got: "${firstLine.slice(0, 50)}"`);
    } else {
      pass("single_anchor_1", `first line starts with 🔴`);
    }

    const hasName = normalize(firstLine).includes("nfp");
    if (!hasName) {
      fail("single_anchor_2", `first line must contain event name (NFP), got: "${firstLine}"`);
    } else {
      pass("single_anchor_2", `first line contains event name`);
    }

    if (text.length > 220) fail("single_anchor_3", `length ${text.length} > 220`);
    else pass("single_anchor_3", `length=${text.length} ≤ 220`);
  }

  // Stack
  {
    const payload = {
      state: "RED",
      phase: "during_event",
      impact_type: "high",
      event_name: "Test Event",
      cluster_size: 3,
      cluster_has_anchor: false,
      cluster_anchor_names: [],
      currencies: ["USD"],
      cluster_events: []
    };
    const text = renderTelegramTextTemplate(payload, {});
    const firstLine = text.split("\n")[0] || "";

    if (!firstLine.startsWith("🔴")) {
      fail("stack_1", `first line must start with 🔴, got: "${firstLine.slice(0, 50)}"`);
    } else {
      pass("stack_1", `first line starts with 🔴`);
    }

    const hasSeries = normalize(firstLine).includes("серия") && normalize(firstLine).includes("публикаций");
    if (!hasSeries) {
      fail("stack_2", `first line must contain "Идёт серия публикаций" pattern, got: "${firstLine}"`);
    } else {
      pass("stack_2", `first line contains "серия публикаций"`);
    }

    const hasCount = firstLine.includes("3") || /серия из \d+ публикаций/.test(firstLine);
    if (!hasCount) {
      fail("stack_3", `first line must contain cluster count (3), got: "${firstLine}"`);
    } else {
      pass("stack_3", `first line contains cluster count`);
    }

    if (text.length > 220) fail("stack_4", `length ${text.length} > 220`);
    else pass("stack_4", `length=${text.length} ≤ 220`);
  }

  // Anchor stack
  {
    const payload = {
      state: "RED",
      phase: "during_event",
      impact_type: "anchor_high",
      event_name: "NFP",
      anchor_label: "NFP",
      cluster_size: 2,
      cluster_has_anchor: true,
      cluster_anchor_names: ["NFP"],
      currencies: ["USD"],
      cluster_events: []
    };
    const text = renderTelegramTextTemplate(payload, {});
    const firstLine = text.split("\n")[0] || "";

    if (!firstLine.startsWith("🔴")) {
      fail("anchor_stack_1", `first line must start with 🔴, got: "${firstLine.slice(0, 50)}"`);
    } else {
      pass("anchor_stack_1", `first line starts with 🔴`);
    }

    const hasSeries = normalize(firstLine).includes("серия") && normalize(firstLine).includes("публикаций");
    const hasName = normalize(firstLine).includes("nfp");
    if (!hasSeries || !hasName) {
      fail("anchor_stack_2", `first line must contain series + anchor name, got: "${firstLine}"`);
    } else {
      pass("anchor_stack_2", `first line contains series and anchor name`);
    }

    if (text.length > 220) fail("anchor_stack_3", `length ${text.length} > 220`);
    else pass("anchor_stack_3", `length=${text.length} ≤ 220`);
  }

  // getDuringEventFirstLine
  {
    const payload = {
      state: "RED",
      phase: "during_event",
      impact_type: "high",
      event_name: "Initial Jobless Claims",
      cluster_size: 1,
      currencies: ["USD"]
    };
    const firstLine = getDuringEventFirstLine(payload);
    if (!firstLine.startsWith("🔴")) {
      fail("getFirstLine_1", `getDuringEventFirstLine must start with 🔴, got: "${firstLine}"`);
    } else {
      pass("getFirstLine_1", `getDuringEventFirstLine starts with 🔴`);
    }
  }

  // Fallback when no event name
  {
    const payload = {
      state: "RED",
      phase: "during_event",
      impact_type: "high",
      event_name: "",
      cluster_size: 1,
      cluster_has_anchor: false,
      cluster_anchor_names: [],
      currencies: [],
      cluster_events: []
    };
    const text = renderTelegramTextTemplate(payload, {});
    const firstLine = text.split("\n")[0] || "";
    if (!firstLine.startsWith("🔴")) {
      fail("fallback_1", `fallback first line must start with 🔴, got: "${firstLine}"`);
    } else {
      pass("fallback_1", `fallback first line starts with 🔴`);
    }
  }

  console.log("\n══════════════════════════════════════════════════");
  if (failed > 0) {
    console.log(`\nDuring Event Publication Name: FAIL (${failed} failed, ${passed} passed)`);
    process.exit(1);
  } else {
    console.log(`\nDuring Event Publication Name: PASS (${passed} passed)`);
    process.exit(0);
  }
}

run();
