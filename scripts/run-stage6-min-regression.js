#!/usr/bin/env node
/**
 * Stage 6 minimal regression runner.
 * Validates fixture steps against compute output and send/no-send transition rule.
 */
const fs = require("fs");
const path = require("path");
const { computeFromRawEvents } = require("../lib/volatility-compute");

const FIXTURES_DIR = path.resolve(__dirname, "../docs/fixtures/stage6");

function readFixtures() {
  if (!fs.existsSync(FIXTURES_DIR)) {
    throw new Error(`fixtures directory not found: ${FIXTURES_DIR}`);
  }
  const files = fs.readdirSync(FIXTURES_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort();
  if (files.length === 0) {
    throw new Error(`no fixture files found in: ${FIXTURES_DIR}`);
  }
  return files.map((name) => {
    const fullPath = path.join(FIXTURES_DIR, name);
    const raw = fs.readFileSync(fullPath, "utf8");
    const parsed = JSON.parse(raw);
    return { file: name, fullPath, data: parsed };
  });
}

function assertScenarioShape(scenario, file) {
  if (!scenario || typeof scenario !== "object") {
    throw new Error(`${file}: scenario must be an object`);
  }
  if (!Array.isArray(scenario.events)) {
    throw new Error(`${file}: "events" must be an array`);
  }
  if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
    throw new Error(`${file}: "steps" must be a non-empty array`);
  }
}

function buildActual(result, previousActualState) {
  const state = result && result.state ? result.state : "GREEN";
  const phase = result && result.phase ? result.phase : "none";
  const eventName = result && result.primary_event && result.primary_event.name
    ? result.primary_event.name
    : null;
  const send = previousActualState === null
    ? true
    : (previousActualState.state !== state || previousActualState.phase !== phase);

  return {
    state,
    phase,
    event_name: eventName,
    send
  };
}

function diffExpectedActual(expected, actual) {
  const diffs = [];
  if (expected.state !== actual.state) diffs.push(`state expected=${expected.state} actual=${actual.state}`);
  if (expected.phase !== actual.phase) diffs.push(`phase expected=${expected.phase} actual=${actual.phase}`);
  if (expected.event_name !== actual.event_name) {
    diffs.push(`event_name expected=${String(expected.event_name)} actual=${String(actual.event_name)}`);
  }
  if (expected.send !== actual.send) diffs.push(`send expected=${expected.send} actual=${actual.send}`);
  return diffs;
}

function runScenario(scenario, file) {
  assertScenarioShape(scenario, file);
  const scenarioLabel = scenario.scenario_id || file;
  console.log(`=== Scenario: ${scenarioLabel} (${file}) ===`);
  let previousActual = null;
  let failed = 0;

  for (let i = 0; i < scenario.steps.length; i++) {
    const step = scenario.steps[i];
    const stepNo = i + 1;
    const nowMs = Date.parse(step.now);
    if (!Number.isFinite(nowMs)) {
      throw new Error(`${file}: invalid step now at index ${i}: ${step.now}`);
    }
    const expected = step.expected || {};
    const result = computeFromRawEvents(nowMs, scenario.events);
    const actual = buildActual(result, previousActual);
    const diffs = diffExpectedActual(expected, actual);
    const pass = diffs.length === 0;

    console.log(`Step ${stepNo} | now=${step.now} | ${pass ? "PASS" : "FAIL"}`);
    console.log(`  expected: ${JSON.stringify(expected)}`);
    console.log(`  actual:   ${JSON.stringify(actual)}`);
    if (!pass) {
      console.log(`  diffs:    ${diffs.join("; ")}`);
      failed += 1;
    }

    previousActual = actual;
  }

  console.log();
  return {
    scenario: scenarioLabel,
    total: scenario.steps.length,
    failed
  };
}

function main() {
  const fixtures = readFixtures();
  let totalScenarios = 0;
  let totalSteps = 0;
  let totalFailedSteps = 0;

  for (const fixture of fixtures) {
    const stats = runScenario(fixture.data, fixture.file);
    totalScenarios += 1;
    totalSteps += stats.total;
    totalFailedSteps += stats.failed;
  }

  console.log("=== Stage 6 Summary ===");
  console.log(`fixtures: ${totalScenarios}`);
  console.log(`steps_total: ${totalSteps}`);
  console.log(`steps_failed: ${totalFailedSteps}`);

  process.exit(totalFailedSteps > 0 ? 1 : 0);
}

main();
