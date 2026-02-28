#!/usr/bin/env node
/**
 * Отправляет 5 тестовых daily digest в тестовый Telegram-канал (TELEGRAM_TEST_CHANNEL_ID).
 * Кейсы: 1 — нет событий; 2 — обычные; 3 — якорь; 4 — кластер; 5 — кластер + якорь.
 * Usage: BRIDGE_URL=http://localhost:3000 node scripts/send-daily-digest-test-cases.js
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");

const BRIDGE_URL = process.env.BRIDGE_URL || "http://localhost:3000";

function getMoscowDateStr() {
  return new Date().toLocaleString("en-CA", { timeZone: "Europe/Moscow" }).slice(0, 10);
}

function buildPayloads(moscowDateStr) {
  const d = moscowDateStr;
  const t10 = `${d}T10:00:00+03:00`;
  const t11 = `${d}T11:00:00+03:00`;
  const t12 = `${d}T12:00:00+03:00`;
  const t14 = `${d}T14:00:00+03:00`;
  const t16 = `${d}T16:00:00+03:00`;
  const t18 = `${d}T18:00:00+03:00`;

  return [
    { name: "Кейс 1 — нет событий", items: [] },
    {
      name: "Кейс 2 — обычные события",
      items: [
        { title: "Retail Sales", date: t10, impact: "High", country: "USD" },
        { title: "Unemployment Claims", date: t11, impact: "High", country: "USD" },
        { title: "Core CPI", date: t12, impact: "High", country: "USD" },
        { title: "ISM Manufacturing", date: t14, impact: "High", country: "USD" },
        { title: "Consumer Confidence", date: t16, impact: "High", country: "USD" },
        { title: "Building Permits", date: t18, impact: "High", country: "USD" }
      ]
    },
    {
      name: "Кейс 3 — якорное событие",
      items: [
        { title: "Retail Sales", date: t10, impact: "High", country: "USD" },
        { title: "Unemployment Claims", date: t11, impact: "High", country: "USD" },
        { title: "FOMC Rate Decision", date: t14, impact: "High", country: "USD" },
        { title: "Consumer Confidence", date: t16, impact: "High", country: "USD" }
      ]
    },
    {
      name: "Кейс 4 — кластер без якоря",
      items: [
        { title: "Retail Sales", date: t10, impact: "High", country: "USD" },
        { title: "Unemployment Claims", date: t10, impact: "High", country: "USD" },
        { title: "Core PPI", date: t10, impact: "High", country: "USD" },
        { title: "ISM Manufacturing", date: t14, impact: "High", country: "USD" },
        { title: "Trade Balance", date: t14, impact: "High", country: "USD" },
        { title: "Building Permits", date: t18, impact: "High", country: "USD" }
      ]
    },
    {
      name: "Кейс 5 — кластер + якорь",
      items: [
        { title: "Retail Sales", date: t10, impact: "High", country: "USD" },
        { title: "FOMC Rate Decision", date: t14, impact: "High", country: "USD" },
        { title: "Preliminary PMI", date: t14, impact: "High", country: "USD" },
        { title: "Core CPI", date: t14, impact: "High", country: "USD" },
        { title: "Consumer Confidence", date: t16, impact: "High", country: "USD" }
      ]
    }
  ];
}

function sendDigest(items) {
  const urlStr = `${BRIDGE_URL.replace(/\/$/, "")}/daily-digest`;
  const u = new URL(urlStr);
  const isHttps = u.protocol === "https:";
  const body = JSON.stringify({ items });
  const opts = {
    hostname: u.hostname,
    port: u.port || (isHttps ? 443 : 80),
    path: u.pathname,
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
  };
  return new Promise((resolve, reject) => {
    const req = (isHttps ? https : http).request(opts, (res) => {
      let data = "";
      res.on("data", (ch) => { data += ch; });
      res.on("end", () => {
        let parsed = {};
        try {
          parsed = data ? JSON.parse(data) : {};
        } catch (_e) {}
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsed);
        } else {
          reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const moscowDateStr = getMoscowDateStr();
  const payloads = buildPayloads(moscowDateStr);

  console.log("[send-daily-digest-test-cases] Bridge URL:", BRIDGE_URL);
  console.log("[send-daily-digest-test-cases] Дата (MSK):", moscowDateStr);
  console.log("[send-daily-digest-test-cases] Отправка 5 кейсов…\n");

  for (const { name, items } of payloads) {
    try {
      const result = await sendDigest(items);
      const count = (result.meta && result.meta.eventsCount) !== undefined ? result.meta.eventsCount : 0;
      console.log("[OK]", name, "→", count, "событий, sent:", result.meta && result.meta.sent);
    } catch (err) {
      console.error("[FAIL]", name, "—", err.message);
      process.exitCode = 1;
    }
  }

  console.log("\n[send-daily-digest-test-cases] Готово. Проверьте тестовый канал Telegram.");
}

main();
