#!/usr/bin/env node
/**
 * Отправляет тестовые кейсы «Ритм недели» (Weekly Ahead) в Telegram.
 * Bridge отправляет в канал OPENCLAW_TELEGRAM_CHAT_ID (основной, как daily/weekly digest).
 * Usage: BRIDGE_URL=http://localhost:3000 node scripts/send-weekly-ahead-test-cases.js
 * DRY_RUN=1 — только формат и валидация, без отправки в Telegram.
 *
 * Перед запуском: в .env bridge задать OPENCLAW_TELEGRAM_CHAT_ID (ID канала).
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");
const path = require("path");

const BRIDGE_URL = process.env.BRIDGE_URL || "http://localhost:3000";
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.NO_SEND === "1";

const { formatWeeklyAhead, validateWeeklyAhead } = require(path.join(
  __dirname,
  "../services/bridge/render/weekly-ahead-format"
));

/** Текущая неделя по МСК (пн–пт), формат "DD–DD.MM" (как в n8n Weekly Ahead Aggregate). */
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

/** Кейсы по спеке Weekly Ahead: уровень, метрики, понижение при quiet_days. */
const TEST_CASES = [
  {
    name: "1. Спокойная неделя (high 1, anchor 0, clusters 0)",
    payload: {
      week_range: "03–07.03",
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
    name: "2. Умеренная неделя (high 4, anchor 1, clusters 2)",
    payload: {
      week_range: "03–07.03",
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
    name: "3. Насыщенная неделя (high 5, anchor 2, clusters 2, busy_day_bonus)",
    payload: {
      week_range: "03–07.03",
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
    name: "4. Понижение из‑за quiet_days >= 3 (saturated → moderate)",
    payload: {
      week_range: "03–07.03",
      high_events: 4,
      anchor_events: 2,
      clusters: 1,
      total_window_minutes: 45,
      active_days: ["Tue", "Thu"],
      quiet_days_count: 3,
      busy_day_bonus: 0,
    },
  },
  {
    name: "5. Ключевые 3+, плотный интервал 1 (склонение и фразы)",
    payload: {
      week_range: "03–07.03",
      high_events: 2,
      anchor_events: 3,
      clusters: 1,
      total_window_minutes: 60,
      active_days: ["Tue", "Wed", "Thu"],
      quiet_days_count: 2,
      busy_day_bonus: 0,
    },
  },
  {
    name: "6. С high_events_per_day (распределение по дням)",
    payload: {
      week_range: "03–07.03",
      high_events: 5,
      anchor_events: 1,
      clusters: 2,
      total_window_minutes: 90,
      active_days: ["Mon", "Wed", "Fri"],
      quiet_days_count: 2,
      busy_day_bonus: 0,
      high_events_per_day: [1, 0, 2, 0, 2],
    },
  },
  {
    name: "7. Граница: все нули (1 активный день)",
    payload: {
      week_range: "03–07.03",
      high_events: 0,
      anchor_events: 0,
      clusters: 0,
      total_window_minutes: 0,
      active_days: ["Wed"],
      quiet_days_count: 4,
      busy_day_bonus: 0,
    },
  },
  {
    name: "8. Граница: один элемент (1 anchor, 1 high)",
    payload: {
      week_range: "03–07.03",
      high_events: 1,
      anchor_events: 1,
      clusters: 1,
      total_window_minutes: 30,
      active_days: ["Tue"],
      quiet_days_count: 4,
      busy_day_bonus: 0,
    },
  },
];

function postWeeklyAhead(body) {
  const urlStr = `${BRIDGE_URL.replace(/\/$/, "")}/weekly-ahead`;
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
      res.on("data", (ch) => {
        data += ch;
      });
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

async function main() {
  const weekRange = getMoscowWeekRange();
  console.log("[send-weekly-ahead-test-cases] Bridge URL:", BRIDGE_URL);
  console.log("[send-weekly-ahead-test-cases] Неделя по МСК (пн–пт):", weekRange);
  if (DRY_RUN) {
    console.log("[send-weekly-ahead-test-cases] DRY_RUN=1 — отправка в Telegram отключена.\n");
  } else {
    console.log("[send-weekly-ahead-test-cases] Кейсы отправляются в OPENCLAW_TELEGRAM_CHAT_ID (основной канал).\n");
  }

  let hasFailure = false;

  for (const { name, payload } of TEST_CASES) {
    const payloadWithWeek = { ...payload, week_range: weekRange };
    const text = formatWeeklyAhead(payloadWithWeek);
    const validation = validateWeeklyAhead(payloadWithWeek, text);
    const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);

    console.log("---", name);
    console.log("Строк:", lines.length, "(макс. 9)", lines.length <= 9 ? "✓" : "✗");
    console.log("Валидация:", validation.ok ? "ok" : validation.reason);
    if (!validation.ok) {
      console.log("  reason:", validation.reason);
      hasFailure = true;
      console.log("");
      continue;
    }
    console.log("Текст:\n" + text.split("\n").map((l) => "  " + l).join("\n"));
    console.log("");

    if (!DRY_RUN) {
      try {
        const { statusCode, body } = await postWeeklyAhead(payloadWithWeek);
        if (statusCode >= 200 && statusCode < 300) {
          console.log("[OK] POST →", statusCode, body.meta && body.meta.sent ? "отправлено в тестовый канал" : "");
        } else if (statusCode === 503) {
          console.log("[!] 503 — задай TELEGRAM_TEST_CHANNEL_ID в окружении bridge и перезапусти bridge.");
        } else if (statusCode === 500) {
          console.log("[!] 500 — ошибка отправки:", body.error || "");
          if (body.details) console.log("    details:", JSON.stringify(body.details));
          console.log("    Проверь: OPENCLAW_GATEWAY_TOKEN в bridge, openclaw runtime доступен, бот в канале.");
        } else {
          console.log("[SKIP] POST →", statusCode, body.error || "");
        }
      } catch (err) {
        console.log("[SKIP] POST error:", err.message, "— запусти bridge (BRIDGE_URL?) или проверь сеть.");
      }
    } else {
      console.log("[DRY_RUN] POST пропущен.");
    }
    console.log("");
  }

  if (hasFailure) {
    process.exit(1);
  }
  console.log("[send-weekly-ahead-test-cases] Все кейсы обработаны. Проверь сообщения в тестовом Telegram-канале.");
  console.log("");
  console.log("Если сообщений нет:");
  console.log("  • 503 → в .env bridge задай OPENCLAW_TELEGRAM_CHAT_ID (ID канала, например -100xxxxxxxxxx)");
  console.log("  • 500 → в .env задай OPENCLAW_GATEWAY_TOKEN; проверь, что openclaw runtime доступен");
  console.log("  • 200, но в Telegram пусто → бот должен быть админом в канале; OPENCLAW_TELEGRAM_CHAT_ID = ID канала (с минусом)");
}

main();
