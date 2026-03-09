#!/usr/bin/env node
/**
 * Volatility Window Flow — Этап 2: тестирование отправки в Telegram.
 * Отправляет набор тестовых событий в bridge /hooks/event.
 *
 * Публикует в основной канал (TELEGRAM_CHAT_ID). Bridge должен быть запущен с TEST_CHANNEL=false.
 *
 * Usage:
 *   BRIDGE_URL=http://localhost:3000 node scripts/send-volatility-test-events.js
 *   DRY_RUN=1 node scripts/send-volatility-test-events.js  # только показать payload, не отправлять
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
        try { json = JSON.parse(body); } catch (_) {}
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

function makeRedPayload(phase, eventName = "NFP", minsToEvent = 15, impactType = "anchor_high") {
  const nowIso = new Date().toISOString();
  const eventTimeMs = Date.now() + minsToEvent * 60000;
  return {
    event_type: "volatility.state_changed",
    state: "RED",
    phase,
    timestamp: nowIso,
    context: {
      event_name: eventName,
      event_title: eventName,
      event_time: new Date(eventTimeMs).toISOString(),
      minutes_to_event: minsToEvent,
      impact: "High",
      impact_type: impactType,
      phase,
      currency: "USD",
      anchor_label: impactType === "anchor_high" ? eventName : null,
      cluster_has_anchor: impactType === "anchor_high",
      cluster_anchor_names: impactType === "anchor_high" ? [eventName] : [],
      cluster_size: 1,
      cluster_events: [{ name: eventName, time: new Date(eventTimeMs).toISOString(), impact: "High" }],
      cluster_window_min: 5
    }
  };
}

function makeRedPayloadCustom({ phase, eventName = "CPI m/m", minsToEvent = 15, impactType = "high", clusterSize = 1, clusterHasAnchor = false, clusterAnchorNames = [], clusterEvents = null, contextualAnchor = false }) {
  const nowIso = new Date().toISOString();
  const eventTimeMs = Date.now() + minsToEvent * 60000;
  const defaultClusterEvents = [{ name: eventName, time: new Date(eventTimeMs).toISOString(), impact: "High" }];
  return {
    event_type: "volatility.state_changed",
    state: "RED",
    phase,
    timestamp: nowIso,
    context: {
      event_name: eventName,
      event_title: eventName,
      event_time: new Date(eventTimeMs).toISOString(),
      minutes_to_event: minsToEvent,
      impact: "High",
      impact_type: impactType,
      phase,
      currency: "USD",
      anchor_label: clusterHasAnchor && clusterAnchorNames.length > 0 ? clusterAnchorNames[0] : null,
      cluster_has_anchor: clusterHasAnchor,
      cluster_anchor_names: clusterAnchorNames,
      cluster_size: clusterSize,
      cluster_events: clusterEvents || defaultClusterEvents,
      cluster_window_min: 5,
      contextual_anchor: contextualAnchor,
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

/**
 * Реалистичные сценарии: каждая история — один event, полный цикл pre_event → during_event → GREEN.
 * Порядок сообщений в TG логичен: «Через N мин — X» → «X. Публикация началась» → «Окно закрыто».
 */
const SCENARIOS = [
  // История 1: Retail Sales (high, одиночное)
  {
    id: "1a",
    name: "Retail Sales — ожидание (pre_event)",
    _caseType: "single",
    payload: () => makeRedPayloadCustom({
      phase: "pre_event",
      eventName: "Retail Sales m/m",
      minsToEvent: 20,
      impactType: "high",
      clusterSize: 1,
      clusterHasAnchor: false,
      clusterAnchorNames: [],
    }),
  },
  {
    id: "1b",
    name: "Retail Sales — публикация (during_event)",
    _caseType: "single",
    payload: () => makeRedPayloadCustom({
      phase: "during_event",
      eventName: "Retail Sales m/m",
      minsToEvent: 0,
      impactType: "high",
      clusterSize: 1,
      clusterHasAnchor: false,
      clusterAnchorNames: [],
    }),
  },
  {
    id: "1c",
    name: "GREEN — окно закрыто",
    _caseType: "reset",
    payload: makeGreenPayload,
  },
  // История 2: NFP (anchor)
  {
    id: "2a",
    name: "NFP — ожидание (pre_event)",
    _caseType: "anchor",
    payload: () => makeRedPayload("pre_event", "NFP", 10, "anchor_high"),
  },
  {
    id: "2b",
    name: "NFP — публикация (during_event)",
    _caseType: "anchor",
    payload: () => makeRedPayload("during_event", "NFP", 0, "anchor_high"),
  },
  {
    id: "2c",
    name: "GREEN — окно закрыто",
    _caseType: "reset",
    payload: makeGreenPayload,
  },
  // История 3: Кластер (stack)
  {
    id: "3a",
    name: "Кластер Retail/CPI/PPI — ожидание (pre_event)",
    _caseType: "multiple",
    payload: () => {
      const eventTimeMs = Date.now() + 15 * 60000;
      return makeRedPayloadCustom({
        phase: "pre_event",
        eventName: "Retail Sales m/m",
        minsToEvent: 15,
        impactType: "high",
        clusterSize: 3,
        clusterHasAnchor: false,
        clusterAnchorNames: [],
        clusterEvents: [
          { name: "Retail Sales m/m", time: new Date(eventTimeMs).toISOString(), impact: "High" },
          { name: "Core CPI m/m", time: new Date(eventTimeMs + 60000).toISOString(), impact: "High" },
          { name: "PPI m/m", time: new Date(eventTimeMs + 120000).toISOString(), impact: "High" },
        ],
      });
    },
  },
  {
    id: "3b",
    name: "Кластер Retail/CPI/PPI — публикация (during_event)",
    _caseType: "multiple",
    payload: () => {
      const eventTimeMs = Date.now();
      return makeRedPayloadCustom({
        phase: "during_event",
        eventName: "Retail Sales m/m",
        minsToEvent: 0,
        impactType: "high",
        clusterSize: 3,
        clusterHasAnchor: false,
        clusterAnchorNames: [],
        clusterEvents: [
          { name: "Retail Sales m/m", time: new Date(eventTimeMs).toISOString(), impact: "High" },
          { name: "Core CPI m/m", time: new Date(eventTimeMs + 60000).toISOString(), impact: "High" },
          { name: "PPI m/m", time: new Date(eventTimeMs + 120000).toISOString(), impact: "High" },
        ],
      });
    },
  },
  {
    id: "3c",
    name: "GREEN — окно закрыто",
    _caseType: "reset",
    payload: makeGreenPayload,
  },
  // История 4: FOMC + кластер (anchorStack)
  {
    id: "4a",
    name: "FOMC + кластер — ожидание (pre_event)",
    _caseType: "cluster_anchor",
    payload: () => {
      const eventTimeMs = Date.now() + 12 * 60000;
      return makeRedPayloadCustom({
        phase: "pre_event",
        eventName: "FOMC Rate Decision",
        minsToEvent: 12,
        impactType: "anchor_high",
        clusterSize: 2,
        clusterHasAnchor: true,
        clusterAnchorNames: ["FOMC Rate Decision"],
        contextualAnchor: true,
        clusterEvents: [
          { name: "FOMC Rate Decision", time: new Date(eventTimeMs).toISOString(), impact: "High" },
          { name: "FOMC Press Conference", time: new Date(eventTimeMs + 1800000).toISOString(), impact: "High" },
        ],
      });
    },
  },
  {
    id: "4b",
    name: "FOMC + кластер — публикация (during_event)",
    _caseType: "cluster_anchor",
    payload: () => {
      const eventTimeMs = Date.now();
      return makeRedPayloadCustom({
        phase: "during_event",
        eventName: "FOMC Rate Decision",
        minsToEvent: 0,
        impactType: "anchor_high",
        clusterSize: 2,
        clusterHasAnchor: true,
        clusterAnchorNames: ["FOMC Rate Decision"],
        clusterEvents: [
          { name: "FOMC Rate Decision", time: new Date(eventTimeMs).toISOString(), impact: "High" },
          { name: "FOMC Press Conference", time: new Date(eventTimeMs + 1800000).toISOString(), impact: "High" },
        ],
      });
    },
  },
  {
    id: "4c",
    name: "GREEN — окно закрыто",
    _caseType: "reset",
    payload: makeGreenPayload,
  },
];

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  Volatility Window — Этап 2: тест отправки в TG   ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`Bridge: ${BRIDGE_URL}`);
  console.log(`DRY_RUN: ${DRY_RUN}`);
  console.log("");
  console.log("Режим: реалистичные истории (pre_event → during_event → GREEN для каждого event).");
  console.log("");

  if (DRY_RUN) {
    console.log("--- DRY_RUN: payloads (не отправляются) ---\n");
    for (const s of SCENARIOS) {
      const body = typeof s.payload === "function" ? s.payload() : s.payload;
      console.log(`[${s.id}] ${s.name}`);
      console.log(JSON.stringify(body, null, 2).split("\n").slice(0, 15).join("\n") + "\n...");
      console.log("");
    }
    return;
  }

  let bridgeOk = false;
  try {
    const r = await httpRequest(`${BRIDGE_URL}/health`);
    bridgeOk = r.ok;
  } catch (_) {}

  if (!bridgeOk) {
    console.error(`Bridge не доступен: ${BRIDGE_URL}`);
    process.exit(1);
  }

  for (const s of SCENARIOS) {
    const body = typeof s.payload === "function" ? s.payload() : s.payload;
    process.stdout.write(`[${s.id}] ${s._caseType ? `[${s._caseType}]` : ""} ${s.name}... `);
    try {
      const res = await postEvent(body);
      if (res.status === 200) {
        if (res.json && res.json.skipped === "duplicate_state_phase") {
          console.log("skipped (duplicate_state_phase)");
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
