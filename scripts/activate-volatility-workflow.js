#!/usr/bin/env node
/**
 * Активирует workflow "Volatility Window" в n8n через API.
 * Требует N8N_API_KEY в .env (создать в n8n: Settings → API).
 *
 * Использование: node scripts/activate-volatility-workflow.js
 * (из корня проекта; .env должен содержать N8N_API_KEY)
 */

const fs = require("fs");
const path = require("path");

const WORKFLOW_NAME = "Volatility Window";
const LEGACY_WORKFLOW_NAME = "Volatility State from Forex Factory";

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) {
    console.error(".env not found");
    process.exit(1);
  }
  const raw = fs.readFileSync(envPath, "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) env[key] = value.slice(1, -1);
    else env[key] = value;
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const apiKey = env.N8N_API_KEY || process.env.N8N_API_KEY;
  const baseUrl = (process.env.N8N_BASE_URL || env.N8N_BASE_URL || "http://localhost:5678").replace(/\/$/, "");

  if (!apiKey) {
    console.error("N8N_API_KEY is not set. Add it to .env (create key in n8n: Settings → API).");
    process.exit(1);
  }

  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-N8N-API-KEY": apiKey,
  };

  try {
    const listRes = await fetch(`${baseUrl}/api/v1/workflows`, { headers });
    if (!listRes.ok) {
      console.error("List workflows failed:", listRes.status, await listRes.text());
      process.exit(1);
    }
    const { data: workflows } = await listRes.json();
    const wf = workflows.find((w) => w.name === WORKFLOW_NAME || w.name === LEGACY_WORKFLOW_NAME);
    if (!wf) {
      console.error(`Workflow "${WORKFLOW_NAME}" not found. Import n8n-volatility-window-workflow.json first.`);
      process.exit(1);
    }

    const activateRes = await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/activate`, {
      method: "POST",
      headers,
    });
    if (!activateRes.ok) {
      console.error("Activate failed:", activateRes.status, await activateRes.text());
      process.exit(1);
    }

    console.log(`Workflow "${WORKFLOW_NAME}" (id: ${wf.id}) is now active.`);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();
