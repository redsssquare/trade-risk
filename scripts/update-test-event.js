#!/usr/bin/env node
/**
 * Stage 1 test profile: set one event at now+20min and write to simulated_day.json.
 * Run before starting containers so one test cycle shows pre_event → during_event → post_event.
 * Usage: node scripts/update-test-event.js
 */

const fs = require("fs");
const path = require("path");

const PRE_MINUTES = 20;
const nowMs = Date.now();
const eventMs = nowMs + PRE_MINUTES * 60 * 1000;

const template = {
  start_time: new Date(nowMs).toISOString(),
  events: [
    {
      name: "Test Event (Stage 1)",
      time: new Date(eventMs).toISOString(),
      impact: "High"
    }
  ]
};

const outPath = path.resolve(__dirname, "../data/simulated_day.json");
fs.writeFileSync(outPath, JSON.stringify(template, null, 2), "utf8");

console.log("[update-test-event] Written:", outPath);
console.log("[update-test-event] Event at:", template.events[0].time, "(now +", PRE_MINUTES, "min)");
console.log("[update-test-event] Set CALENDAR_TEST_MODE=true, restart stack, activate workflow; expect pre_event → during_event → post_event over ~40 min.");
