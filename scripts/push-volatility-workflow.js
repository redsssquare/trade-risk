#!/usr/bin/env node
/**
 * Обновляет workflow "Volatility Window" в n8n из файла
 * n8n-volatility-window-workflow.json. Сохраняет текущий статус active (вкл/выкл).
 *
 * Использование: node scripts/push-volatility-workflow.js
 * Требует N8N_API_KEY в .env.
 */

const fs = require("fs");
const path = require("path");

const WORKFLOW_NAME = "Volatility Window";
const LEGACY_WORKFLOW_NAME = "Volatility State from Forex Factory";
const WORKFLOW_FILE = "n8n-volatility-window-workflow.json";

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
  const baseUrl = (env.N8N_BASE_URL || process.env.N8N_BASE_URL || "http://localhost:5678").replace(/\/$/, "");

  if (!apiKey) {
    console.error("N8N_API_KEY is not set. Add it to .env (n8n: Settings → API).");
    process.exit(1);
  }

  const filePath = path.resolve(__dirname, "..", WORKFLOW_FILE);
  if (!fs.existsSync(filePath)) {
    console.error(WORKFLOW_FILE + " not found");
    process.exit(1);
  }

  const fileContent = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const workflowFromFile = Array.isArray(fileContent) ? fileContent[0] : fileContent;
  if (!workflowFromFile || workflowFromFile.name !== WORKFLOW_NAME) {
    console.error("Expected workflow named \"" + WORKFLOW_NAME + "\" in " + WORKFLOW_FILE);
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
    const existing = workflows.find((w) => w.name === WORKFLOW_NAME || w.name === LEGACY_WORKFLOW_NAME);
    if (!existing) {
      console.error("Workflow \"" + WORKFLOW_NAME + "\" not found in n8n. Import it first.");
      process.exit(1);
    }

    const body = {
      name: workflowFromFile.name,
      nodes: workflowFromFile.nodes,
      connections: workflowFromFile.connections,
      settings: workflowFromFile.settings || { executionOrder: "v1" },
    };

    const putRes = await fetch(`${baseUrl}/api/v1/workflows/${existing.id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });

    if (!putRes.ok) {
      const text = await putRes.text();
      console.error("Update failed:", putRes.status, text);
      process.exit(1);
    }

    console.log("Workflow \"" + WORKFLOW_NAME + "\" updated in n8n (id: " + existing.id + ").");
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();
