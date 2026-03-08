#!/usr/bin/env node
/**
 * During Event Publication Name — тест с отправкой в тестовый Telegram.
 *
 * Проверяет формат during_event: 🔴 + название публикации + валюта.
 * Кейсы: single high, single anchor, stack, anchorStack.
 *
 * Требования:
 *   - Bridge запущен (BRIDGE_URL, по умолчанию http://localhost:3000)
 *   - TEST_CHANNEL=true или TELEGRAM_MODE=test
 *   - TELEGRAM_TEST_CHANNEL_ID — ID тестового канала
 *   - TELEGRAM_BOT_TOKEN — токен бота
 *   - AI_ENABLED=false (template mode, по умолчанию)
 *
 * Usage:
 *   TEST_CHANNEL=true TELEGRAM_TEST_CHANNEL_ID=... TELEGRAM_BOT_TOKEN=... node scripts/test-during-event-telegram.js
 *   DRY_RUN=1 node scripts/test-during-event-telegram.js  # только payload, без отправки
 */

"use strict";

const http = require("http");
const https = require("https");

const BRIDGE_URL = process.env.BRIDGE_URL || "http://localhost:3000";
const DRY_RUN = String(process.env.DRY_RUN || "").toLowerCase() === "1" || process.env.DRY_RUN === "true";

function httpRequest(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const reqOpts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search,
      method: opts.method || "GET",
      headers: opts.headers || {}
    };
    const req = lib.request(reqOpts, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(body); } catch (_) {} // eslint-disable-line no-empty
        resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, json: json || {} });
      });
    });
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function postEvent(body) {
  const res = await httpRequest(`${BRIDGE_URL}/hooks/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return res;
}

function makeDuringEventPayload(opts) {
  const {
    eventName = "Initial Jobless Claims",
    currency = "USD",
    clusterSize = 1,
    impactType = "high",
    anchorLabel = null,
    clusterHasAnchor = false,
    clusterAnchorNames = []
  } = opts;

  const nowIso = new Date().toISOString();
  const eventTimeMs = Date.now();
  const clusterEvents = Array.from({ length: clusterSize }, (_, i) => ({
    name: i === 0 ? eventName : `Event ${i + 1}`,
    time: new Date(eventTimeMs + i * 60000).toISOString(),
    impact: "High",
    currency
  }));

  return {
    event_type: "volatility.state_changed",
    state: "RED",
    phase: "during_event",
    timestamp: nowIso,
    context: {
      event_name: eventName,
      event_title: eventName,
      event_time: new Date(eventTimeMs).toISOString(),
      minutes_to_event: 0,
      impact: "High",
      impact_type: impactType,
      phase: "during_event",
      currency,
      anchor_label: anchorLabel,
      cluster_has_anchor: clusterHasAnchor,
      cluster_anchor_names: clusterAnchorNames,
      cluster_size: clusterSize,
      cluster_events: clusterEvents,
      cluster_window_min: 5
    }
  };
}

function makeGreenPayload() {
  return {
    event_type: "volatility.state_changed",
    state: "GREEN",
    phase: "none",
    timestamp: new Date().toISOString(),
    context: null
  };
}

const SCENARIOS = [
  {
    id: "D1",
    name: "during_event: single high (Initial Jobless Claims)",
    payload: () => makeDuringEventPayload({ eventName: "Initial Jobless Claims", impactType: "high" }),
    expect: "🔴 Initial Jobless Claims 🇺🇸 USD."
  },
  { id: "G1", name: "GREEN (сброс для следующего)", payload: makeGreenPayload, expect: "🟢" },
  {
    id: "D2",
    name: "during_event: single anchor (NFP)",
    payload: () => makeDuringEventPayload({
      eventName: "NFP",
      impactType: "anchor_high",
      anchorLabel: "NFP",
      clusterHasAnchor: true,
      clusterAnchorNames: ["NFP"]
    }),
    expect: "🔴 NFP 🇺🇸 USD."
  },
  { id: "G2", name: "GREEN (сброс)", payload: makeGreenPayload, expect: "🟢" },
  {
    id: "D3",
    name: "during_event: stack (серия 3)",
    payload: () => makeDuringEventPayload({
      eventName: "Retail Sales",
      clusterSize: 3,
      impactType: "high"
    }),
    expect: "🔴 Идёт серия публикаций (3)."
  },
  { id: "G3", name: "GREEN (сброс)", payload: makeGreenPayload, expect: "🟢" },
  {
    id: "D4",
    name: "during_event: anchorStack (серия 2, включая NFP)",
    payload: () => makeDuringEventPayload({
      eventName: "NFP",
      clusterSize: 2,
      impactType: "anchor_high",
      anchorLabel: "NFP",
      clusterHasAnchor: true,
      clusterAnchorNames: ["NFP"]
    }),
    expect: "🔴 Идёт серия публикаций (2), включая NFP."
  }
];

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  During Event Publication Name — тест отправки в TG        ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`Bridge: ${BRIDGE_URL}`);
  console.log(`DRY_RUN: ${DRY_RUN}`);
  console.log("");
  console.log("Требуется: TEST_CHANNEL=true, TELEGRAM_TEST_CHANNEL_ID, TELEGRAM_BOT_TOKEN");
  console.log("Рекомендуется: AI_ENABLED=false (template mode)");
  console.log("");

  if (DRY_RUN) {
    console.log("--- DRY_RUN: payloads (не отправляются) ---\n");
    for (const s of SCENARIOS) {
      const body = typeof s.payload === "function" ? s.payload() : s.payload;
      console.log(`[${s.id}] ${s.name}`);
      console.log(`  Ожидание: ${s.expect}`);
      console.log(JSON.stringify(body.context, null, 2).split("\n").slice(0, 12).join("\n") + "\n...");
      console.log("");
    }
    return;
  }

  let bridgeOk = false;
  try {
    const r = await httpRequest(`${BRIDGE_URL}/health`);
    bridgeOk = r.ok;
  } catch (_) {} // eslint-disable-line no-empty

  if (!bridgeOk) {
    console.error(`Bridge недоступен: ${BRIDGE_URL}`);
    console.error("Запустите bridge (например: node services/bridge/server.js)");
    process.exit(1);
  }

  for (const s of SCENARIOS) {
    const body = typeof s.payload === "function" ? s.payload() : s.payload;
    process.stdout.write(`[${s.id}] ${s.name}... `);
    try {
      const res = await postEvent(body);
      if (res.status === 200) {
        if (res.json && res.json.skipped === "duplicate_state_phase") {
          console.log("skipped (duplicate_state_phase)");
        } else if (res.json && res.json.telegram) {
          console.log("OK → отправлено в TG");
        } else {
          console.log(`OK (HTTP ${res.status})`);
        }
      } else {
        console.log(`HTTP ${res.status}`);
        if (res.json && res.json.error) {
          console.log(`  Error: ${res.json.error}`);
        }
      }
    } catch (err) {
      console.log(`FAIL: ${err && err.message ? err.message : err}`);
    }
  }

  console.log("\nПроверьте тестовый Telegram-канал на наличие сообщений.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
