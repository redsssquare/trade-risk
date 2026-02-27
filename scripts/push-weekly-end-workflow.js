#!/usr/bin/env node
/**
 * Импортирует или обновляет workflow "Weekly End" в n8n из файла
 * n8n-weekly-end-workflow.json и активирует его.
 * Требует N8N_API_KEY в .env (n8n: Settings → API).
 *
 * Локально:  node scripts/push-weekly-end-workflow.js
 * Docker:   docker compose run --rm --entrypoint node -e N8N_BASE_URL=http://n8n:5678 -v "$(pwd):/app" -w /app bridge scripts/push-weekly-end-workflow.js
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

function fetch(url, options = {}) {
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch(url, options);
  }
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === "https:" ? https : http;
    const body = options.body != null ? options.body : undefined;
    const req = mod.request(
      url,
      {
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            text: () => Promise.resolve(text),
            json: () => Promise.resolve(JSON.parse(text || "{}")),
          });
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

const WORKFLOW_NAME = "Weekly End";
const WORKFLOW_FILE = "n8n-weekly-end-workflow.json";

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
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[key] = value;
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const apiKey = env.N8N_API_KEY || process.env.N8N_API_KEY;
  const baseUrl = (process.env.N8N_BASE_URL || env.N8N_BASE_URL || "http://localhost:5678").replace(/\/$/, "");

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
    const existing = workflows.find((w) => w.name === WORKFLOW_NAME);

    let workflowId;

    if (existing) {
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
        console.error("Update failed:", putRes.status, await putRes.text());
        process.exit(1);
      }
      workflowId = existing.id;
      console.log("Workflow \"" + WORKFLOW_NAME + "\" updated in n8n (id: " + workflowId + ").");
    } else {
      const body = {
        name: workflowFromFile.name,
        nodes: workflowFromFile.nodes,
        connections: workflowFromFile.connections,
        settings: workflowFromFile.settings || { executionOrder: "v1" },
      };
      const postRes = await fetch(`${baseUrl}/api/v1/workflows`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!postRes.ok) {
        console.error("Create failed:", postRes.status, await postRes.text());
        process.exit(1);
      }
      const created = await postRes.json();
      workflowId = created.data && created.data.id ? created.data.id : created.id;
      if (!workflowId) {
        console.error("Create response missing workflow id:", JSON.stringify(created));
        process.exit(1);
      }
      console.log("Workflow \"" + WORKFLOW_NAME + "\" created in n8n (id: " + workflowId + ").");
    }

    const activateRes = await fetch(`${baseUrl}/api/v1/workflows/${workflowId}/activate`, {
      method: "POST",
      headers,
    });
    if (!activateRes.ok) {
      console.error("Activate failed:", activateRes.status, await activateRes.text());
      process.exit(1);
    }
    console.log("Workflow \"" + WORKFLOW_NAME + "\" (id: " + workflowId + ") is now active.");
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();
