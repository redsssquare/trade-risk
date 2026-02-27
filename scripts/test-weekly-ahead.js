#!/usr/bin/env node
/**
 * Юнит-тесты Weekly Ahead: проверка payload, formatWeeklyAhead, validateWeeklyAhead.
 * Usage: node scripts/test-weekly-ahead.js
 */

const path = require("path");
const { isWeeklyAheadPayload } = require("../services/bridge/render/weekly-ahead-payload");
const {
  formatWeeklyAhead,
  validateWeeklyAhead,
  getScore,
  getLevelFromScore,
  applyQuietDowngrade,
} = require("../services/bridge/render/weekly-ahead-format");
const { LEVEL_CALM, LEVEL_MODERATE, LEVEL_SATURATED } = require("../services/bridge/render/weekly-ahead-phrases");

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error([`Case failed: ${label}`, `Expected: ${expected}`, `Actual:   ${actual}`].join("\n"));
  }
}

function assertOk(condition, label) {
  if (!condition) {
    throw new Error(`Case failed: ${label} (expected truthy)`);
  }
}

const VALID_PAYLOAD = {
  week_range: "03–07.03",
  high_events: 2,
  anchor_events: 1,
  clusters: 1,
  total_window_minutes: 60,
  active_days: ["Wed"],
  quiet_days_count: 4,
};

function runPayloadTests() {
  assertOk(isWeeklyAheadPayload(VALID_PAYLOAD), "payload: valid");
  assertOk(
    isWeeklyAheadPayload({ ...VALID_PAYLOAD, high_events_per_day: [0, 1, 2, 0, 1] }),
    "payload: valid with high_events_per_day"
  );
  assertEqual(isWeeklyAheadPayload(null), false, "payload: null");
  assertEqual(isWeeklyAheadPayload({}), false, "payload: empty object");
  assertEqual(
    isWeeklyAheadPayload({ ...VALID_PAYLOAD, week_range: 123 }),
    false,
    "payload: week_range not string"
  );
  assertEqual(
    isWeeklyAheadPayload({ ...VALID_PAYLOAD, active_days: "Wed" }),
    false,
    "payload: active_days not array"
  );
  assertEqual(
    isWeeklyAheadPayload({ ...VALID_PAYLOAD, high_events_per_day: [1, 2, 3] }),
    false,
    "payload: high_events_per_day length !== 5"
  );
  assertEqual(
    isWeeklyAheadPayload({ ...VALID_PAYLOAD, high_events_per_day: [1, 2, 3, 4, "x"] }),
    false,
    "payload: high_events_per_day non-number"
  );
  console.log("  payload: ok");
}

function runFormatTests() {
  const calm = { ...VALID_PAYLOAD, high_events: 1, anchor_events: 0, clusters: 0 };
  const moderate = { ...VALID_PAYLOAD, high_events: 4, anchor_events: 1, clusters: 2 };
  const saturated = { ...VALID_PAYLOAD, high_events: 5, anchor_events: 2, clusters: 2, busy_day_bonus: 1 };

  const textCalm = formatWeeklyAhead(calm);
  const textModerate = formatWeeklyAhead(moderate);
  const textSaturated = formatWeeklyAhead(saturated);

  assertOk(textCalm.length > 0, "format: calm non-empty");
  assertOk(validateWeeklyAhead(calm, textCalm).ok, "format: calm text passes validation");
  assertOk(validateWeeklyAhead(moderate, textModerate).ok, "format: moderate text passes validation");
  assertOk(validateWeeklyAhead(saturated, textSaturated).ok, "format: saturated text passes validation");

  assertOk(textCalm.includes("Ритм недели"), "format: has header");
  assertOk(textCalm.includes("Запланированы") || textCalm.includes("публикация"), "format: has high-events line");

  assertEqual(getScore({ anchor_events: 0, high_events: 1, clusters: 0, busy_day_bonus: 0 }), 1, "getScore: calm");
  assertEqual(getScore({ anchor_events: 1, high_events: 2, clusters: 1, busy_day_bonus: 0 }), 7, "getScore: moderate");
  assertEqual(getScore({ anchor_events: 2, high_events: 2, clusters: 2, busy_day_bonus: 1 }), 13, "getScore: saturated");

  assertEqual(getLevelFromScore(2), LEVEL_CALM, "getLevelFromScore: calm");
  assertEqual(getLevelFromScore(7), LEVEL_MODERATE, "getLevelFromScore: moderate");
  assertEqual(getLevelFromScore(12), LEVEL_SATURATED, "getLevelFromScore: saturated");

  assertEqual(applyQuietDowngrade(LEVEL_SATURATED, 3), LEVEL_MODERATE, "applyQuietDowngrade: saturated->moderate");
  assertEqual(applyQuietDowngrade(LEVEL_MODERATE, 3), LEVEL_CALM, "applyQuietDowngrade: moderate->calm");
  assertEqual(applyQuietDowngrade(LEVEL_SATURATED, 2), LEVEL_SATURATED, "applyQuietDowngrade: no downgrade when q<3");

  console.log("  format: ok");
}

function runValidateTests() {
  const payload = { ...VALID_PAYLOAD };
  const validText = formatWeeklyAhead(payload);
  const validation = validateWeeklyAhead(payload, validText);
  assertOk(validation.ok, "validate: formatted text passes");

  assertEqual(validateWeeklyAhead(payload, "").ok, false, "validate: empty text fails");
  assertEqual(validateWeeklyAhead(payload, "").reason, "empty_text", "validate: empty_text reason");

  const wrongLevelText = "Какой-то текст без подстроки уровня.";
  assertEqual(validateWeeklyAhead(payload, wrongLevelText).ok, false, "validate: no level substring fails");
  assertEqual(validateWeeklyAhead(payload, wrongLevelText).reason, "level_mismatch", "validate: level_mismatch reason");

  const withForbidden = validText + "\nРекомендуем следить.";
  const forbiddenResult = validateWeeklyAhead(payload, withForbidden);
  assertEqual(forbiddenResult.ok, false, "validate: forbidden word fails");
  assertOk(
    forbiddenResult.reason && forbiddenResult.reason.startsWith("forbidden_word:"),
    "validate: forbidden_word reason"
  );

  console.log("  validate: ok");
}

function run() {
  console.log("test-weekly-ahead:");
  runPayloadTests();
  runFormatTests();
  runValidateTests();
  console.log("All weekly-ahead tests passed.");
}

run();
