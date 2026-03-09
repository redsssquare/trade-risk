#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const SCRIPTS_DIR = path.join(__dirname);
const PAUSE_MS = 2500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runScript(scriptName) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  const env = {
    ...process.env,
    TEST_CHANNEL: 'false',
    SCENARIO_MODE: '1',
  };
  return spawnSync('node', [scriptPath], {
    env,
    stdio: 'inherit',
    cwd: path.dirname(__dirname),
  });
}

async function main() {
  if (!process.env.TELEGRAM_CHAT_ID) {
    console.error('Error: TELEGRAM_CHAT_ID is not set (production mode)');
    process.exit(1);
  }

  const scripts = [
    'send-weekly-ahead-test-cases.js',
    'send-weekly-digest-test.js',
    'send-daily-digest-test-cases.js',
    'send-volatility-test-events.js',
  ];

  for (const scriptName of scripts) {
    console.log(`\n=== Running: ${scriptName} ===`);
    const result = runScript(scriptName);
    if (result.status !== 0) {
      console.error(`\nError: ${scriptName} exited with code ${result.status}`);
      process.exit(1);
    }
    console.log(`✅ Done: ${scriptName}`);
    if (scriptName !== scripts[scripts.length - 1]) {
      await sleep(PAUSE_MS);
    }
  }

  console.log('\n✅ All scenarios completed successfully');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
