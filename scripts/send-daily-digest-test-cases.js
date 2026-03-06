#!/usr/bin/env node
/**
 * Тестирование daily digest.
 *
 * DRY_RUN=1  — локальный прогон без отправки в Telegram (форматтер + проверки).
 * По умолчанию (без DRY_RUN) — отправка через bridge в TELEGRAM_TEST_CHANNEL_ID.
 *
 * Usage:
 *   DRY_RUN=1 node scripts/send-daily-digest-test-cases.js
 *   BRIDGE_URL=http://localhost:3000 node scripts/send-daily-digest-test-cases.js
 *   SELECT_CASES=1,2,5 node scripts/send-daily-digest-test-cases.js  — только кейсы 1, 2, 5
 *   SELECT_CASES=13,14,15,16 … — отправить в Telegram только: Спокойный, Умеренный, Насыщенный, 4 валюты (лимит 3)
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");

const DRY_RUN = process.env.DRY_RUN === "1";
const BRIDGE_URL = process.env.BRIDGE_URL || "http://localhost:3000";
// SELECT_CASES=1,2,5 — отправить только кейсы с номерами 1, 2, 5 (1-based). Без переменной — все кейсы.
const SELECT_CASES_RAW = process.env.SELECT_CASES || "";

// Список запрещённых слов (из server.js FORBIDDEN_TELEGRAM_WORDS)
const FORBIDDEN_WORDS = [
  "рекомендуем", "будьте", "следите", "критический",
  "экстремальный", "паника", "режим", "уровень", "контроль"
];

// Разрешённые эмодзи для дайджеста (из digest-phrases.js)
const ALLOWED_EMOJI = ["📈", "⚡", "🇺🇸", "🇪🇺", "🇬🇧", "🇯🇵", "🇦🇺", "🇨🇦", "🇨🇭", "🇳🇿", "🇨🇳",
  "🇸🇪", "🇳🇴", "🇸🇬", "🇭🇰", "🇲🇽", "🇿🇦", "🇹🇷", "🇮🇳", "🇧🇷", "🇰🇷", "🇵🇱"];

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
    // ── Основные 5 кейсов ─────────────────────────────────────────────────────
    { name: "Кейс 1 — нет событий", items: [] },
    {
      name: "Кейс 2 — обычные события",
      items: [
        { title: "Retail Sales",        date: t10, impact: "High", country: "USD" },
        { title: "Unemployment Claims", date: t11, impact: "High", country: "USD" },
        { title: "Core CPI",            date: t12, impact: "High", country: "USD" },
        { title: "ISM Manufacturing",   date: t14, impact: "High", country: "USD" },
        { title: "Consumer Confidence", date: t16, impact: "High", country: "USD" },
        { title: "Building Permits",    date: t18, impact: "High", country: "USD" }
      ]
    },
    {
      name: "Кейс 3 — якорное событие",
      items: [
        { title: "Retail Sales",        date: t10, impact: "High", country: "USD" },
        { title: "Unemployment Claims", date: t11, impact: "High", country: "USD" },
        { title: "FOMC Rate Decision",  date: t14, impact: "High", country: "USD" },
        { title: "Consumer Confidence", date: t16, impact: "High", country: "USD" }
      ]
    },
    {
      name: "Кейс 4 — кластер без якоря",
      items: [
        { title: "Retail Sales",        date: t10, impact: "High", country: "USD" },
        { title: "Unemployment Claims", date: t10, impact: "High", country: "USD" },
        { title: "Core PPI",            date: t10, impact: "High", country: "USD" },
        { title: "ISM Manufacturing",   date: t14, impact: "High", country: "USD" },
        { title: "Trade Balance",       date: t14, impact: "High", country: "USD" },
        { title: "Building Permits",    date: t18, impact: "High", country: "USD" }
      ]
    },
    {
      name: "Кейс 5 — кластер + якорь",
      items: [
        { title: "Retail Sales",        date: t10, impact: "High", country: "USD" },
        { title: "FOMC Rate Decision",  date: t14, impact: "High", country: "USD" },
        { title: "Preliminary PMI",     date: t14, impact: "High", country: "USD" },
        { title: "Core CPI",            date: t14, impact: "High", country: "USD" },
        { title: "Consumer Confidence", date: t16, impact: "High", country: "USD" }
      ]
    },

    // ── Граничные кейсы ────────────────────────────────────────────────────────
    {
      name: "Кейс 6 (граничный) — пустой payload {}",
      items: [],
      _emptyPayload: true
    },
    {
      name: "Кейс 7 (граничный) — одно событие",
      items: [
        { title: "Core CPI", date: t14, impact: "High", country: "USD" }
      ]
    },
    {
      name: "Кейс 8 (граничный) — одно якорное событие",
      items: [
        { title: "FOMC Rate Decision", date: t14, impact: "High", country: "USD" }
      ]
    },
    {
      name: "Кейс 9 (граничный) — событие без title",
      items: [
        { title: "", date: t10, impact: "High", country: "USD" },
        { title: "Core CPI", date: t12, impact: "High", country: "USD" }
      ]
    },
    {
      name: "Кейс 10 (граничный) — событие без валюты",
      items: [
        { title: "Retail Sales", date: t10, impact: "High" }
      ]
    },
    {
      name: "Кейс 11 (граничный) — максимум: 10 событий",
      items: [
        { title: "Retail Sales",        date: t10, impact: "High", country: "USD" },
        { title: "Core PPI",            date: t10, impact: "High", country: "USD" },
        { title: "Unemployment Claims", date: t11, impact: "High", country: "USD" },
        { title: "Core CPI",            date: t12, impact: "High", country: "USD" },
        { title: "FOMC Rate Decision",  date: t14, impact: "High", country: "USD" },
        { title: "ISM Manufacturing",   date: t14, impact: "High", country: "USD" },
        { title: "Preliminary PMI",     date: t14, impact: "High", country: "USD" },
        { title: "Consumer Confidence", date: t16, impact: "High", country: "USD" },
        { title: "Trade Balance",       date: t16, impact: "High", country: "USD" },
        { title: "Building Permits",    date: t18, impact: "High", country: "USD" }
      ]
    },
    {
      name: "Кейс 12 (граничный) — незнакомый title (без перевода)",
      items: [
        { title: "Some Unknown Indicator XYZ", date: t14, impact: "High", country: "EUR" }
      ]
    },

    // ── Тест отправки в Telegram: уровень + валюты ─────────────────────────────
    { name: "Кейс 13 — Спокойный день (0 событий)", items: [] },
    {
      name: "Кейс 14 — Умеренный день (1 событие, EUR)",
      items: [
        { title: "ECB Rate Decision", date: t14, impact: "High", country: "EUR" }
      ]
    },
    {
      name: "Кейс 15 — Насыщенный день (USD, CAD, GBP)",
      items: [
        { title: "Retail Sales", date: t10, impact: "High", country: "USD" },
        { title: "Canada GDP", date: t11, impact: "High", country: "CAD" },
        { title: "UK CPI", date: t12, impact: "High", country: "GBP" },
        { title: "FOMC Rate Decision", date: t14, impact: "High", country: "USD" },
        { title: "Consumer Confidence", date: t16, impact: "High", country: "CAD" }
      ]
    },
    {
      name: "Кейс 16 — 4 валюты (лимит Затронет = 3)",
      items: [
        { title: "Retail Sales", date: t10, impact: "High", country: "USD" },
        { title: "Canada GDP", date: t11, impact: "High", country: "CAD" },
        { title: "UK CPI", date: t12, impact: "High", country: "GBP" },
        { title: "ECB Rate Decision", date: t14, impact: "High", country: "EUR" },
        { title: "ISM Manufacturing", date: t16, impact: "High", country: "USD" }
      ]
    }
  ];
}

// ── DRY_RUN: локальная проверка без сети ──────────────────────────────────────

function runDryRun(moscowDateStr, payloads) {
  const { formatDailyDigest } = require("../services/bridge/render/digest-format");
  const { classifyImpactTypeForEvent } = require("../lib/anchor-event-classifier");

  const { dayStartMs, dayEndMs } = getMoscowDayBoundsLocal(moscowDateStr);

  let failures = 0;

  for (const { name, items } of payloads) {
    const highToday = items
      .filter(
        (item) =>
          item &&
          typeof item.date === "string" &&
          (item.impact || "").toLowerCase() === "high"
      )
      .filter((item) => {
        const ms = Date.parse(item.date);
        return Number.isFinite(ms) && ms >= dayStartMs && ms <= dayEndMs;
      });

    const withAnchor = highToday.map((item) => {
      const { impact_type, anchor_label } = classifyImpactTypeForEvent({
        title: item.title || "",
        impact: item.impact || "",
        country: item.country || "USD"
      });
      return {
        ...item,
        impact_type: impact_type || "high",
        anchor_label: anchor_label || null,
        is_anchor: impact_type === "anchor_high"
      };
    });

    let text;
    let threw = false;
    try {
      text = formatDailyDigest(withAnchor, { moscowDateStr });
    } catch (e) {
      console.error(`[FAIL] ${name}\n       THROW: ${e.message}`);
      failures++;
      threw = true;
    }

    if (threw) continue;

    const issues = [];

    // 1. Запрещённые слова
    const lower = text.toLowerCase();
    for (const word of FORBIDDEN_WORDS) {
      if (lower.includes(word)) {
        issues.push(`запрещённое слово: "${word}"`);
      }
    }

    // 2. Внутренние термины (не должны попадать в текст)
    const internalTerms = ["high-событие", "anchor_high", "anchor_label", "is_anchor", "impact_type"];
    for (const term of internalTerms) {
      if (lower.includes(term.toLowerCase())) {
        issues.push(`внутренний термин в тексте: "${term}"`);
      }
    }

    // 3. Подсчёт строк (мягкий ориентир: не более 15 для дайджеста)
    const lineCount = text.split("\n").length;
    if (lineCount > 15) {
      issues.push(`строк: ${lineCount} > 15`);
    }

    // 4. Наличие заголовка
    if (!text.includes("📈 Обзор дня")) {
      issues.push("нет заголовка 📈 Обзор дня");
    }

    // 5. Для непустых: наличие closing
    if (withAnchor.length > 0 && !text.includes("Предупредим перед каждым окном")) {
      issues.push("нет closing-фразы");
    }

    // 6. Для якорных: наличие ⚡
    const hasAnchor = withAnchor.some((e) => e.is_anchor);
    if (hasAnchor && !text.includes("⚡")) {
      issues.push("якорное событие есть, но ⚡ отсутствует");
    }

    if (issues.length > 0) {
      console.error(`[FAIL] ${name}`);
      for (const issue of issues) console.error(`       ✗ ${issue}`);
      console.log(`       Текст:\n${text.split("\n").map(l => "         " + l).join("\n")}`);
      failures++;
    } else {
      const lines = text.split("\n");
      console.log(`[OK]   ${name} (${lines.length} строк, ${text.length} симв)`);
      for (const l of lines) console.log("       " + l);
    }
    console.log();
  }

  if (failures > 0) {
    console.error(`\n[DRY_RUN] Завершено с ошибками: ${failures} из ${payloads.length} кейсов.`);
    process.exitCode = 1;
  } else {
    console.log(`\n[DRY_RUN] Все ${payloads.length} кейсов прошли. Можно запускать без DRY_RUN.`);
  }
}

function getMoscowDayBoundsLocal(moscowDateStr) {
  const [y, m, day] = moscowDateStr.split("-").map(Number);
  const startLocal = new Date(Date.UTC(y, m - 1, day) - 3 * 3600 * 1000);
  const endLocal = new Date(startLocal.getTime() + 24 * 3600 * 1000 - 1);
  return { dayStartMs: startLocal.getTime(), dayEndMs: endLocal.getTime() };
}

// ── Сетевой прогон (отправка через bridge) ────────────────────────────────────

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
        try { parsed = data ? JSON.parse(data) : {}; } catch (_e) {}
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

async function runSend(payloads) {
  console.log("[send-daily-digest-test-cases] Bridge URL:", BRIDGE_URL);
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

// ── Main ──────────────────────────────────────────────────────────────────────

function filterPayloadsBySelectCases(payloads) {
  if (!SELECT_CASES_RAW.trim()) return payloads;
  const indices = SELECT_CASES_RAW.split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 1);
  if (indices.length === 0) return payloads;
  return payloads.filter((_, i) => indices.includes(i + 1));
}

async function main() {
  const moscowDateStr = getMoscowDateStr();
  let payloads = buildPayloads(moscowDateStr);
  payloads = filterPayloadsBySelectCases(payloads);

  console.log("[send-daily-digest-test-cases] Дата (MSK):", moscowDateStr);
  console.log("[send-daily-digest-test-cases] Режим:", DRY_RUN ? "DRY_RUN (локально, без отправки)" : "SEND (отправка в Telegram)");
  console.log("[send-daily-digest-test-cases] Кейсов:", payloads.length, SELECT_CASES_RAW.trim() ? `(SELECT_CASES=${SELECT_CASES_RAW})` : "", "\n");

  if (DRY_RUN) {
    runDryRun(moscowDateStr, payloads);
  } else {
    await runSend(payloads);
  }
}

main();
