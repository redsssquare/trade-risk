#!/usr/bin/env node
/**
 * Тестирование рендера изображения Daily Digest (buildDigestImageData + renderDigestImage).
 *
 * DRY_RUN=1 — только buildDigestImageData и проверки данных, без puppeteer.
 * Без DRY_RUN — полный рендер и сохранение PNG в bridge-state/digest-images/.
 *
 * Usage:
 *   DRY_RUN=1 node scripts/test-digest-image-render.js
 *   node scripts/test-digest-image-render.js
 *
 * For full render (PNG), install bridge deps first: cd services/bridge && npm install
 * On Linux, if Chrome fails with "libnss3.so: cannot open shared object file", install deps:
 *   see services/bridge/PUPPETEER-LINUX.md
 * Output: scripts/output/digest-images/*.png
 */

const fs = require("fs");
const path = require("path");
const { buildDigestImageData, renderDigestImage } = require("../services/bridge/render/digest-image");
const { classifyImpactTypeForEvent } = require("../lib/anchor-event-classifier");

const DRY_RUN = process.env.DRY_RUN === "1";
const OUT_DIR = path.join(__dirname, "output", "digest-images");

const EMPTY_DAY_DESCRIPTION = "Высокозначимых событий не запланировано";

function getMoscowDateStr() {
  return new Date().toLocaleString("en-CA", { timeZone: "Europe/Moscow" }).slice(0, 10);
}

function getMoscowDayBoundsLocal(moscowDateStr) {
  const [y, m, day] = moscowDateStr.split("-").map(Number);
  const startLocal = new Date(Date.UTC(y, m - 1, day) - 3 * 3600 * 1000);
  const endLocal = new Date(startLocal.getTime() + 24 * 3600 * 1000 - 1);
  return { dayStartMs: startLocal.getTime(), dayEndMs: endLocal.getTime() };
}

const normalizeText = (value) => String(value || "").toLowerCase().trim();

function buildPayloads(moscowDateStr) {
  const d = moscowDateStr;
  const t10 = `${d}T10:00:00+03:00`;
  const t11 = `${d}T11:00:00+03:00`;
  const t12 = `${d}T12:00:00+03:00`;
  const t14 = `${d}T14:00:00+03:00`;
  const t16 = `${d}T16:00:00+03:00`;
  const t18 = `${d}T18:00:00+03:00`;

  return [
    { index: 1, name: "case-1-empty", expectedLevel: "calm", items: [] },
    {
      index: 2,
      name: "case-2-regular",
      expectedLevel: "intense",
      items: [
        { title: "Retail Sales", date: t10, impact: "High", country: "USD" },
        { title: "Unemployment Claims", date: t11, impact: "High", country: "USD" },
        { title: "Core CPI", date: t12, impact: "High", country: "USD" },
        { title: "ISM Manufacturing", date: t14, impact: "High", country: "USD" },
        { title: "Consumer Confidence", date: t16, impact: "High", country: "USD" },
        { title: "Building Permits", date: t18, impact: "High", country: "USD" },
      ],
    },
    {
      index: 3,
      name: "case-3-anchor",
      expectedLevel: "intense",
      items: [
        { title: "Retail Sales", date: t10, impact: "High", country: "USD" },
        { title: "Unemployment Claims", date: t11, impact: "High", country: "USD" },
        { title: "FOMC Rate Decision", date: t14, impact: "High", country: "USD" },
        { title: "Consumer Confidence", date: t16, impact: "High", country: "USD" },
      ],
    },
    {
      index: 4,
      name: "case-4-cluster-no-anchor",
      expectedLevel: "intense",
      items: [
        { title: "Retail Sales", date: t10, impact: "High", country: "USD" },
        { title: "Unemployment Claims", date: t10, impact: "High", country: "USD" },
        { title: "Core PPI", date: t10, impact: "High", country: "USD" },
        { title: "ISM Manufacturing", date: t14, impact: "High", country: "USD" },
        { title: "Trade Balance", date: t14, impact: "High", country: "USD" },
        { title: "Building Permits", date: t18, impact: "High", country: "USD" },
      ],
    },
    {
      index: 5,
      name: "case-5-cluster-anchor",
      expectedLevel: "intense",
      items: [
        { title: "Retail Sales", date: t10, impact: "High", country: "USD" },
        { title: "FOMC Rate Decision", date: t14, impact: "High", country: "USD" },
        { title: "Preliminary PMI", date: t14, impact: "High", country: "USD" },
        { title: "Core CPI", date: t14, impact: "High", country: "USD" },
        { title: "Consumer Confidence", date: t16, impact: "High", country: "USD" },
      ],
    },
    {
      index: 7,
      name: "case-7-one-event",
      expectedLevel: "moderate",
      items: [{ title: "Core CPI", date: t14, impact: "High", country: "USD" }],
    },
    {
      index: 10,
      name: "case-10-no-country",
      expectedLevel: "moderate",
      items: [{ title: "Retail Sales", date: t10, impact: "High" }],
    },
    {
      index: 11,
      name: "case-11-two-currencies",
      expectedLevel: "intense",
      items: [
        { title: "Retail Sales", date: t10, impact: "High", country: "USD" },
        { title: "Canada GDP", date: t11, impact: "High", country: "CAD" },
        { title: "Unemployment Claims", date: t12, impact: "High", country: "USD" },
        { title: "ISM Manufacturing", date: t14, impact: "High", country: "CAD" },
      ],
    },
    {
      index: 12,
      name: "case-12-three-currencies",
      expectedLevel: "intense",
      items: [
        { title: "Retail Sales", date: t10, impact: "High", country: "USD" },
        { title: "Canada GDP", date: t11, impact: "High", country: "CAD" },
        { title: "UK CPI", date: t12, impact: "High", country: "GBP" },
        { title: "ISM Manufacturing", date: t14, impact: "High", country: "USD" },
      ],
    },
  ];
}

function getWithAnchor(items, moscowDateStr) {
  const { dayStartMs, dayEndMs } = getMoscowDayBoundsLocal(moscowDateStr);
  const highImpactOnly = items.filter(
    (item) =>
      item &&
      typeof item.date === "string" &&
      normalizeText(item.impact || "") === "high"
  );
  const todayEvents = highImpactOnly.filter((item) => {
    const eventMs = Date.parse(item.date);
    return Number.isFinite(eventMs) && eventMs >= dayStartMs && eventMs <= dayEndMs;
  });
  return todayEvents.map((item) => {
    const { impact_type, anchor_label } = classifyImpactTypeForEvent({
      title: item.title || "",
      impact: item.impact || "",
    });
    return {
      ...item,
      impact_type: impact_type || "high",
      anchor_label: anchor_label || null,
      is_anchor: impact_type === "anchor_high",
    };
  });
}

function assertImageData(caseName, imageData, expectedLevel) {
  const issues = [];

  if (imageData.level !== expectedLevel) {
    issues.push(`level: expected ${expectedLevel}, got ${imageData.level}`);
  }

  if (expectedLevel === "calm" && !imageData.emptyDay) {
    issues.push("emptyDay: expected true for calm");
  }
  if (expectedLevel === "calm" && imageData.currencies !== "") {
    issues.push("currencies: expected empty for empty day");
  }
  if (expectedLevel === "calm") {
    if (imageData.description !== EMPTY_DAY_DESCRIPTION) {
      issues.push(`description for empty day must be "${EMPTY_DAY_DESCRIPTION}", got: ${imageData.description}`);
    }
  }

  if (expectedLevel === "moderate" || expectedLevel === "intense") {
    if (imageData.emptyDay) {
      issues.push("emptyDay: expected false for non-empty case");
    }
  }

  if (caseName.includes("anchor") && !caseName.includes("no-anchor") && expectedLevel === "intense") {
    if (!imageData.peakActivity) {
      issues.push(`peakActivity for anchor case should not be empty`);
    }
  }

  if (caseName.includes("cluster-no-anchor") && !imageData.peakActivity) {
    issues.push(`peakActivity for cluster-no-anchor should not be empty`);
  }

  if (caseName === "case-7-one-event") {
    if (imageData.description !== "Одно значимое событие") {
      issues.push(`description: expected "Одно значимое событие", got ${imageData.description}`);
    }
  }

  if (caseName === "case-10-no-country") {
    if (!imageData.currencies.includes("USD")) {
      issues.push(`currencies: expected USD fallback, got: ${imageData.currencies}`);
    }
  }

  // currencies is now stored as comma-separated codes (e.g. "USD,CAD"); no triple-space check needed

  return issues;
}

function runDryRun(moscowDateStr, payloads) {
  let failures = 0;
  for (const { name, expectedLevel, items } of payloads) {
    const withAnchor = getWithAnchor(items, moscowDateStr);
    const imageData = buildDigestImageData(withAnchor, { moscowDateStr });
    const issues = assertImageData(name, imageData, expectedLevel);
    if (issues.length > 0) {
      console.error(`[FAIL] ${name}`);
      issues.forEach((i) => console.error(`       ✗ ${i}`));
      failures++;
    } else {
      console.log(
        `[OK]   ${name} level=${imageData.level} emptyDay=${imageData.emptyDay} peakActivity=${imageData.peakActivity ? "yes" : "no"} currencies=${imageData.currencies ? "yes" : "no"}`
      );
    }
  }
  if (failures > 0) {
    console.error(`\n[DRY_RUN] Завершено с ошибками: ${failures} из ${payloads.length} кейсов.`);
    process.exitCode = 1;
  } else {
    console.log(`\n[DRY_RUN] Все ${payloads.length} кейсов прошли. Запустите без DRY_RUN для рендера PNG.`);
  }
}

async function runFullRender(moscowDateStr, payloads) {
  if (!fs.existsSync(path.dirname(OUT_DIR))) {
    fs.mkdirSync(path.dirname(OUT_DIR), { recursive: true });
  }
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  let failures = 0;
  for (const { name, expectedLevel, items } of payloads) {
    const withAnchor = getWithAnchor(items, moscowDateStr);
    const imageData = buildDigestImageData(withAnchor, { moscowDateStr });
    const issues = assertImageData(name, imageData, expectedLevel);
    if (issues.length > 0) {
      console.error(`[FAIL] ${name}`);
      issues.forEach((i) => console.error(`       ✗ ${i}`));
      failures++;
      continue;
    }
    try {
      const buffer = await renderDigestImage(imageData);
      const outPath = path.join(OUT_DIR, `${name}.png`);
      fs.writeFileSync(outPath, buffer);
      console.log(`[OK]   ${name} → ${outPath}`);
    } catch (err) {
      console.error(`[FAIL] ${name} render:`, err && err.message ? err.message : err);
      failures++;
    }
  }

  if (failures > 0) {
    console.error(`\n[render] Завершено с ошибками: ${failures} из ${payloads.length} кейсов.`);
    process.exitCode = 1;
  } else {
    console.log(`\n[render] Все ${payloads.length} изображений сохранены в ${OUT_DIR}`);
  }
}

async function main() {
  const moscowDateStr = getMoscowDateStr();
  const payloads = buildPayloads(moscowDateStr);

  console.log("[test-digest-image-render] Дата (MSK):", moscowDateStr);
  console.log("[test-digest-image-render] Режим:", DRY_RUN ? "DRY_RUN (без puppeteer)" : "render PNG");
  console.log("[test-digest-image-render] Кейсов:", payloads.length, "\n");

  if (DRY_RUN) {
    runDryRun(moscowDateStr, payloads);
  } else {
    await runFullRender(moscowDateStr, payloads);
  }
}

main();
