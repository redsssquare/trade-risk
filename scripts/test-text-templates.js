/**
 * test-text-templates.js — скрипт тестирования текстовых шаблонов Telegram-канала Trade and Risk.
 * Stage 1: каркас и функции валидации.
 * Stage 2: тесты Volatility Window.
 */

const { renderTelegramTextTemplate } = require("../services/bridge/render/telegram-render");
const { renderHighTemplate } = require("../services/bridge/render/templates/high");
const { renderAnchorHighTemplate } = require("../services/bridge/render/templates/anchor_high");
const { PRE_EVENT, DURING_EVENT, GREEN } = require("../services/bridge/render/phrases");
const { formatDailyDigest } = require("../services/bridge/render/digest-format");
const { DIGEST_EMPTY_BODY } = require("../services/bridge/render/digest-phrases");
const { formatWeeklyAhead, validateWeeklyAhead } = require("../services/bridge/render/weekly-ahead-format");
const { formatWeeklyEnd, validateWeeklyEnd } = require("../services/bridge/render/weekly-end-format");
const {
  LEVEL_CALM_PHRASES: WE_CALM,
  LEVEL_MODERATE_PHRASES: WE_MODERATE,
  LEVEL_SATURATED_PHRASES: WE_SATURATED,
  HIGH_EVENTS_PHRASES: WE_HIGH,
  ANCHOR_ZERO_PHRASES: WE_ANC0,
  ANCHOR_ONE_PHRASES: WE_ANC1,
  ANCHOR_TWO_PHRASES: WE_ANC2,
  CLUSTERS_ZERO_PHRASES: WE_CL0,
  CLUSTERS_ONE_PHRASES: WE_CL1,
  CLUSTERS_TWO_PHRASES: WE_CL2,
  CLOSING_PHRASES: WE_CLOSING,
} = require("../services/bridge/render/weekly-end-phrases");
const {
  LEVEL_CALM_PHRASES: WA_CALM,
  LEVEL_MODERATE_PHRASES: WA_MODERATE,
  LEVEL_SATURATED_PHRASES: WA_SATURATED,
  ANCHOR_ZERO_PHRASES: WA_ANC0,
  ANCHOR_ONE_PHRASES: WA_ANC1,
  ANCHOR_TWO_PHRASES: WA_ANC2,
  ANCHOR_MANY_PHRASES: WA_ANCM,
  CLOSING_PHRASES: WA_CLOSING,
} = require("../services/bridge/render/weekly-ahead-phrases");

const report = {
  totalTemplates: 0,
  totalScenarios: 0,
  errors: 0,
  warnings: 0,
  problems: [],
  warnings_list: [],
};

const FORBIDDEN_SERVER = [
  "рекомендуем", "будьте", "следите", "критический", "экстремальный",
  "паника", "режим", "уровень", "контроль",
];

const FORBIDDEN_WEEKLY_END = [
  "рекомендуем", "режим", "будьте", "следите", "критический", "экстремальный",
  "паника", "уровень", "контроль", "шторм", "сильно", "опасно",
];

const FORBIDDEN_WEEKLY_AHEAD = [
  "рекомендуем", "режим", "будьте", "следите", "критический", "экстремальный",
  "паника", "уровень", "контроль", "шторм", "сильно", "опасно",
];

const FORBIDDEN_COMBINED = [...new Set([...FORBIDDEN_SERVER, ...FORBIDDEN_WEEKLY_END, ...FORBIDDEN_WEEKLY_AHEAD])];

const inAllThree = (w) => FORBIDDEN_SERVER.includes(w) && FORBIDDEN_WEEKLY_END.includes(w) && FORBIDDEN_WEEKLY_AHEAD.includes(w);
const FORBIDDEN_DIFF = FORBIDDEN_COMBINED.filter((w) => !inAllThree(w));

/** Возвращает массив незаполненных плейсхолдеров {name} в тексте. */
function checkPlaceholders(text) {
  const matches = text.match(/\{[a-z_]+\}/g);
  return matches ? [...matches] : [];
}

/** Возвращает true, если в тексте есть двойные пробелы. */
function checkDoubleSpaces(text) {
  return text.includes("  ");
}

/** Проверяет, что первое слово после эмодзи ⚡⏳🔴🟢 начинается с заглавной буквы. */
function checkCapitalizeAfterEmoji(text) {
  const pattern = /[⚡⏳🔴🟢]\s+[a-zа-яё]/;
  return !pattern.test(text);
}

/** Возвращает первое найденное запрещённое слово или null. Регистронезависимая проверка. */
function checkForbiddenWords(text, wordList) {
  for (const word of wordList) {
    const re = new RegExp("\\b" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
    if (re.test(text)) return word;
  }
  return null;
}

/** Возвращает true, если в тексте есть подстрока ??:?? */
function checkInvalidTimeFormat(text) {
  return text.includes("??:??");
}

/** Добавляет запись в массив problems. */
function logProblem(module, template, problem, suggestedFix) {
  report.problems.push({ module, template, problem, suggestedFix });
  report.errors++;
}

/** Добавляет строку в массив warnings. */
function logWarning(message) {
  report.warnings_list.push(message);
  report.warnings++;
}

/** Запускает все 5 проверок для текста. context = { module, scenario, template }. */
function runAllChecks(text, context) {
  const { module, scenario, template } = context;
  let ok = true;

  const placeholders = checkPlaceholders(text);
  if (placeholders.length > 0) {
    logProblem(module, template, `Unfilled placeholders: ${placeholders.join(", ")}`, "Replace placeholders with actual values");
    ok = false;
  }

  if (checkDoubleSpaces(text)) {
    logProblem(module, template, "Double spaces found", "Remove extra spaces");
    ok = false;
  }

  if (!checkCapitalizeAfterEmoji(text)) {
    logProblem(module, template, "Word after emoji must start with capital letter", "Capitalize first letter after emoji");
    ok = false;
  }

  const forbidden = checkForbiddenWords(text, FORBIDDEN_COMBINED);
  if (forbidden) {
    logProblem(module, template, `Forbidden word: ${forbidden}`, "Remove or replace the word");
    ok = false;
  }

  if (checkInvalidTimeFormat(text)) {
    logProblem(module, template, "Invalid time format ??:??", "Use valid time format");
    ok = false;
  }

  return { ok };
}

// ---- Daily Digest fixtures ----
const moscowDateStr = "2026-03-10";

const eventsEmpty = [];

const eventsNormal = [
  { date: "2026-03-10T12:30:00Z", title: "Retail Sales", country: "USD", is_anchor: false },
  { date: "2026-03-10T14:00:00Z", title: "Consumer Confidence", country: "USD", is_anchor: false },
];

const eventsAnchor = [
  { date: "2026-03-10T12:30:00Z", title: "US CPI", country: "USD", is_anchor: true, anchor_label: "US CPI" },
];

const eventsCluster = [
  { date: "2026-03-10T13:30:00Z", title: "Non-Farm Payrolls", country: "USD", is_anchor: false },
  { date: "2026-03-10T13:30:00Z", title: "Unemployment Rate", country: "USD", is_anchor: false },
];

const eventsClusterAnchor = [
  { date: "2026-03-10T13:30:00Z", title: "Non-Farm Payrolls", country: "USD", is_anchor: true, anchor_label: "NFP" },
  { date: "2026-03-10T13:30:00Z", title: "Unemployment Rate", country: "USD", is_anchor: false },
];

const eventsInvalidDate = [
  { date: "not-a-date", title: "Mystery Event", country: "EUR", is_anchor: false },
];

function testDailyDigest() {
  const cases = [
    {
      events: eventsEmpty,
      scenario: "empty",
      expect: (t) =>
        t.includes("Обзор дня") &&
        /спокойн|тихо|пустой|нет|важных/.test(t),
    },
    {
      events: eventsNormal,
      scenario: "normal",
      expect: (t) =>
        !t.includes("{time}") &&
        !t.includes("{title}") &&
        !t.includes("{geo}") &&
        (t.includes("15:30") || t.includes("17:00")),
    },
    {
      events: eventsAnchor,
      scenario: "anchor",
      expect: (t) => t.includes("⚡"),
    },
    {
      events: eventsCluster,
      scenario: "cluster",
      expect: (t) => t.includes("Серия из"),
    },
    {
      events: eventsClusterAnchor,
      scenario: "cluster_anchor",
      expect: (t) => t.includes("⚡"),
    },
    {
      events: eventsInvalidDate,
      scenario: "invalid_date",
      expect: () => true,
    },
  ];

  const errorsBefore = report.errors;
  let scenarios = 0;

  for (const { events, scenario, expect } of cases) {
    scenarios++;
    report.totalScenarios++;
    const text = formatDailyDigest(events, { moscowDateStr });
    runAllChecks(text, { module: "digest-format", scenario, template: scenario });
    if (!expect(text)) {
      logProblem("digest-format", scenario, "Context expectation failed", "Check template output");
    }
  }

  report.totalTemplates += DIGEST_EMPTY_BODY.length;

  const errors = report.errors - errorsBefore;
  console.log(`[Stage 3] Daily Digest: ${scenarios} сценариев, ${errors} ошибок`);
}

function testVolatilityWindow() {
  const payloadHigh = {
    phase: "pre_event",
    impact_type: "high",
    event_name: "Retail Sales",
    minutes_to_event: 10,
    currencies: ["USD"],
    currency: "USD",
  };

  const payloadAnchor = {
    phase: "pre_event",
    impact_type: "anchor_high",
    event_name: "US CPI",
    anchor_label: "US CPI",
    minutes_to_event: 10,
    currencies: ["USD"],
    currency: "USD",
  };

  const payloadStack = {
    phase: "pre_event",
    impact_type: "high",
    cluster_size: 3,
    event_name: "Cluster",
    minutes_to_event: 10,
    currencies: ["USD"],
  };

  const payloadAnchorStack = {
    phase: "pre_event",
    impact_type: "anchor_high",
    cluster_size: 3,
    cluster_has_anchor: true,
    cluster_anchor_names: ["US CPI"],
    anchor_label: "US CPI",
    event_name: "US CPI",
    minutes_to_event: 10,
    currencies: ["USD"],
  };

  const payloadDuringHigh = { ...payloadHigh, phase: "during_event" };
  const payloadDuringStack = { ...payloadStack, phase: "during_event" };
  const payloadGreenSingle = { state: "GREEN" };
  const payloadGreenCluster = { state: "GREEN" };
  const optsGreenCluster = { previousClusterSize: 3 };

  const scenarios = [
    { payload: payloadHigh, opts: {}, scenario: "payloadHigh PRE_EVENT", expect: (t) => t.includes("⏳") && t.includes("10") && !t.includes("⚡") },
    { payload: payloadAnchor, opts: {}, scenario: "payloadAnchor PRE_EVENT", expect: (t) => t.includes("⚡") && t.includes("10") },
    { payload: payloadStack, opts: {}, scenario: "payloadStack PRE_EVENT", expect: (t) => t.includes("⏳") || t.includes("серия") },
    { payload: payloadAnchorStack, opts: {}, scenario: "payloadAnchorStack PRE_EVENT", expect: (t) => t.includes("⚡") && (t.includes("серия") || t.includes("CPI")) },
    { payload: payloadDuringHigh, opts: {}, scenario: "payloadDuringHigh", expect: (t) => t.includes("🔴") },
    { payload: payloadDuringStack, opts: {}, scenario: "payloadDuringStack", expect: (t) => t.includes("🔴") },
    { payload: payloadGreenSingle, opts: {}, scenario: "payloadGreenSingle", expect: (t) => t.includes("🟢") },
    { payload: payloadGreenCluster, opts: optsGreenCluster, scenario: "payloadGreenCluster", expect: (t) => t.includes("🟢") },
  ];

  const errorsBefore = report.errors;
  for (const { payload, opts, scenario, expect } of scenarios) {
    report.totalScenarios++;
    const text = renderTelegramTextTemplate(payload, opts);
    runAllChecks(text, { module: "telegram-render", scenario, template: scenario });
    if (!expect(text)) {
      logProblem("telegram-render", scenario, "Context expectation failed", "Check template output");
    }
  }

  const preCount = Object.values(PRE_EVENT).flat().length;
  const duringCount = Object.values(DURING_EVENT).flat().length;
  const greenCount = Object.values(GREEN).flat().length;
  report.totalTemplates += preCount + duringCount + greenCount;

  const errors = report.errors - errorsBefore;
  console.log(`[Stage 2] Volatility Window: ${scenarios.length} сценариев, ${errors} ошибок`);
}

function testWeeklyAhead() {
  const scenarios = [
    ["CALM-anchor0",      { week_range: "10–14.03", high_events: 2, anchor_events: 0, clusters: 0, active_days: ["Wed"], quiet_days_count: 0 }, "спокойн", null],
    ["CALM-downgraded",   { week_range: "17–21.03", high_events: 5, anchor_events: 0, clusters: 0, active_days: ["Wed"], quiet_days_count: 3 }, "спокойн", null],
    ["MODERATE-anchor1",  { week_range: "24–28.03", high_events: 5, anchor_events: 1, clusters: 0, active_days: ["Wed", "Thu"], quiet_days_count: 0 }, "умерен", ["одно", "одна", "один"]],
    ["SATURATED-anchor2", { week_range: "31.03–04.04", high_events: 8, anchor_events: 2, clusters: 2, active_days: ["Tue", "Wed", "Thu"], quiet_days_count: 0 }, "насыщен", ["два", "две"]],
    ["MODERATE-anchor0",  { week_range: "07–11.04", high_events: 3, anchor_events: 0, clusters: 1, active_days: ["Mon"], quiet_days_count: 0 }, "умерен", null],
    ["MODERATE-anchor2",  { week_range: "21–25.04", high_events: 5, anchor_events: 2, clusters: 1, active_days: ["Wed", "Fri"], quiet_days_count: 0 }, "умерен", ["два", "две"]],
    ["SATURATED-anchor4", { week_range: "28.04–02.05", high_events: 8, anchor_events: 4, clusters: 2, active_days: ["Tue", "Wed", "Thu"], quiet_days_count: 0 }, "насыщен", ["4"]],
  ];

  const errorsBefore = report.errors;
  for (const [label, payload, levelSub, anchorHints] of scenarios) {
    report.totalScenarios++;
    const text = formatWeeklyAhead(payload);
    const val = validateWeeklyAhead(payload, text);
    if (!val.ok) {
      logProblem("weekly-ahead-format", label, `validateWeeklyAhead failed: ${val.reason}`, "Проверить логику форматирования");
    }
    runAllChecks(text, { module: "weekly-ahead-format", scenario: label, template: label });
    if (!text.toLowerCase().includes(levelSub)) {
      logProblem("weekly-ahead-format", label, `Ожидался уровень "${levelSub}" в тексте`, "Проверить getScore/getLevelFromScore");
    }
    if (anchorHints) {
      const lower = text.toLowerCase();
      if (!anchorHints.some((h) => lower.includes(h))) {
        logProblem("weekly-ahead-format", label, `Ожидался anchor-хинт (${anchorHints.join("|")}) в тексте`, "Проверить ANCHOR_*_PHRASES");
      }
    }
  }

  report.totalTemplates += WA_CALM.length + WA_MODERATE.length + WA_SATURATED.length +
    WA_ANC0.length + WA_ANC1.length + WA_ANC2.length + WA_ANCM.length + WA_CLOSING.length;

  const errors = report.errors - errorsBefore;
  console.log(`[Stage 4] Weekly Ahead: ${scenarios.length} сценариев, ${errors} ошибок`);
}

function testWeeklyEnd() {
  const scenarios = [
    // [label, payload, levelKey, windowStr, activeDay1, activeDay2]
    ["CALM-0anc-0cl",
      { week_range: "10–14.03", high_events: 2, anchor_events: 0, clusters: 0, total_window_minutes: 30, active_days: [], quiet_days_count: 0 },
      "calm", "30м", null, null],
    ["MODERATE-1anc-0cl",
      { week_range: "17–21.03", high_events: 5, anchor_events: 1, clusters: 0, total_window_minutes: 75, active_days: ["Wed"], quiet_days_count: 0 },
      "moderate", "1ч 15м", "среду", null],
    ["SATURATED-2anc-1cl",
      { week_range: "24–28.03", high_events: 6, anchor_events: 2, clusters: 1, total_window_minutes: 120, active_days: ["Wed", "Thu"], quiet_days_count: 0 },
      "saturated", "2ч", null, null],
    ["SATURATED-3anc-2cl",
      { week_range: "31.03–04.04", high_events: 10, anchor_events: 3, clusters: 2, total_window_minutes: 160, active_days: ["Tue", "Wed", "Thu"], quiet_days_count: 0 },
      "saturated", "2ч 40м", null, null],
    ["CALM-downgraded",
      { week_range: "07–11.04", high_events: 5, anchor_events: 0, clusters: 0, total_window_minutes: 45, active_days: [], quiet_days_count: 3 },
      "calm", "45м", null, null],
    ["MODERATE-quiet-note",
      { week_range: "14–18.04", high_events: 7, anchor_events: 1, clusters: 0, total_window_minutes: 90, active_days: ["Thu"], quiet_days_count: 3 },
      "moderate", "1ч 30м", null, null],
    ["SATURATED-2days",
      { week_range: "21–25.04", high_events: 8, anchor_events: 2, clusters: 2, total_window_minutes: 200, active_days: ["Tue", "Thu"], quiet_days_count: 0 },
      "saturated", "3ч 20м", null, null],
  ];

  const errorsBefore = report.errors;
  for (const [label, payload, expectedLevel, windowStr, day1Acc, day2Acc] of scenarios) {
    report.totalScenarios++;
    const { text, levelKey } = formatWeeklyEnd(payload);
    const val = validateWeeklyEnd(payload, text, levelKey);
    if (!val.ok) {
      logProblem("weekly-end-format", label, `validateWeeklyEnd failed: ${val.reason}`, "Проверить логику форматирования");
    }
    runAllChecks(text, { module: "weekly-end-format", scenario: label, template: label });
    if (levelKey !== expectedLevel) {
      logProblem("weekly-end-format", label, `Ожидался levelKey "${expectedLevel}", получен "${levelKey}"`, "Проверить getScore/getLevelFromScore/applyQuietDowngrade");
    }
    if (!text.includes(windowStr)) {
      logProblem("weekly-end-format", label, `Ожидалась строка окна "${windowStr}" в тексте`, "Проверить formatMinutes/WINDOW_LINE");
    }
    if (day1Acc && !text.toLowerCase().includes(day1Acc)) {
      logProblem("weekly-end-format", label, `Ожидался день "${day1Acc}" в тексте`, "Проверить DISTRIBUTION_ONE_PHRASES и падеж");
    }
    // quiet_days_count >= 3 → QUIET_NOTE
    if (Number(payload.quiet_days_count) >= 3) {
      if (!text.includes("тихим") && !text.includes("тихо") && !text.includes("тих")) {
        logWarning(`[${label}] quiet_days_count>=3 но QUIET_NOTE не найден в тексте`);
      }
    }
  }

  report.totalTemplates += WE_CALM.length + WE_MODERATE.length + WE_SATURATED.length +
    WE_HIGH.length + WE_ANC0.length + WE_ANC1.length + WE_ANC2.length +
    WE_CL0.length + WE_CL1.length + WE_CL2.length + WE_CLOSING.length;

  const errors = report.errors - errorsBefore;
  console.log(`[Stage 5] Weekly End: ${scenarios.length} сценариев, ${errors} ошибок`);
}

function testHardcodedTemplates() {
  const errorsBefore = report.errors;
  let scenarioCount = 0;

  // ---- renderHighTemplate ----
  const highScenarios = [
    ["high-pre-single",       { phase: "pre_event", minutes_to_event: 5 }],
    ["high-pre-series",       { phase: "pre_event", minutes_to_event: 10, cluster_size: 3 }],
    ["high-pre-series-anchor",{ phase: "pre_event", minutes_to_event: 10, cluster_size: 3, cluster_has_anchor: true, cluster_anchor_names: ["US CPI"] }],
    ["high-during",           { phase: "during_event" }],
    ["high-unknown-phase",    { phase: "green" }],
  ];

  for (const [label, payload] of highScenarios) {
    scenarioCount++;
    report.totalScenarios++;
    const text = renderHighTemplate(payload);
    const ph = checkPlaceholders(text);
    if (ph.length > 0) logProblem("templates/high.js", label, `Unfilled: ${ph.join(",")}`, "Fix placeholder in high.js");
    if (checkDoubleSpaces(text)) logProblem("templates/high.js", label, "Double spaces", "Fix spacing");
    const fw = checkForbiddenWords(text, FORBIDDEN_COMBINED);
    if (fw) logProblem("templates/high.js", label, `Forbidden word: ${fw}`, "Remove word");
    if (!text || !text.trim()) logProblem("templates/high.js", label, "Empty output", "Add fallback in high.js");
  }

  // ---- renderAnchorHighTemplate ----
  const anchorScenarios = [
    ["anchor-pre-single",  { phase: "pre_event", event_name: "US CPI", minutes_to_event: 10 }],
    ["anchor-pre-series",  { phase: "pre_event", event_name: "US CPI", minutes_to_event: 10, cluster_size: 3 }],
    ["anchor-during",      { phase: "during_event", event_name: "US CPI" }],
    ["anchor-unknown",     { phase: "unknown" }],
  ];

  for (const [label, payload] of anchorScenarios) {
    scenarioCount++;
    report.totalScenarios++;
    const text = renderAnchorHighTemplate(payload);
    const ph = checkPlaceholders(text);
    if (ph.length > 0) logProblem("templates/anchor_high.js", label, `Unfilled: ${ph.join(",")}`, "Fix placeholder in anchor_high.js");
    if (checkDoubleSpaces(text)) logProblem("templates/anchor_high.js", label, "Double spaces", "Fix spacing");
    const fw = checkForbiddenWords(text, FORBIDDEN_COMBINED);
    if (fw) logProblem("templates/anchor_high.js", label, `Forbidden word: ${fw}`, "Remove word");
    if (!text || !text.trim()) logProblem("templates/anchor_high.js", label, "Empty output", "Add fallback in anchor_high.js");
  }

  // Сравнение тона: anchor pre_event должен содержать ⚡ в обоих рендерах
  {
    const p = { phase: "pre_event", impact_type: "anchor_high", event_name: "US CPI", anchor_label: "US CPI", minutes_to_event: 10, currencies: ["USD"], currency: "USD" };
    const tmplText = renderTelegramTextTemplate(p, {});
    const anchorText = renderAnchorHighTemplate({ phase: "pre_event", event_name: "US CPI", minutes_to_event: 10 });
    if (!tmplText.includes("⚡") && !anchorText.includes("⚡")) {
      logWarning("anchor pre_event: ни telegram-render, ни anchor_high.js не используют ⚡");
    }
  }

  const errors = report.errors - errorsBefore;
  console.log(`[Stage 7b] Hardcoded templates (high/anchor_high): ${scenarioCount} сценариев, ${errors} ошибок`);
}

function testFallbacks() {
  const errorsBefore = report.errors;
  let scenarioCount = 0;

  // Fallback 1: pre_event — нет совпадающей категории (минимальный payload без phase)
  // renderTelegramTextTemplate с phase=pre_event и пустым payload → должен вернуть fallback строку
  {
    scenarioCount++;
    report.totalScenarios++;
    const text = renderTelegramTextTemplate({ phase: "pre_event", minutes_to_event: 7 }, {});
    const ph = checkPlaceholders(text);
    if (ph.length > 0) logProblem("telegram-render", "pre_event-fallback", `Unfilled placeholders: ${ph.join(",")}`, "Fix fallback string");
    if (!text || !text.trim()) logProblem("telegram-render", "pre_event-fallback", "Empty fallback text", "Add fallback phrase");
    if (text.includes("undefined") || text.includes("NaN")) logProblem("telegram-render", "pre_event-fallback", "undefined/NaN in fallback", "Fix fallback");
  }

  // Fallback 2: during_event
  {
    scenarioCount++;
    report.totalScenarios++;
    const text = renderTelegramTextTemplate({ phase: "during_event" }, {});
    const ph = checkPlaceholders(text);
    if (ph.length > 0) logProblem("telegram-render", "during_event-fallback", `Unfilled placeholders: ${ph.join(",")}`, "Fix fallback string");
    if (!text || !text.trim()) logProblem("telegram-render", "during_event-fallback", "Empty fallback text", "Add fallback phrase");
  }

  // Fallback 3: GREEN — state GREEN и нет предыдущего cluster
  {
    scenarioCount++;
    report.totalScenarios++;
    const text = renderTelegramTextTemplate({ state: "GREEN" }, {});
    if (!text.includes("🟢")) logProblem("telegram-render", "GREEN-fallback", "GREEN fallback missing 🟢 emoji", "Add 🟢 to GREEN fallback");
    const ph = checkPlaceholders(text);
    if (ph.length > 0) logProblem("telegram-render", "GREEN-fallback", `Unfilled: ${ph.join(",")}`, "Fix GREEN fallback");
  }

  // Fallback 4: default — неизвестный phase
  {
    scenarioCount++;
    report.totalScenarios++;
    const text = renderTelegramTextTemplate({ phase: "unknown_phase" }, {});
    const ph = checkPlaceholders(text);
    if (ph.length > 0) logProblem("telegram-render", "default-fallback", `Unfilled: ${ph.join(",")}`, "Fix default fallback");
    if (!text || !text.trim()) logProblem("telegram-render", "default-fallback", "Empty default fallback", "Add default fallback phrase");
  }

  // Fallback 5: null payload → GREEN fallback
  {
    scenarioCount++;
    report.totalScenarios++;
    const text = renderTelegramTextTemplate(null, {});
    if (!text || !text.trim()) logProblem("telegram-render", "null-payload-fallback", "Empty text for null payload", "Add null guard");
    const ph = checkPlaceholders(text || "");
    if (ph.length > 0) logProblem("telegram-render", "null-payload-fallback", `Unfilled: ${ph.join(",")}`, "Fix null fallback");
  }

  const errors = report.errors - errorsBefore;
  console.log(`[Stage 7] Fallbacks: ${scenarioCount} сценариев, ${errors} ошибок`);
}

function testMassGeneration() {
  const EVENT_NAMES = ["US CPI", "NFP", "FOMC Rate Decision", "Retail Sales", "Consumer Confidence", "GDP", "Powell Speech", "PMI", "Trade Balance", "Unemployment Rate"];
  const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD"];
  const PHASES = ["pre_event", "during_event"];
  const IMPACT_TYPES = ["high", "anchor_high"];

  function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function rndInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  const generated = [];
  const suspicious = [];
  let volatilityCount = 0;

  // 200+ Volatility сообщений
  for (let i = 0; i < 220; i++) {
    const phase = rnd(PHASES);
    const impactType = rnd(IMPACT_TYPES);
    const eventName = rnd(EVENT_NAMES);
    const currency = rnd(CURRENCIES);
    const clusterSize = Math.random() < 0.3 ? rndInt(2, 4) : 1;
    const hasAnchor = clusterSize > 1 && Math.random() < 0.5;

    const payload = {
      phase,
      impact_type: impactType,
      event_name: eventName,
      anchor_label: impactType === "anchor_high" ? eventName : undefined,
      minutes_to_event: rndInt(1, 15),
      currencies: [currency],
      currency,
      cluster_size: clusterSize > 1 ? clusterSize : undefined,
      cluster_has_anchor: hasAnchor || undefined,
      cluster_anchor_names: hasAnchor ? [eventName] : undefined,
    };

    const text = renderTelegramTextTemplate(payload, {});
    report.totalScenarios++;
    volatilityCount++;
    generated.push(text);

    // проверки
    const ph = checkPlaceholders(text);
    if (ph.length > 0) logProblem("mass-gen-volatility", `iter-${i}`, `Unfilled: ${ph.join(",")}`, "Fix placeholder substitution");
    if (checkDoubleSpaces(text)) logProblem("mass-gen-volatility", `iter-${i}`, "Double spaces", "Fix spacing");
    if (text.includes("undefined") || text.includes("NaN")) logProblem("mass-gen-volatility", `iter-${i}`, "undefined/NaN in output", "Check payload fields");
    if (checkInvalidTimeFormat(text)) logProblem("mass-gen-volatility", `iter-${i}`, "??:?? in output", "Fix time format");
    if (text.length > 180) suspicious.push(`[long] ${text.slice(0, 100)}...`);
    if (/(\b\w+\b) \1/i.test(text)) suspicious.push(`[repeat] ${text}`);
  }

  // 30 Digest
  const digestEventPools = [
    [],
    [{ date: "2026-03-10T12:30:00Z", title: "Retail Sales", country: "USD", is_anchor: false }],
    [{ date: "2026-03-10T13:30:00Z", title: "NFP", country: "USD", is_anchor: true, anchor_label: "NFP" }],
    [{ date: "2026-03-10T13:30:00Z", title: "NFP", country: "USD", is_anchor: false }, { date: "2026-03-10T13:30:00Z", title: "Unemployment", country: "USD", is_anchor: false }],
  ];
  const digestDates = ["2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13", "2026-03-14", "2026-03-17", "2026-03-18"];
  for (let i = 0; i < 30; i++) {
    const events = digestEventPools[i % digestEventPools.length];
    const dateStr = digestDates[i % digestDates.length];
    const text = formatDailyDigest(events, { moscowDateStr: dateStr });
    report.totalScenarios++;
    generated.push(text);
    if (checkPlaceholders(text).length > 0) logProblem("mass-gen-digest", `iter-${i}`, "Unfilled placeholders", "Fix digest format");
    if (checkInvalidTimeFormat(text)) logProblem("mass-gen-digest", `iter-${i}`, "??:?? in digest output", "Fix time format");
  }

  // 10 Weekly Ahead
  const waWeeks = ["10–14.03", "17–21.03", "24–28.03", "31.03–04.04", "07–11.04", "14–18.04", "21–25.04", "28.04–02.05", "05–09.05", "12–16.05"];
  const waHighArr = [2, 4, 6, 8, 10, 3, 5, 7, 9, 12];
  const waAncArr = [0, 1, 2, 3, 0, 1, 2, 4, 0, 2];
  const waClArr = [0, 0, 1, 2, 0, 1, 0, 2, 1, 3];
  for (let i = 0; i < 10; i++) {
    const payload = { week_range: waWeeks[i], high_events: waHighArr[i], anchor_events: waAncArr[i], clusters: waClArr[i], active_days: ["Wed"], quiet_days_count: 0 };
    const text = formatWeeklyAhead(payload);
    report.totalScenarios++;
    generated.push(text);
    if (checkPlaceholders(text).length > 0) logProblem("mass-gen-weekly-ahead", `iter-${i}`, "Unfilled placeholders", "Fix weekly-ahead format");
  }

  // 10 Weekly End
  const weWeeks = ["10–14.03", "17–21.03", "24–28.03", "31.03–04.04", "07–11.04", "14–18.04", "21–25.04", "28.04–02.05", "05–09.05", "12–16.05"];
  const weWinArr = [30, 75, 120, 160, 45, 90, 200, 0, 55, 140];
  for (let i = 0; i < 10; i++) {
    const payload = { week_range: weWeeks[i], high_events: waHighArr[i], anchor_events: waAncArr[i], clusters: waClArr[i], total_window_minutes: weWinArr[i], active_days: ["Wed"], quiet_days_count: 0 };
    const { text } = formatWeeklyEnd(payload);
    report.totalScenarios++;
    generated.push(text);
    if (checkPlaceholders(text).length > 0) logProblem("mass-gen-weekly-end", `iter-${i}`, "Unfilled placeholders", "Fix weekly-end format");
  }

  // дубли
  const unique = new Set(generated);
  const dupRate = ((generated.length - unique.size) / generated.length * 100).toFixed(1);
  if (parseFloat(dupRate) > 30) {
    logWarning(`Высокий процент дублей: ${dupRate}% (${generated.length - unique.size} из ${generated.length})`);
  }

  // сохранить 20 примеров для отчёта
  report._massGenSamples = generated.filter((_, i) => i % 11 === 0).slice(0, 20);
  report._suspiciousPhrases = [...new Set(suspicious)].slice(0, 20);
  report._dupRate = dupRate;
  report._massGenTotal = generated.length;

  console.log(`[Stage 6] Mass generation: ${generated.length} сообщений, дублей ${dupRate}%, подозрительных фраз: ${suspicious.length}`);
}

function generateReport() {
  const fs = require("fs");
  const path = require("path");
  const lines = [];

  lines.push("═".repeat(70));
  lines.push("  ОТЧЁТ: Тестирование текстовых шаблонов Trade and Risk");
  lines.push("═".repeat(70));
  lines.push("");

  // 1. Список проблем
  lines.push("── 1. СПИСОК НАЙДЕННЫХ ПРОБЛЕМ " + "─".repeat(39));
  if (report.problems.length === 0) {
    lines.push("  Проблем не найдено.");
  } else {
    for (const p of report.problems) {
      lines.push(`  FILE:     ${p.module}`);
      lines.push(`  TEMPLATE: ${p.template || "—"}`);
      lines.push(`  PROBLEM:  ${p.problem}`);
      lines.push(`  FIX:      ${p.suggestedFix}`);
      lines.push("");
    }
  }
  lines.push("");

  // 2. Потенциально неудачные фразы
  lines.push("── 2. ПОТЕНЦИАЛЬНО НЕУДАЧНЫЕ ФРАЗЫ " + "─".repeat(35));
  const suspicious = report._suspiciousPhrases || [];
  if (suspicious.length === 0) {
    lines.push("  Подозрительных фраз не обнаружено.");
  } else {
    for (const s of suspicious) {
      lines.push(`  * ${s}`);
    }
  }
  lines.push("");

  // 3. Статистика
  lines.push("── 3. СТАТИСТИКА " + "─".repeat(53));
  lines.push(`  Всего шаблонов:           ${report.totalTemplates}`);
  lines.push(`  Протестировано сценариев: ${report.totalScenarios}`);
  lines.push(`  Массовая генерация:       ${report._massGenTotal || 0} сообщений (дублей ${report._dupRate || "0"}%)`);
  lines.push(`  Ошибок:                   ${report.errors}`);
  lines.push(`  Предупреждений:           ${report.warnings}`);
  lines.push("");

  // 4. 20 случайных примеров
  lines.push("── 4. 20 СЛУЧАЙНЫХ ПРИМЕРОВ СООБЩЕНИЙ " + "─".repeat(31));
  const samples = report._massGenSamples || [];
  if (samples.length === 0) {
    lines.push("  Примеры недоступны.");
  } else {
    samples.forEach((s, i) => {
      lines.push(`  [${String(i + 1).padStart(2, "0")}] ${s.replace(/\n/g, " | ")}`);
    });
  }
  lines.push("");

  // 5. Расхождения FORBIDDEN_WORDS
  lines.push("── 5. РАСХОЖДЕНИЯ FORBIDDEN_WORDS " + "─".repeat(36));
  if (FORBIDDEN_DIFF.length === 0) {
    lines.push("  Все списки запрещённых слов согласованы.");
  } else {
    lines.push("  Слова, присутствующие не во всех файлах:");
    for (const w of FORBIDDEN_DIFF) {
      const inServer = FORBIDDEN_SERVER.includes(w) ? "server.js" : null;
      const inWE = FORBIDDEN_WEEKLY_END.includes(w) ? "weekly-end-phrases.js" : null;
      const inWA = FORBIDDEN_WEEKLY_AHEAD.includes(w) ? "weekly-ahead-phrases.js" : null;
      const present = [inServer, inWE, inWA].filter(Boolean).join(", ");
      lines.push(`    "${w}": ${present}`);
    }
  }
  lines.push("");

  // 6. Предупреждения
  if (report.warnings_list.length > 0) {
    lines.push("── 6. ПРЕДУПРЕЖДЕНИЯ " + "─".repeat(49));
    for (const w of report.warnings_list) {
      lines.push(`  ! ${w}`);
    }
    lines.push("");
  }

  lines.push("═".repeat(70));
  const verdict = report.errors === 0 ? "OK: Все проверки пройдены" : `FAIL: Найдено ошибок: ${report.errors}`;
  lines.push(`  ИТОГ: ${verdict}`);
  lines.push("═".repeat(70));

  const reportText = lines.join("\n");
  console.log("\n" + reportText);

  const reportPath = path.join(__dirname, "template-test-report.txt");
  fs.writeFileSync(reportPath, reportText, "utf8");
  console.log(`\n[test-text-templates] Отчёт сохранён: ${reportPath}`);

  return report.errors;
}

/** Точка входа. */
async function main() {
  console.log("[test-text-templates] Starting...");

  testVolatilityWindow();
  testDailyDigest();
  testWeeklyAhead();
  testWeeklyEnd();
  testHardcodedTemplates();
  testFallbacks();
  testMassGeneration();

  if (FORBIDDEN_DIFF.length > 0) {
    logWarning(`Forbidden lists differ: ${FORBIDDEN_DIFF.join(", ")}`);
  }

  const errorCount = generateReport();
  process.exitCode = errorCount > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
