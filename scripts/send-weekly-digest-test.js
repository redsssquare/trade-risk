#!/usr/bin/env node
/**
 * Шаг 6 плана Weekly End: тестовый POST с фиксированным JSON в /weekly-digest.
 * Проверяет: текст по формату спеки, уровень корректен, запрещённых слов нет, строк ≤ 9.
 * Отправка только в TELEGRAM_TEST_CHANNEL_ID (bridge).
 * Usage: BRIDGE_URL=http://localhost:3000 node scripts/send-weekly-digest-test.js
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");
const path = require("path");

const BRIDGE_URL = process.env.BRIDGE_URL || "http://localhost:3000";

const { formatWeeklyEnd, validateWeeklyEnd } = require(path.join(__dirname, "../services/bridge/render/weekly-end-format"));

/** Текущая неделя по МСК (пн–пт), формат "DD–DD.MM" (как в n8n Weekly Aggregate). */
function getMoscowWeekRange() {
  const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
  const moscowNow = new Date(Date.now() + MSK_OFFSET_MS);
  const y = moscowNow.getUTCFullYear();
  const m = String(moscowNow.getUTCMonth() + 1).padStart(2, "0");
  const d = String(moscowNow.getUTCDate()).padStart(2, "0");
  const moscowDateStr = `${y}-${m}-${d}`;
  const tempDate = new Date(moscowDateStr + "T12:00:00+03:00");
  const dayOfWeek = tempDate.getUTCDay();
  const daysToMonday = (dayOfWeek + 6) % 7;
  const mondayDate = new Date(tempDate);
  mondayDate.setUTCDate(mondayDate.getUTCDate() - daysToMonday);
  const mondayStr = mondayDate.toISOString().slice(0, 10);
  const fridayDate = new Date(mondayDate);
  fridayDate.setUTCDate(fridayDate.getUTCDate() + 4);
  const fridayStr = fridayDate.toISOString().slice(0, 10);
  return `${mondayStr.slice(8, 10)}–${fridayStr.slice(8, 10)}.${fridayStr.slice(5, 7)}`;
}

/** Фиксированные payload по спеке (входной контракт); week_range при отправке подменяется на текущую неделю по МСК. */
const FIXED_PAYLOADS = [
  {
    name: "Спокойная неделя, 1 день активности",
    payload: {
      week_range: "24–28.02",
      high_events: 1,
      anchor_events: 0,
      clusters: 0,
      total_window_minutes: 35,
      active_days: ["Wed"],
      quiet_days_count: 4,
      busy_day_bonus: 0,
    },
  },
  {
    name: "Умеренная, 2 дня, с окном в часах",
    payload: {
      week_range: "24–28.02",
      high_events: 4,
      anchor_events: 1,
      clusters: 2,
      total_window_minutes: 175,
      active_days: ["Wed", "Fri"],
      quiet_days_count: 3,
      busy_day_bonus: 0,
    },
  },
  {
    name: "Насыщенная, 3+ дней, busy_day_bonus",
    payload: {
      week_range: "24–28.02",
      high_events: 5,
      anchor_events: 2,
      clusters: 2,
      total_window_minutes: 120,
      active_days: ["Mon", "Wed", "Fri"],
      quiet_days_count: 2,
      busy_day_bonus: 1,
    },
  },
  {
    name: "Понижение из‑за quiet_days >= 3 (насыщенная → умеренная)",
    payload: {
      week_range: "24–28.02",
      high_events: 4,
      anchor_events: 2,
      clusters: 1,
      total_window_minutes: 45,
      active_days: ["Tue", "Thu"],
      quiet_days_count: 3,
      busy_day_bonus: 0,
    },
  },
];

function postWeeklyDigest(body) {
  const urlStr = `${BRIDGE_URL.replace(/\/$/, "")}/weekly-digest`;
  const u = new URL(urlStr);
  const isHttps = u.protocol === "https:";
  const bodyStr = JSON.stringify(body);
  const opts = {
    hostname: u.hostname,
    port: u.port || (isHttps ? 443 : 80),
    path: u.pathname,
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr) },
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
        resolve({ statusCode: res.statusCode, body: parsed });
      });
    });
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

function runChecks(name, payload, text) {
  const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
  const validation = validateWeeklyEnd(payload, text);
  const ok = validation.ok && lines.length <= 9;
  return {
    ok,
    validation,
    lineCount: lines.length,
    text,
  };
}

async function main() {
  const weekRange = getMoscowWeekRange();
  console.log("[send-weekly-digest-test] Bridge URL:", BRIDGE_URL);
  console.log("[send-weekly-digest-test] Неделя по МСК (пн–пт):", weekRange);
  console.log("[send-weekly-digest-test] Фиксированные кейсы по спеке:\n");

  let hasFailure = false;

  for (const { name, payload } of FIXED_PAYLOADS) {
    const payloadWithWeek = { ...payload, week_range: weekRange };
    const text = formatWeeklyEnd(payloadWithWeek);
    const { ok, validation, lineCount, text: formatted } = runChecks(name, payloadWithWeek, text);

    console.log("---", name);
    console.log("Строк:", lineCount, "(макс. 9)", lineCount <= 9 ? "✓" : "✗");
    console.log("Валидация:", validation.ok ? "ok" : validation.reason);
    if (!validation.ok) console.log("  reason:", validation.reason);
    console.log("Текст:\n" + formatted.split("\n").map((l) => "  " + l).join("\n"));
    console.log("");

    if (!ok) {
      hasFailure = true;
      continue;
    }

    try {
      const { statusCode, body } = await postWeeklyDigest(payloadWithWeek);
      if (statusCode >= 200 && statusCode < 300) {
        console.log("[OK] POST →", statusCode, body.meta && body.meta.sent ? "sent" : "");
      } else {
        console.log("[SKIP] POST →", statusCode, "(bridge не запущен или маршрут недоступен)");
      }
    } catch (err) {
      console.log("[SKIP] POST error:", err.message, "(запустите bridge для реальной отправки)");
    }
    console.log("");
  }

  if (hasFailure) process.exit(1);
  console.log("[send-weekly-digest-test] Все проверки формата пройдены. Для отправки в Telegram запустите bridge и повторите.");
}

main();
