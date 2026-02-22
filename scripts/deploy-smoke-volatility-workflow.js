#!/usr/bin/env node
/**
 * One-click deploy + smoke for "Volatility Window".
 *
 * What it does:
 * 1) Pushes canonical workflow JSON to n8n.
 * 2) Ensures workflow is active.
 * 3) Waits for the next execution and reports success/failure.
 *
 * Usage:
 *   node scripts/deploy-smoke-volatility-workflow.js
 *
 * Optional env:
 *   SMOKE_WAIT_MS=70000   # max wait for next execution (default 70000)
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const WORKFLOW_NAME = "Volatility Window";
const LEGACY_WORKFLOW_NAME = "Volatility State from Forex Factory";
const WORKFLOW_FILE = "n8n-volatility-window-workflow.json";
const DEFAULT_SMOKE_WAIT_MS = 70000;
const POLL_INTERVAL_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseIntSafe(value, fallbackValue) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue;
}

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

function requestJson(baseUrl, { method, endpoint, headers, body }) {
  const url = new URL(endpoint, baseUrl);
  const transport = url.protocol === "https:" ? https : http;
  const requestHeaders = Object.assign({}, headers || {});
  let payload = null;
  if (body !== undefined) {
    payload = JSON.stringify(body);
    requestHeaders["Content-Type"] = "application/json";
    requestHeaders["Content-Length"] = Buffer.byteLength(payload);
  }

  return new Promise((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method,
        headers: requestHeaders,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let data = null;
          if (text) {
            try {
              data = JSON.parse(text);
            } catch (_error) {
              data = null;
            }
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(
              new Error(
                `${method} ${endpoint} failed: ${res.statusCode} ${res.statusMessage || ""} ${text}`.trim()
              )
            );
          }
          resolve(data);
        });
      }
    );

    req.on("error", (error) => reject(error));
    if (payload) req.write(payload);
    req.end();
  });
}

function formatExecutionState(execution) {
  if (!execution) return "unknown";
  if (execution.status) return String(execution.status);
  if (execution.finished === false) return "running";
  if (execution.finished === true) return "success";
  return "unknown";
}

function pickWorkflow(workflows) {
  return workflows.find((w) => w.name === WORKFLOW_NAME || w.name === LEGACY_WORKFLOW_NAME) || null;
}

async function getLatestExecution(baseUrl, headers, workflowId) {
  const payload = await requestJson(baseUrl, {
    method: "GET",
    endpoint: `/api/v1/executions?limit=1&workflowId=${encodeURIComponent(workflowId)}`,
    headers,
  });
  const list = payload && Array.isArray(payload.data) ? payload.data : [];
  return list.length > 0 ? list[0] : null;
}

async function main() {
  const env = loadEnv();
  const apiKey = env.N8N_API_KEY || process.env.N8N_API_KEY;
  const baseUrl = (env.N8N_BASE_URL || process.env.N8N_BASE_URL || "http://localhost:5678").replace(/\/$/, "");
  const smokeWaitMs = parseIntSafe(env.SMOKE_WAIT_MS || process.env.SMOKE_WAIT_MS, DEFAULT_SMOKE_WAIT_MS);

  if (!apiKey) {
    console.error("N8N_API_KEY is not set. Add it to .env (n8n: Settings -> API).");
    process.exit(1);
  }

  const filePath = path.resolve(__dirname, "..", WORKFLOW_FILE);
  if (!fs.existsSync(filePath)) {
    console.error(`${WORKFLOW_FILE} not found`);
    process.exit(1);
  }

  const fileContent = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const workflowFromFile = Array.isArray(fileContent) ? fileContent[0] : fileContent;
  if (!workflowFromFile || workflowFromFile.name !== WORKFLOW_NAME) {
    console.error(`Expected workflow named "${WORKFLOW_NAME}" in ${WORKFLOW_FILE}`);
    process.exit(1);
  }

  const headers = {
    Accept: "application/json",
    "X-N8N-API-KEY": apiKey,
  };

  try {
    const listBefore = await requestJson(baseUrl, {
      method: "GET",
      endpoint: "/api/v1/workflows",
      headers,
    });
    const workflows = listBefore && Array.isArray(listBefore.data) ? listBefore.data : [];
    const existing = pickWorkflow(workflows);
    if (!existing) {
      console.error(`Workflow "${WORKFLOW_NAME}" not found in n8n. Import it first.`);
      process.exit(1);
    }

    const baselineExecution = await getLatestExecution(baseUrl, headers, existing.id);
    const baselineExecutionId = baselineExecution ? String(baselineExecution.id) : null;

    const body = {
      name: workflowFromFile.name,
      nodes: workflowFromFile.nodes,
      connections: workflowFromFile.connections,
      settings: workflowFromFile.settings || { executionOrder: "v1" },
    };

    await requestJson(baseUrl, {
      method: "PUT",
      endpoint: `/api/v1/workflows/${existing.id}`,
      headers,
      body,
    });
    console.log(`Updated workflow "${WORKFLOW_NAME}" (id: ${existing.id}).`);

    if (!existing.active) {
      await requestJson(baseUrl, {
        method: "POST",
        endpoint: `/api/v1/workflows/${existing.id}/activate`,
        headers,
      });
      console.log("Workflow was inactive and has been activated.");
    } else {
      console.log("Workflow is already active.");
    }

    const deadline = Date.now() + smokeWaitMs;
    let observedExecution = null;

    while (Date.now() < deadline) {
      const latest = await getLatestExecution(baseUrl, headers, existing.id);
      if (latest && String(latest.id) !== baselineExecutionId) {
        observedExecution = latest;
        break;
      }
      await sleep(POLL_INTERVAL_MS);
    }

    if (!observedExecution) {
      console.error(
        `Smoke timeout: no new execution detected for workflow "${WORKFLOW_NAME}" within ${smokeWaitMs}ms.`
      );
      process.exit(1);
    }

    const state = formatExecutionState(observedExecution);
    console.log(
      `Smoke execution detected: id=${observedExecution.id}, status=${state}, startedAt=${observedExecution.startedAt}`
    );

    if (state !== "success") {
      console.error(`Smoke failed: execution ${observedExecution.id} finished with status "${state}".`);
      process.exit(1);
    }

    console.log("Deploy + smoke: OK");
  } catch (error) {
    console.error("Deploy + smoke failed:", error.message);
    process.exit(1);
  }
}

main();
