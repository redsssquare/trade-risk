#!/usr/bin/env node
/**
 * Volatility test runner.
 * Parses docs/volatility_test_cases.md, runs each scenario through lib/volatility-compute.js,
 * compares actual vs expected, outputs PASS/FAIL.
 *
 * Optional mode:
 *   --with-llm
 *     - builds bridge-like payload for each case
 *     - calls real LLM when AI_ENABLED=true
 *     - validates generated telegram_text against test constraints
 *
 * This script never sends Telegram messages.
 */

const fs = require("fs");
const path = require("path");
const { computeFromRawEvents } = require("../lib/volatility-compute.js");

const DOCS_PATH = path.resolve(__dirname, "../docs/volatility_test_cases.md");
const ANCHOR_EVENTS_PATH = path.resolve(__dirname, "../data/anchor_events.json");
const PRE_EVENT_WINDOW_MS = 30 * 60 * 1000;
const DURING_EVENT_WINDOW_MS = 5 * 60 * 1000;
const POST_EVENT_WINDOW_MS = 15 * 60 * 1000;
const FORBIDDEN_TELEGRAM_WORDS = [
  "рекомендуем",
  "будьте",
  "следите",
  "критический",
  "экстремальный",
  "паника",
  "режим",
  "уровень",
  "контроль"
];
const AI_ENABLED = String(process.env.AI_ENABLED || "false").toLowerCase() === "true";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "gpt-4o-mini";
const AI_TIMEOUT_MS = Number.parseInt(process.env.AI_TIMEOUT_MS || "8000", 10);
const RESOLVED_AI_TIMEOUT_MS = Number.isFinite(AI_TIMEOUT_MS) && AI_TIMEOUT_MS > 0 ? AI_TIMEOUT_MS : 8000;

function normalizeText(value) {
  return String(value || "").toLowerCase().trim();
}

function loadAnchorHighAliases() {
  try {
    const raw = fs.readFileSync(ANCHOR_EVENTS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const events = parsed && Array.isArray(parsed.anchor_high_events)
      ? parsed.anchor_high_events
      : [];
    return events
      .flatMap((entry) => Array.isArray(entry.aliases) ? entry.aliases : [])
      .map((alias) => normalizeText(alias))
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

const ANCHOR_HIGH_ALIASES = loadAnchorHighAliases();

function isAnchorHighByEventName(eventName) {
  const normalizedEventName = normalizeText(eventName);
  if (!normalizedEventName) return false;
  return ANCHOR_HIGH_ALIASES.some((alias) => normalizedEventName.includes(alias));
}

function resolvePhaseFromEventTime(eventTimeMs, effectiveNowMs) {
  if (!Number.isFinite(eventTimeMs)) {
    return "none";
  }
  if (eventTimeMs - PRE_EVENT_WINDOW_MS <= effectiveNowMs && effectiveNowMs < eventTimeMs) {
    return "pre_event";
  }
  if (eventTimeMs <= effectiveNowMs && effectiveNowMs < eventTimeMs + DURING_EVENT_WINDOW_MS) {
    return "during_event";
  }
  if (eventTimeMs + DURING_EVENT_WINDOW_MS <= effectiveNowMs && effectiveNowMs < eventTimeMs + POST_EVENT_WINDOW_MS) {
    return "post_event";
  }
  return "none";
}

function buildBridgeLikeContextFromCompute(computeResult, nowMs) {
  if (!computeResult || computeResult.state !== "RED" || !computeResult.primary_event) {
    return null;
  }
  const eventTime = computeResult.primary_event.time;
  const eventTimeMs = Date.parse(eventTime);
  const minutesToEvent = Number.isFinite(eventTimeMs)
    ? (eventTimeMs > nowMs ? Math.max(0, Math.ceil((eventTimeMs - nowMs) / 60000)) : 0)
    : 0;
  return {
    event_name: computeResult.primary_event.name,
    event_title: computeResult.primary_event.name,
    currency: "N/A",
    event_time: eventTime,
    minutes_to_event: minutesToEvent,
    impact: "High",
    impact_type: computeResult.impact_type,
    phase: computeResult.phase,
    contextual_anchor: computeResult.contextual_anchor,
    contextual_anchor_names: computeResult.contextual_anchor_names,
    primary_event: {
      name: computeResult.primary_event.name,
      time: computeResult.primary_event.time
    }
  };
}

function buildVolatilityPayloadLikeBridge(state, context, effectiveNowMs) {
  const safeContext = context && typeof context === "object" ? context : {};
  const eventName = String(safeContext.event_name || safeContext.event_title || "").trim();
  const eventTime = safeContext.event_time || "N/A";
  const eventTimeMs = Date.parse(eventTime);
  const minutesToEvent = Number.isFinite(eventTimeMs)
    ? (eventTimeMs > effectiveNowMs
      ? Math.max(0, Math.ceil((eventTimeMs - effectiveNowMs) / 60000))
      : 0)
    : (Number.isFinite(safeContext.minutes_to_event) ? safeContext.minutes_to_event : 0);
  const impactRaw = normalizeText(safeContext.impact || "High");
  const isHighImpactEvent = state === "RED" && (impactRaw === "high" || !impactRaw);
  const impactTypeFromContext = normalizeText(safeContext.impact_type);
  const impactType = impactTypeFromContext === "anchor_high" || impactTypeFromContext === "high"
    ? impactTypeFromContext
    : (isHighImpactEvent && isAnchorHighByEventName(eventName) ? "anchor_high" : "high");
  const contextualAnchor = safeContext.contextual_anchor === true;
  const contextualAnchorNames = Array.isArray(safeContext.contextual_anchor_names)
    ? safeContext.contextual_anchor_names
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
    : [];
  const primaryEvent = safeContext.primary_event && typeof safeContext.primary_event === "object"
    ? safeContext.primary_event
    : null;
  const fallbackPhase = typeof safeContext.phase === "string" && safeContext.phase.trim()
    ? safeContext.phase.trim()
    : (state === "RED" ? (minutesToEvent > 0 ? "pre_event" : "during_event") : "none");
  const phase = state === "RED" && Number.isFinite(eventTimeMs)
    ? resolvePhaseFromEventTime(eventTimeMs, effectiveNowMs)
    : (state === "GREEN" ? "none" : fallbackPhase);
  return {
    state: state === "RED" ? "RED" : "GREEN",
    impact_type: impactType,
    phase,
    minutes_to_event: minutesToEvent,
    event_name: eventName || "N/A",
    event_time: eventTime,
    contextual_anchor: contextualAnchor,
    contextual_anchor_names: contextualAnchorNames,
    primary_event: primaryEvent
  };
}

function loadOpenAI() {
  try {
    return require("openai");
  } catch (_error) {
    try {
      return require(path.resolve(__dirname, "../services/bridge/node_modules/openai"));
    } catch (_error2) {
      return null;
    }
  }
}

function buildLlmUserMessage(volatilityPayload) {
  return JSON.stringify(volatilityPayload, null, 2);
}

function getDuringEventFirstLine(volatilityPayload) {
  return volatilityPayload.impact_type === "anchor_high"
    ? `Опубликованы данные ${volatilityPayload.event_name}.`
    : "Опубликованы экономические данные.";
}

function countSentences(text) {
  return text
    .split(/[.!?]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .length;
}

const LLM_SYSTEM_PROMPT = [
  "You generate Telegram notifications about market volatility.",
  "Return valid JSON only.",
  "Do not include explanations.",
  "Do not include markdown.",
  "Do not include text outside JSON.",
  "Use the input payload fields as mandatory constraints and do not ignore them.",
  "Generate deterministic text by following strict templates; do not paraphrase key phrases.",
  "If impact_type = anchor_high: event_name MUST be in the first sentence.",
  "If phase = during_event: text MUST contain one of exact phrases:",
  "\"опубликованы данные\" OR \"опубликован\" OR \"вышли данные\" OR \"публикация состоялась\".",
  "If contextual_anchor = true: mention at least one item from contextual_anchor_names explicitly.",
  "Forbidden words are strictly disallowed everywhere:",
  "\"рекомендуем\", \"будьте\", \"следите\", \"критический\", \"экстремальный\", \"паника\", \"режим\", \"уровень\", \"контроль\".",
  "Template rules:",
  "- state=GREEN -> \"🟢 Volatility Window Closed. No high-impact events active.\"",
  "- state=RED & impact_type=high & phase=during_event -> include phrase \"публикация состоялась\".",
  "- state=RED & impact_type=anchor_high & phase=during_event -> first sentence with event_name AND include phrase \"публикация состоялась\".",
  "- state=RED & impact_type=high & contextual_anchor=true -> include one anchor name from contextual_anchor_names.",
  "Max 220 chars, max 3 sentences.",
  "Нарушение этих правил недопустимо.",
  "Сообщение должно соответствовать всем условиям.",
  "Required JSON structure:",
  "{",
  "  \"telegram_text\": \"string\",",
  "  \"tone\": \"alert | calm | neutral\"",
  "}"
].join("\n");

const DURING_EVENT_SECOND_LINE_PROMPT = [
  "You generate ONLY the second line for a Telegram volatility message.",
  "Return valid JSON only.",
  "Do not include explanations.",
  "Do not include markdown.",
  "Do not include text outside JSON.",
  "Generate one short neutral sentence in Russian about current market dynamics.",
  "No recommendations, no forecasts, no dramatization.",
  "Forbidden words are strictly disallowed:",
  "\"рекомендуем\", \"будьте\", \"следите\", \"критический\", \"экстремальный\", \"паника\", \"режим\", \"уровень\", \"контроль\".",
  "Maximum one sentence.",
  "Required JSON structure:",
  "{",
  "  \"second_line\": \"string\",",
  "  \"tone\": \"neutral\"",
  "}"
].join("\n");

async function createOneLlmCompletion(openaiClient, messages) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESOLVED_AI_TIMEOUT_MS);
  try {
    const completion = await openaiClient.chat.completions.create({
      model: AI_MODEL,
      response_format: { type: "json_object" },
      messages
    }, { signal: controller.signal });
    const responseText = completion &&
      completion.choices &&
      completion.choices[0] &&
      completion.choices[0].message &&
      completion.choices[0].message.content;
    if (typeof responseText !== "string" || !responseText.trim()) {
      return { error: "empty_ai_response" };
    }
    return { responseText: responseText.trim() };
  } catch (error) {
    const reason = error && error.name === "AbortError"
      ? `timeout_${RESOLVED_AI_TIMEOUT_MS}ms`
      : "openai_request_failed";
    return { error: reason };
  } finally {
    clearTimeout(timer);
  }
}

function parseTelegramFromResponse(responseText) {
  try {
    const parsed = JSON.parse(responseText);
    const text = parsed && typeof parsed.telegram_text === "string" ? parsed.telegram_text.trim() : "";
    return text || null;
  } catch (_e) {
    return null;
  }
}

function parseSecondLineFromResponse(responseText) {
  try {
    const parsed = JSON.parse(responseText);
    const text = parsed && typeof parsed.second_line === "string" ? parsed.second_line.trim() : "";
    return text || null;
  } catch (_e) {
    return null;
  }
}

function validateDuringEventSecondLine(secondLine) {
  const text = typeof secondLine === "string" ? secondLine.trim() : "";
  if (!text) {
    return { ok: false, reason: "empty_second_line" };
  }
  if (countSentences(text) > 1) {
    return { ok: false, reason: "during_event_second_line_too_many_sentences" };
  }
  const normalizedText = normalizeText(text);
  const forbiddenWord = FORBIDDEN_TELEGRAM_WORDS.find((word) => normalizedText.includes(word));
  if (forbiddenWord) {
    return { ok: false, reason: `forbidden_word:${forbiddenWord}` };
  }
  return { ok: true, reason: "ok" };
}

async function generateMessageWithLlmWithRepair(volatilityPayload, openaiClient) {
  if (volatilityPayload.phase === "during_event") {
    const firstLine = getDuringEventFirstLine(volatilityPayload);
    const systemMessage = { role: "system", content: DURING_EVENT_SECOND_LINE_PROMPT };
    const userPayloadMessage = { role: "user", content: buildLlmUserMessage(volatilityPayload) };
    const result = await createOneLlmCompletion(openaiClient, [systemMessage, userPayloadMessage]);
    if (result.error) {
      return {
        ok: false,
        reason: result.error,
        telegram_text: "",
        llm_attempts: 1,
        repair_triggered: false,
        final_validation_result: null
      };
    }
    const secondLine = parseSecondLineFromResponse(result.responseText);
    if (!secondLine) {
      return {
        ok: false,
        reason: "invalid_json_or_schema",
        telegram_text: "",
        llm_attempts: 1,
        repair_triggered: false,
        final_validation_result: null
      };
    }
    const secondLineValidation = validateDuringEventSecondLine(secondLine);
    if (!secondLineValidation.ok) {
      return {
        ok: false,
        reason: secondLineValidation.reason,
        telegram_text: `${firstLine}\n${secondLine}`,
        llm_attempts: 1,
        repair_triggered: false,
        final_validation_result: secondLineValidation
      };
    }
    const finalText = `${firstLine}\n${secondLine}`;
    const finalValidation = validateTelegramTextForTest(finalText, volatilityPayload);
    if (!finalValidation.ok) {
      return {
        ok: false,
        reason: finalValidation.reason,
        telegram_text: finalText,
        llm_attempts: 1,
        repair_triggered: false,
        final_validation_result: finalValidation
      };
    }
    return {
      ok: true,
      reason: "ok",
      telegram_text: finalText,
      llm_attempts: 1,
      repair_triggered: false,
      final_validation_result: finalValidation
    };
  }

  const systemMessage = { role: "system", content: LLM_SYSTEM_PROMPT };
  const userPayloadMessage = { role: "user", content: buildLlmUserMessage(volatilityPayload) };

  // Attempt 1
  const result1 = await createOneLlmCompletion(openaiClient, [systemMessage, userPayloadMessage]);
  if (result1.error) {
    return {
      ok: false,
      reason: result1.error,
      telegram_text: "",
      llm_attempts: 1,
      repair_triggered: false,
      final_validation_result: null
    };
  }
  const telegram1 = parseTelegramFromResponse(result1.responseText);
  if (!telegram1) {
    return {
      ok: false,
      reason: "invalid_json_or_schema",
      telegram_text: "",
      llm_attempts: 1,
      repair_triggered: false,
      final_validation_result: null
    };
  }
  let validationResult = validateTelegramTextForTest(telegram1, volatilityPayload);
  if (validationResult.ok) {
    return {
      ok: true,
      reason: "ok",
      telegram_text: telegram1,
      llm_attempts: 1,
      repair_triggered: false,
      final_validation_result: validationResult
    };
  }

  // Attempt 2 (repair)
  const repairContent = `Текст нарушает правило: ${validationResult.reason}. Исправь сообщение, сохранив смысл, строго соблюдая все правила.`;
  const result2 = await createOneLlmCompletion(openaiClient, [
    systemMessage,
    userPayloadMessage,
    { role: "user", content: repairContent }
  ]);
  if (result2.error) {
    return {
      ok: false,
      reason: result2.error,
      telegram_text: "",
      llm_attempts: 2,
      repair_triggered: true,
      final_validation_result: validationResult
    };
  }
  const telegram2 = parseTelegramFromResponse(result2.responseText);
  if (!telegram2) {
    return {
      ok: false,
      reason: "invalid_json_or_schema",
      telegram_text: "",
      llm_attempts: 2,
      repair_triggered: true,
      final_validation_result: validationResult
    };
  }
  validationResult = validateTelegramTextForTest(telegram2, volatilityPayload);
  if (validationResult.ok) {
    return {
      ok: true,
      reason: "ok",
      telegram_text: telegram2,
      llm_attempts: 2,
      repair_triggered: true,
      final_validation_result: validationResult
    };
  }
  return {
    ok: false,
    reason: validationResult.reason,
    telegram_text: telegram2,
    llm_attempts: 2,
    repair_triggered: true,
    final_validation_result: validationResult
  };
}

function validateTelegramTextForTest(telegramText, volatilityPayload) {
  const text = typeof telegramText === "string" ? telegramText.trim() : "";
  if (!text) {
    return { ok: false, reason: "empty_text" };
  }
  if (text.length > 220) {
    return { ok: false, reason: "too_long" };
  }
  const sentenceCount = countSentences(text);
  if (sentenceCount > 3) {
    return { ok: false, reason: "too_many_sentences" };
  }

  const normalizedText = normalizeText(text);
  const forbiddenWord = FORBIDDEN_TELEGRAM_WORDS.find((word) => normalizedText.includes(word));
  if (forbiddenWord) {
    return { ok: false, reason: `forbidden_word:${forbiddenWord}` };
  }

  if (volatilityPayload.impact_type === "anchor_high") {
    const normalizedEventName = normalizeText(volatilityPayload.event_name);
    if (normalizedEventName && !normalizedText.includes(normalizedEventName)) {
      return { ok: false, reason: "missing_event_name_for_anchor_high" };
    }
  }

  if (volatilityPayload.contextual_anchor === true && volatilityPayload.phase !== "during_event") {
    const hasAnyAnchorName = Array.isArray(volatilityPayload.contextual_anchor_names) &&
      volatilityPayload.contextual_anchor_names.some((name) => {
        const normalizedName = normalizeText(name);
        return normalizedName && normalizedText.includes(normalizedName);
      });
    if (!hasAnyAnchorName) {
      return { ok: false, reason: "missing_contextual_anchor_name" };
    }
  }

  if (volatilityPayload.phase === "during_event") {
    const firstLine = getDuringEventFirstLine(volatilityPayload);
    if (!text.startsWith(firstLine)) {
      return { ok: false, reason: "invalid_during_event_first_line" };
    }
  }

  return { ok: true, reason: "ok" };
}

// --- Parse events from test case format: "Name, ISO_DATE, Impact" or "A; B; C"
function parseEventsFromString(eventsStr) {
  if (!eventsStr || typeof eventsStr !== "string") return [];
  const parts = eventsStr.split(";").map((s) => s.trim()).filter(Boolean);
  const result = [];
  for (const part of parts) {
    const tokens = part.split(",").map((s) => s.trim());
    if (tokens.length >= 3) {
      const impact = tokens.pop();
      const date = tokens.pop();
      const title = tokens.join(", ");
      result.push({
        title,
        date,
        impact,
        currency: "USD"
      });
    }
  }
  return result;
}

// --- Parse contextual_anchor_names: "[]" or "[\"CPI y/y\"]"
function parseAnchorNames(str) {
  const s = String(str || "").trim();
  if (s === "[]" || s === "") return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

// --- Format primary_event for display: "Name @ HH:MM" or null
function formatPrimaryEvent(pe) {
  if (!pe || typeof pe !== "object") return null;
  const name = pe.name || pe.title || "";
  const time = pe.time || pe.date || "";
  if (!name || !time) return null;
  const hm = time.slice(11, 16); // HH:MM from ISO
  return `${name} @ ${hm}`;
}

// --- Parse boolean
function parseBool(s) {
  const v = String(s || "").toLowerCase().trim();
  return v === "true" || v === "1";
}

// --- Parse expected phase: "none (GREEN)" -> "none"
function normalizePhase(s) {
  const v = String(s || "").trim();
  if (v.startsWith("none")) return "none";
  return v;
}

// --- Parse markdown and extract test case rows
function parseTestCasesFromMd(content) {
  const lines = content.split("\n");
  const cases = [];
  let inTable = false;
  let headerLine = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("|")) continue;

    const rawCols = line.split("|").map((c) => c.trim());
    const cols = rawCols.slice(1, 8);
    if (cols.length < 7 || !cols[0] || !cols[1]) continue;

    // Skip header and separator
    if (cols[0] === "now" && cols[1].includes("events")) {
      inTable = true;
      headerLine = i;
      continue;
    }
    if (inTable && cols.some((c) => /^[-]+$/.test(c))) continue; // separator line

    // Data row: now, events, expected_primary_event, expected_phase, expected_impact_type, contextual_anchor, contextual_anchor_names
    const nowStr = cols[0];
    const eventsStr = cols[1];
    const expectedPrimary = cols[2];
    const expectedPhase = cols[3];
    const expectedImpact = cols[4];
    const expectedAnchor = cols[5];
    const expectedAnchorNames = cols[6];

    if (!nowStr || !eventsStr) continue;
    const nowMs = Date.parse(nowStr);
    if (Number.isNaN(nowMs)) continue;

    cases.push({
      now: nowStr,
      nowMs,
      eventsStr,
      events: parseEventsFromString(eventsStr),
      expected: {
        primary_event: expectedPrimary === "null" ? null : expectedPrimary,
        phase: normalizePhase(expectedPhase),
        impact_type: expectedImpact === "null" ? null : expectedImpact,
        contextual_anchor: parseBool(expectedAnchor),
        contextual_anchor_names: parseAnchorNames(expectedAnchorNames)
      }
    });
  }

  return cases;
}

// --- Run single test
async function runTestCase(tc, index, withLlm, openaiClient) {
  const result = computeFromRawEvents(tc.nowMs, tc.events);

  const actualPrimary = formatPrimaryEvent(result.primary_event);
  const actualPhase = result.phase;
  const actualImpact = result.impact_type;
  const actualAnchor = result.contextual_anchor;
  const actualAnchorNames = result.contextual_anchor_names;

  const expPrimary = tc.expected.primary_event;
  const expPhase = tc.expected.phase;
  const expImpact = tc.expected.impact_type;
  const expAnchor = tc.expected.contextual_anchor;
  const expAnchorNames = tc.expected.contextual_anchor_names;

  const primaryOk =
    (expPrimary === null && actualPrimary === null) ||
    (expPrimary !== null && actualPrimary !== null && expPrimary === actualPrimary);
  const phaseOk = expPhase === actualPhase;
  const impactOk =
    (expImpact === null && actualImpact === null) ||
    (expImpact !== null && actualImpact !== null && String(expImpact) === String(actualImpact));
  const anchorOk = expAnchor === actualAnchor;
  const anchorNamesOk =
    Array.isArray(expAnchorNames) &&
    Array.isArray(actualAnchorNames) &&
    expAnchorNames.length === actualAnchorNames.length &&
    expAnchorNames.every((n, i) => n === actualAnchorNames[i]);

  const pass = primaryOk && phaseOk && impactOk && anchorOk && anchorNamesOk;

  let llmValidation = null;
  if (withLlm) {
    if (!AI_ENABLED) {
      llmValidation = { pass: false, reason: "ai_disabled", telegram_text: "" };
    } else if (!openaiClient) {
      llmValidation = { pass: false, reason: "openai_client_unavailable", telegram_text: "" };
    } else {
      const bridgeLikeContext = buildBridgeLikeContextFromCompute(result, tc.nowMs);
      const volatilityPayload = buildVolatilityPayloadLikeBridge(result.state, bridgeLikeContext, tc.nowMs);
      const llmResult = await generateMessageWithLlmWithRepair(volatilityPayload, openaiClient);
      llmValidation = {
        pass: llmResult.ok,
        reason: llmResult.ok ? "ok" : llmResult.reason,
        telegram_text: llmResult.telegram_text || "",
        repair_triggered: llmResult.repair_triggered === true
      };
    }
  }

  return {
    index,
    pass,
    llmValidation,
    now: tc.now,
    expected: {
      primary_event: expPrimary,
      phase: expPhase,
      impact_type: expImpact,
      contextual_anchor: expAnchor,
      contextual_anchor_names: expAnchorNames
    },
    actual: {
      primary_event: actualPrimary,
      phase: actualPhase,
      impact_type: actualImpact,
      contextual_anchor: actualAnchor,
      contextual_anchor_names: actualAnchorNames
    }
  };
}

// --- Main
async function main() {
  const withLlm = process.argv.includes("--with-llm");
  const md = fs.readFileSync(DOCS_PATH, "utf8");
  const cases = parseTestCasesFromMd(md);

  console.log("=== Volatility Test Runner ===\n");
  console.log(`Test file: ${DOCS_PATH}`);
  console.log(`Parsed ${cases.length} test cases.\n`);
  if (withLlm) {
    console.log("Mode: --with-llm");
    console.log(`AI_ENABLED=${AI_ENABLED}`);
    console.log(`AI_MODEL=${AI_MODEL}`);
    console.log();
  }

  let openaiClient = null;
  if (withLlm && AI_ENABLED) {
    const OpenAI = loadOpenAI();
    if (OpenAI && OPENAI_API_KEY) {
      openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
    }
  }

  let passedLogic = 0;
  let failedLogic = 0;
  let passedLlmValidation = 0;
  let failedLlmValidation = 0;
  let repairTriggeredCount = 0;

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    const r = await runTestCase(tc, i + 1, withLlm, openaiClient);

    console.log(`--- Test ${r.index} (now=${tc.now}) ---`);
    console.log(`expected_primary_event:  ${r.expected.primary_event}`);
    console.log(`actual_primary_event:   ${r.actual.primary_event}`);
    console.log(`expected_phase:        ${r.expected.phase}`);
    console.log(`actual_phase:          ${r.actual.phase}`);
    console.log(`expected_impact_type:  ${r.expected.impact_type}`);
    console.log(`actual_impact_type:    ${r.actual.impact_type}`);
    console.log(`expected_contextual_anchor: ${r.expected.contextual_anchor}`);
    console.log(`actual_contextual_anchor:   ${r.actual.contextual_anchor}`);
    console.log(`expected_contextual_anchor_names: ${JSON.stringify(r.expected.contextual_anchor_names)}`);
    console.log(`actual_contextual_anchor_names:   ${JSON.stringify(r.actual.contextual_anchor_names)}`);
    console.log(`result: ${r.pass ? "PASS" : "FAIL"}`);
    if (withLlm) {
      console.log(`validation: ${r.llmValidation && r.llmValidation.pass ? "PASS" : "FAIL"}`);
      if (r.llmValidation && r.llmValidation.repair_triggered) {
        console.log(`repair_triggered: true`);
      }
      if (!r.llmValidation || !r.llmValidation.pass) {
        console.log(`validation_reason: ${r.llmValidation ? r.llmValidation.reason : "unknown_validation_error"}`);
      }
    }
    console.log();

    if (r.pass) passedLogic++;
    else failedLogic++;
    if (withLlm) {
      if (r.llmValidation && r.llmValidation.pass) {
        passedLlmValidation++;
      } else {
        failedLlmValidation++;
      }
      if (r.llmValidation && r.llmValidation.repair_triggered) {
        repairTriggeredCount++;
      }
    }
  }

  console.log("=== Summary ===");
  console.log(`total_tests: ${cases.length}`);
  console.log(`passed_logic: ${passedLogic}`);
  if (withLlm) {
    console.log(`passed_llm_validation: ${passedLlmValidation}`);
    console.log(`failed_llm_validation: ${failedLlmValidation}`);
    console.log(`repair_triggered: ${repairTriggeredCount}`);
  }
  process.exit((failedLogic > 0 || (withLlm && failedLlmValidation > 0)) ? 1 : 0);
}

main().catch((error) => {
  console.error("runner_error:", error && error.message ? error.message : error);
  process.exit(1);
});
