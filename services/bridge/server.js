const express = require("express");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const { computeFromRawEvents } = require("./lib/volatility-compute");
const { classifyImpactTypeForEvent, getClusterAnchorNames } = require("./lib/anchor-event-classifier");
const { renderTelegramTextTemplate, getDuringEventFirstLine } = require("./render/telegram-render");

const app = express();
const PORT = 3000;
const OPENCLAW_RUNTIME_URL = process.env.OPENCLAW_RUNTIME_URL || "http://openclaw:18789/tools/invoke";
const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || "";
const OPENCLAW_TELEGRAM_CHAT_ID = process.env.OPENCLAW_TELEGRAM_CHAT_ID || "";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "";
const OPENCLAW_B2_TEST_MESSAGE = process.env.OPENCLAW_B2_TEST_MESSAGE || "[B2 TEST] POST -> bridge -> openclaw -> Telegram";
const AI_ENABLED = String(process.env.AI_ENABLED || "false").toLowerCase() === "true";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "gpt-4o-mini";
const AI_TIMEOUT_MS = Number.parseInt(process.env.AI_TIMEOUT_MS || "8000", 10);
const RESOLVED_AI_TIMEOUT_MS = Number.isFinite(AI_TIMEOUT_MS) && AI_TIMEOUT_MS > 0 ? AI_TIMEOUT_MS : 8000;
const HEARTBEAT_INTERVAL_MS_RAW = Number.parseInt(process.env.HEARTBEAT_INTERVAL_MS || "", 10);
const HEARTBEAT_INTERVAL_MS = Number.isFinite(HEARTBEAT_INTERVAL_MS_RAW) && HEARTBEAT_INTERVAL_MS_RAW > 0
  ? HEARTBEAT_INTERVAL_MS_RAW
  : 60 * 60 * 1000;
const openaiClient = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const SIMULATION_NOW = process.env.SIMULATION_NOW || "";
const PRE_EVENT_WINDOW_MS = 7 * 60 * 1000;
const DURING_EVENT_WINDOW_MS = 4 * 60 * 1000;
const POST_EVENT_WINDOW_MS = 9 * 60 * 1000;
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
const metrics = {
  llm_success_count: 0,
  llm_fallback_count: 0,
  last_latency: null,
  current_volatility_state: "UNKNOWN"
};
const notificationState = {
  previous_state: null,
  previous_phase: null
};

const SIMULATION_NOW_MS = SIMULATION_NOW ? Date.parse(SIMULATION_NOW) : null;
const SIMULATION_MODE = Boolean(SIMULATION_NOW) && Number.isFinite(SIMULATION_NOW_MS);

if (SIMULATION_NOW && !SIMULATION_MODE) {
  console.warn("[bridge:simulation:invalid_now]", JSON.stringify({
    simulation_now_value: SIMULATION_NOW
  }));
}

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const SIMULATED_DAY_PATH = process.env.SIMULATED_DAY_PATH || path.resolve(__dirname, "../../data/simulated_day.json");
const SIMULATION_SPEED_DEFAULT = 6;
const CALENDAR_URL = process.env.CALENDAR_URL || "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const CALENDAR_CACHE_TTL_MS = 55 * 60 * 1000;
const CALENDAR_TEST_MODE = String(process.env.CALENDAR_TEST_MODE || "false").toLowerCase() === "true";
const calendarCache = {
  fetched_at_ms: null,
  payload: null
};
const simulationClockState = {
  start_time: null,
  simulation_speed: null,
  simulation_start_real_time: null
};

app.get("/simulation-config", (_req, res) => {
  try {
    const raw = fs.readFileSync(SIMULATED_DAY_PATH, "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data.start_time !== "string" || !Array.isArray(data.events)) {
      return res.status(500).json({ error: "invalid_shape" });
    }
    const speed = Number(process.env.SIMULATION_SPEED);
    const resolvedSpeed = Number.isFinite(speed) && speed > 0 ? speed : SIMULATION_SPEED_DEFAULT;
    const realNow = Date.now();
    const shouldResetClock =
      simulationClockState.simulation_start_real_time === null ||
      simulationClockState.start_time !== data.start_time ||
      simulationClockState.simulation_speed !== resolvedSpeed;

    if (shouldResetClock) {
      simulationClockState.start_time = data.start_time;
      simulationClockState.simulation_speed = resolvedSpeed;
      simulationClockState.simulation_start_real_time = realNow;
    }

    res.json({
      start_time: data.start_time,
      events: data.events,
      simulation_speed: resolvedSpeed,
      simulation_start_real_time: simulationClockState.simulation_start_real_time,
      simulation_start_real_time_iso: new Date(simulationClockState.simulation_start_real_time).toISOString(),
      real_now: realNow
    });
  } catch (err) {
    res.status(500).json({ error: err && err.message ? err.message : "read_failed" });
  }
});

app.get("/calendar-feed", async (_req, res) => {
  const nowMs = Date.now();

  if (CALENDAR_TEST_MODE) {
    try {
      const raw = fs.readFileSync(SIMULATED_DAY_PATH, "utf8");
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.events)) {
        return res.status(500).json({ error: "invalid_test_feed_shape" });
      }
      const items = data.events
        .filter((entry) =>
          entry &&
          typeof entry.name === "string" &&
          typeof entry.time === "string" &&
          typeof entry.impact === "string")
        .map((entry) => ({
          title: entry.name,
          country: "USD",
          date: entry.time,
          impact: entry.impact,
          forecast: "",
          previous: ""
        }));

      return res.json({
        source: "test_file",
        fetched_at: new Date(nowMs).toISOString(),
        items
      });
    } catch (error) {
      return res.status(500).json({
        error: error && error.message ? error.message : "test_feed_read_failed"
      });
    }
  }

  const hasFreshCache = Array.isArray(calendarCache.payload) &&
    Number.isFinite(calendarCache.fetched_at_ms) &&
    nowMs - calendarCache.fetched_at_ms < CALENDAR_CACHE_TTL_MS;

  if (hasFreshCache) {
    return res.json({
      source: "cache",
      fetched_at: new Date(calendarCache.fetched_at_ms).toISOString(),
      items: calendarCache.payload
    });
  }

  try {
    const response = await fetch(CALENDAR_URL, {
      method: "GET",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      throw new Error(`http_status_${response.status}`);
    }
    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error("invalid_json_shape:not_array");
    }

    calendarCache.payload = payload;
    calendarCache.fetched_at_ms = nowMs;

    return res.json({
      source: "live",
      fetched_at: new Date(nowMs).toISOString(),
      items: payload
    });
  } catch (error) {
    const fallbackEventTimeIso = new Date(nowMs + 12 * 60 * 1000).toISOString();
    const fallbackItems = [
      {
        title: "Bridge Fallback Event",
        country: "US",
        date: fallbackEventTimeIso,
        impact: "High",
        forecast: "",
        previous: ""
      }
    ];

    if (Array.isArray(calendarCache.payload)) {
      return res.json({
        source: "stale_cache",
        fetched_at: Number.isFinite(calendarCache.fetched_at_ms)
          ? new Date(calendarCache.fetched_at_ms).toISOString()
          : null,
        items: calendarCache.payload,
        warning: error && error.message ? error.message : "calendar_fetch_failed"
      });
    }

    return res.json({
      source: "fallback_synthetic",
      fetched_at: new Date(nowMs).toISOString(),
      items: fallbackItems,
      warning: error && error.message ? error.message : "calendar_fetch_failed"
    });
  }
});

const normalizeText = (value) => String(value || "").toLowerCase().trim();

const getEffectiveNowMs = () => (SIMULATION_MODE ? SIMULATION_NOW_MS : Date.now());

const normalizeClusterEvents = (clusterEvents) => {
  if (!Array.isArray(clusterEvents)) {
    return [];
  }
  return clusterEvents
    .map((event) => {
      if (!event || typeof event !== "object") {
        return null;
      }
      const name = String(event.name || event.title || "").trim();
      const time = String(event.time || event.date || "").trim();
      const impact = String(event.impact || "").trim();
      if (!name || !time) {
        return null;
      }
      return {
        name,
        time,
        impact
      };
    })
    .filter(Boolean);
};

const resolvePhaseFromEventTime = (eventTimeMs, effectiveNowMs) => {
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
};

const buildVolatilityPayload = (state, context, effectiveNowMs) => {
  const safeContext = context && typeof context === "object" ? context : {};
  const eventName = String(safeContext.event_name || safeContext.event_title || "").trim();
  const eventTime = safeContext.event_time || "N/A";
  const eventTimeMs = Date.parse(eventTime);
  const minutesToEventFromContext = Number.isFinite(safeContext.minutes_to_event)
    ? safeContext.minutes_to_event
    : null;
  const minutesToEventFromEventTime = Number.isFinite(eventTimeMs)
    ? (eventTimeMs > effectiveNowMs
      ? Math.max(0, Math.ceil((eventTimeMs - effectiveNowMs) / 60000))
      : 0)
    : 0;
  const minutesToEvent = minutesToEventFromContext !== null
    ? Math.max(0, Math.ceil(minutesToEventFromContext))
    : minutesToEventFromEventTime;
  const impactRaw = normalizeText(safeContext.impact || "High");
  const isHighImpactEvent = state === "RED" && (impactRaw === "high" || !impactRaw);
  const impactTypeFromContext = normalizeText(safeContext.impact_type);
  const fallbackClassification = classifyImpactTypeForEvent({
    title: eventName,
    impact: isHighImpactEvent ? "High" : ""
  });
  const impactType = impactTypeFromContext === "anchor_high" || impactTypeFromContext === "high"
    ? impactTypeFromContext
    : (fallbackClassification.impact_type || "high");
  const anchorLabel = typeof safeContext.anchor_label === "string" && safeContext.anchor_label.trim()
    ? safeContext.anchor_label.trim()
    : (impactType === "anchor_high" ? fallbackClassification.anchor_label : null);
  const clusterEvents = normalizeClusterEvents(safeContext.cluster_events);
  const clusterSize = Number.isFinite(safeContext.cluster_size)
    ? Math.max(0, Math.floor(safeContext.cluster_size))
    : clusterEvents.length;
  const clusterAnchorNamesFromContext = Array.isArray(safeContext.cluster_anchor_names)
    ? safeContext.cluster_anchor_names
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
    : (Array.isArray(safeContext.contextual_anchor_names)
      ? safeContext.contextual_anchor_names
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
      : []);
  const clusterAnchorNamesFromEvents = clusterEvents.length > 0
    ? getClusterAnchorNames(clusterEvents.map((event) => ({
      title: event.name,
      impact: event.impact
    })))
    : [];
  const clusterAnchorNames = clusterAnchorNamesFromContext.length > 0
    ? clusterAnchorNamesFromContext
    : clusterAnchorNamesFromEvents;
  const clusterHasAnchor = safeContext.cluster_has_anchor === true ||
    safeContext.contextual_anchor === true ||
    clusterAnchorNames.length > 0;
  const contextualAnchor = safeContext.contextual_anchor === true;
  const contextualAnchorNames = Array.isArray(safeContext.contextual_anchor_names)
    ? safeContext.contextual_anchor_names
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
    : [];
  const primaryEvent = safeContext.primary_event && typeof safeContext.primary_event === "object"
    ? safeContext.primary_event
    : null;
  const phaseFromContext = typeof safeContext.phase === "string" && safeContext.phase.trim()
    ? safeContext.phase.trim()
    : null;
  const fallbackPhase = phaseFromContext || (state === "RED" ? (minutesToEvent > 0 ? "pre_event" : "during_event") : "none");
  const phase = state === "RED" && phaseFromContext
    ? phaseFromContext
    : (state === "RED" && Number.isFinite(eventTimeMs)
      ? resolvePhaseFromEventTime(eventTimeMs, effectiveNowMs)
      : (state === "GREEN" ? "none" : fallbackPhase));

  return {
    state: state === "RED" ? "RED" : "GREEN",
    impact_type: impactType,
    phase,
    minutes_to_event: minutesToEvent,
    event_name: eventName || "N/A",
    event_time: eventTime,
    anchor_label: anchorLabel,
    contextual_anchor: contextualAnchor,
    contextual_anchor_names: contextualAnchorNames,
    cluster_has_anchor: clusterHasAnchor,
    cluster_anchor_names: clusterAnchorNames,
    cluster_size: clusterSize,
    cluster_events: clusterEvents,
    primary_event: primaryEvent
  };
};

const generateMessageWithTemplate = (volatilityPayload) => renderTelegramTextTemplate(volatilityPayload);

const buildLlmUserMessage = (volatilityPayload) => JSON.stringify(volatilityPayload, null, 2);

const countSentences = (text) => text
  .split(/[.!?]+/)
  .map((entry) => entry.trim())
  .filter(Boolean)
  .length;

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
  "If cluster_has_anchor = true: treat cluster_anchor_names as higher-priority context.",
  "If phase = pre_event AND cluster_size > 1 AND cluster_has_anchor = false: describe a series of releases, not a single event.",
  "If phase = pre_event AND cluster_size > 1 AND cluster_has_anchor = true: describe a series and include one item from cluster_anchor_names.",
  "If contextual_anchor = true OR cluster_has_anchor = true: mention at least one anchor item explicitly.",
  "Forbidden words are strictly disallowed everywhere:",
  "\"рекомендуем\", \"будьте\", \"следите\", \"критический\", \"экстремальный\", \"паника\", \"режим\", \"уровень\", \"контроль\".",
  "Template rules:",
  "- state=GREEN -> \"🟢 Volatility Window Closed. No high-impact events active.\"",
  "- state=RED & impact_type=high & phase=during_event -> include phrase \"публикация состоялась\".",
  "- state=RED & impact_type=anchor_high & phase=during_event -> first sentence with event_name AND include phrase \"публикация состоялась\".",
  "- state=RED & impact_type=high & cluster_has_anchor=true -> include one anchor name from cluster_anchor_names.",
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

const validateTelegramText = (telegramText, volatilityPayload) => {
  const text = typeof telegramText === "string" ? telegramText.trim() : "";
  if (!text) {
    return { ok: false, reason: "empty_text" };
  }

  if (text.length > 220) {
    return { ok: false, reason: "too_long" };
  }

  const sentenceCount = text
    .split(/[.!?]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .length;
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

  if (volatilityPayload.cluster_has_anchor === true && volatilityPayload.phase !== "during_event") {
    const hasAnyAnchorName = Array.isArray(volatilityPayload.cluster_anchor_names) &&
      volatilityPayload.cluster_anchor_names.some((name) => {
        const normalizedName = normalizeText(name);
        return normalizedName && normalizedText.includes(normalizedName);
      });
    if (!hasAnyAnchorName) {
      return { ok: false, reason: "missing_cluster_anchor_name" };
    }
  }

  return { ok: true, reason: "ok" };
};

const validateDuringEventSecondLine = (secondLine) => {
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
};

const createOneLlmCompletion = async (messages) => {
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
    return typeof responseText === "string" && responseText.trim()
      ? { responseText: responseText.trim() }
      : { error: "empty_ai_response" };
  } catch (error) {
    const reason = error && error.name === "AbortError"
      ? `timeout_${RESOLVED_AI_TIMEOUT_MS}ms`
      : "openai_request_failed";
    return { error: reason };
  } finally {
    clearTimeout(timer);
  }
};

const parseLlmTelegramText = (responseText) => {
  try {
    const parsed = JSON.parse(responseText);
    const text = parsed && typeof parsed.telegram_text === "string" ? parsed.telegram_text.trim() : "";
    return text ? { telegram_text: text } : null;
  } catch (_e) {
    return null;
  }
};

const parseLlmSecondLine = (responseText) => {
  try {
    const parsed = JSON.parse(responseText);
    const text = parsed && typeof parsed.second_line === "string" ? parsed.second_line.trim() : "";
    return text ? { second_line: text } : null;
  } catch (_e) {
    return null;
  }
};

const generateMessageWithLlm = async (volatilityPayload) => {
  const startedAt = Date.now();
  const baseLlmMeta = () => ({
    model: AI_MODEL,
    latency_ms: Date.now() - startedAt,
    llm_attempts: 0,
    repair_triggered: false,
    final_validation_result: null
  });
  const fallback = (reason, validationResult = { ok: false, reason: "fallback" }, meta = {}) => ({
    telegramMessage: generateMessageWithTemplate(volatilityPayload),
    llm: {
      ...baseLlmMeta(),
      success: false,
      fallback: true,
      reason,
      validation_result: validationResult,
      llm_attempts: meta.llm_attempts ?? 0,
      repair_triggered: meta.repair_triggered ?? false,
      final_validation_result: meta.final_validation_result ?? validationResult
    }
  });
  const success = (telegramMessage, llm_attempts, repair_triggered, validationResult) => ({
    telegramMessage,
    llm: {
      ...baseLlmMeta(),
      success: true,
      fallback: false,
      validation_result: validationResult,
      llm_attempts,
      repair_triggered,
      final_validation_result: validationResult
    }
  });

  if (!openaiClient || !OPENAI_API_KEY) {
    return fallback("missing_openai_api_key");
  }

  if (volatilityPayload.phase === "during_event") {
    const firstLine = getDuringEventFirstLine(volatilityPayload);
    const systemMessage = { role: "system", content: DURING_EVENT_SECOND_LINE_PROMPT };
    const userPayloadMessage = { role: "user", content: buildLlmUserMessage(volatilityPayload) };
    const result = await createOneLlmCompletion([systemMessage, userPayloadMessage]);
    if (result.error) {
      return fallback(result.error, { ok: false, reason: result.error }, { llm_attempts: 1, repair_triggered: false });
    }
    const parsed = parseLlmSecondLine(result.responseText);
    if (!parsed) {
      return fallback("invalid_json_or_schema", { ok: false, reason: "invalid_second_line_schema" }, { llm_attempts: 1, repair_triggered: false });
    }
    const secondLineValidation = validateDuringEventSecondLine(parsed.second_line);
    if (!secondLineValidation.ok) {
      return fallback("validation_failed", secondLineValidation, {
        llm_attempts: 1,
        repair_triggered: false,
        final_validation_result: secondLineValidation
      });
    }
    const finalMessage = `${firstLine}\n${parsed.second_line}`;
    const finalValidation = validateTelegramText(finalMessage, volatilityPayload);
    if (!finalValidation.ok) {
      return fallback("validation_failed", finalValidation, {
        llm_attempts: 1,
        repair_triggered: false,
        final_validation_result: finalValidation
      });
    }
    return success(finalMessage, 1, false, finalValidation);
  }

  const systemMessage = { role: "system", content: LLM_SYSTEM_PROMPT };
  const userPayloadMessage = { role: "user", content: buildLlmUserMessage(volatilityPayload) };

  // Attempt 1
  const result1 = await createOneLlmCompletion([systemMessage, userPayloadMessage]);
  if (result1.error) {
    return fallback(result1.error);
  }
  const parsed1 = parseLlmTelegramText(result1.responseText);
  if (!parsed1) {
    return fallback("invalid_json_or_schema");
  }
  let validationResult = validateTelegramText(parsed1.telegram_text, volatilityPayload);
  if (validationResult.ok) {
    return success(parsed1.telegram_text, 1, false, validationResult);
  }

  // Attempt 2 (repair)
  const repairContent = `Текст нарушает правило: ${validationResult.reason}. Исправь сообщение, сохранив смысл, строго соблюдая все правила.`;
  const result2 = await createOneLlmCompletion([
    systemMessage,
    userPayloadMessage,
    { role: "user", content: repairContent }
  ]);
  if (result2.error) {
    return fallback(result2.error, validationResult, { llm_attempts: 2, repair_triggered: true, final_validation_result: validationResult });
  }
  const parsed2 = parseLlmTelegramText(result2.responseText);
  if (!parsed2) {
    return fallback("invalid_json_or_schema", validationResult, { llm_attempts: 2, repair_triggered: true, final_validation_result: validationResult });
  }
  validationResult = validateTelegramText(parsed2.telegram_text, volatilityPayload);
  if (validationResult.ok) {
    return success(parsed2.telegram_text, 2, true, validationResult);
  }
  return fallback("validation_failed_after_retry", validationResult, {
    llm_attempts: 2,
    repair_triggered: true,
    final_validation_result: validationResult
  });
};

const sendTelegramMessage = async (targetChatId, message) => {
  if (!OPENCLAW_GATEWAY_TOKEN || !targetChatId) {
    throw new Error("missing OPENCLAW_GATEWAY_TOKEN or target chat id");
  }

  const runtimeResponse = await fetch(OPENCLAW_RUNTIME_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENCLAW_GATEWAY_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      tool: "message",
      action: "send",
      sessionKey: "main",
      args: {
        channel: "telegram",
        target: targetChatId,
        message
      }
    })
  });

  const runtimeBody = await runtimeResponse.json().catch(() => ({}));
  if (!runtimeResponse.ok || runtimeBody.ok !== true) {
    const details = {
      status: runtimeResponse.status,
      body: runtimeBody
    };
    const error = new Error("openclaw send failed");
    error.details = details;
    throw error;
  }

  return runtimeBody;
};

const buildHeartbeatMessage = () => {
  const nowUtc = new Date();
  const formattedTime = nowUtc.toISOString().slice(11, 16);
  const aiModeLabel = AI_ENABLED ? `ON (${AI_MODEL})` : "OFF (template mode)";
  const latencyLabel = Number.isFinite(metrics.last_latency)
    ? `${(metrics.last_latency / 1000).toFixed(1)}s`
    : "n/a";
  const volatilityLabel =
    metrics.current_volatility_state === "RED"
      ? "🔴 RED (High Impact Active)"
      : metrics.current_volatility_state === "GREEN"
        ? "🟢 GREEN (No Active Events)"
        : "Not initialized yet";

  const lines = [
    "🫀 System Heartbeat",
    "",
    `🧠 AI Mode: ${aiModeLabel}`,
    `⚡ LLM Calls: ${metrics.llm_success_count} success / ${metrics.llm_fallback_count} fallback (last hour)`,
    `⏱ Last Latency: ${latencyLabel}`,
    `📊 Volatility State: ${volatilityLabel}`,
    `🕒 Time: ${formattedTime} UTC`
  ];

  if (metrics.llm_fallback_count > 0) {
    lines.push("⚠️ Fallbacks detected");
  }

  return lines.join("\n");
};

const sendHeartbeat = async (source = "interval") => {
  if (!ADMIN_CHAT_ID) {
    console.warn("[bridge:heartbeat:skip] missing ADMIN_CHAT_ID");
    return { ok: false, reason: "missing_admin_chat_id" };
  }

  const runtimeBody = await sendTelegramMessage(ADMIN_CHAT_ID, buildHeartbeatMessage());
  metrics.llm_fallback_count = 0;
  console.log("[bridge:heartbeat:sent]", JSON.stringify({
    source,
    target: ADMIN_CHAT_ID,
    timestamp: new Date().toISOString()
  }));
  return runtimeBody;
};

setInterval(async () => {
  try {
    await sendHeartbeat("interval");
  } catch (error) {
    console.error("[bridge:heartbeat:error]", error && error.details ? JSON.stringify(error.details, null, 2) : error);
  }
}, HEARTBEAT_INTERVAL_MS);

const BRIDGE_CRON_INTERVAL_MS = Number.parseInt(process.env.BRIDGE_CRON_INTERVAL_MS || "0", 10);
const bridgeCronEnabled = Number.isFinite(BRIDGE_CRON_INTERVAL_MS) && BRIDGE_CRON_INTERVAL_MS > 0;

if (bridgeCronEnabled) {
  const runBridgeCronTick = async () => {
    try {
      const baseUrl = "http://127.0.0.1:3000";
      const feedRes = await fetch(`${baseUrl}/calendar-feed`);
      if (!feedRes.ok) return;
      const feed = await feedRes.json();
      const items = Array.isArray(feed.items) ? feed.items : [];
      const nowMs = getEffectiveNowMs();
      const result = computeFromRawEvents(nowMs, items);
      const changed =
        notificationState.previous_state !== result.state ||
        notificationState.previous_phase !== result.phase;
      if (!changed) return;
      const context = result.state === "RED" && result.primary_event
        ? (() => {
            const eventMs = Date.parse(result.primary_event.time);
            const minutesToEvent = Number.isFinite(eventMs)
              ? (eventMs > nowMs ? Math.max(0, Math.ceil((eventMs - nowMs) / 60000)) : 0)
              : 0;
            return {
              event_name: result.primary_event.name,
              event_title: result.primary_event.name,
              event_time: result.primary_event.time,
              minutes_to_event: minutesToEvent,
              impact: "High",
              phase: result.phase,
              impact_type: result.impact_type,
              anchor_label: result.anchor_label,
              contextual_anchor: result.contextual_anchor,
              contextual_anchor_names: result.contextual_anchor_names,
              cluster_has_anchor: result.cluster_has_anchor,
              cluster_anchor_names: result.cluster_anchor_names,
              primary_event: result.primary_event
            };
          })()
        : null;
      const body = {
        event_type: "volatility.state_changed",
        state: result.state,
        phase: result.phase,
        timestamp: new Date(nowMs).toISOString(),
        context
      };
      const hookRes = await fetch(`${baseUrl}/hooks/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!hookRes.ok) {
        console.warn("[bridge:cron:hook_failed]", { status: hookRes.status });
      }
    } catch (err) {
      console.warn("[bridge:cron:error]", err && err.message ? err.message : err);
    }
  };
  setInterval(runBridgeCronTick, BRIDGE_CRON_INTERVAL_MS);
  setTimeout(runBridgeCronTick, 2000);
  console.log("[bridge:cron:started]", { interval_ms: BRIDGE_CRON_INTERVAL_MS });
}

app.post("/hooks/event", async (req, res) => {
  const incomingEventType = req.body && req.body.event_type;
  const incomingState = req.body && req.body.state;
  const cronTickTimestamp = req.body && req.body.timestamp;
  const incomingContext = req.body && req.body.context;
  const incomingSimulationStartRealTime = req.body && req.body.simulation_start_real_time;
  const incomingSimulationStartRealTimeIso = req.body && req.body.simulation_start_real_time_iso;
  const incomingStartTime = req.body && req.body.start_time;
  const incomingRealElapsedMinutes = req.body && req.body.real_elapsed_minutes;
  const incomingEffectiveNow = req.body && req.body.effective_now;
  const isVolatilityStateChanged =
    incomingEventType === "volatility.state_changed" &&
    (incomingState === "RED" || incomingState === "GREEN");
  const isVolatilityTick =
    incomingEventType === "volatility.tick" &&
    (incomingState === "RED" || incomingState === "GREEN");
  let telegramMessage = OPENCLAW_B2_TEST_MESSAGE;
  let llmLog = null;
  let volatilityPayload = null;
  let llmCalled = false;
  let skippedDuplicateStatePhase = false;
  let transitionType = "none";
  let previousState = notificationState.previous_state;
  let previousPhase = notificationState.previous_phase;
  let currentState = null;
  let currentPhase = null;
  const effectiveNowMs = getEffectiveNowMs();
  const effectiveNowIso = new Date(effectiveNowMs).toISOString();

  if (isVolatilityStateChanged || isVolatilityTick) {
    metrics.current_volatility_state = incomingState;
    volatilityPayload = buildVolatilityPayload(incomingState, incomingContext, effectiveNowMs);
    currentState = volatilityPayload.state;
    currentPhase = volatilityPayload.phase;

    const stateChanged = previousState !== currentState;
    const phaseChanged = previousPhase !== currentPhase;
    transitionType = stateChanged
      ? "state_change"
      : (phaseChanged ? "phase_change" : "none");
    const isDuplicateStatePhase = !stateChanged && !phaseChanged;

    if (isDuplicateStatePhase && isVolatilityStateChanged) {
      skippedDuplicateStatePhase = true;
    } else if (AI_ENABLED && isVolatilityStateChanged) {
      llmCalled = true;
      const llmResult = await generateMessageWithLlm(volatilityPayload);
      telegramMessage = llmResult.telegramMessage;
      llmLog = llmResult.llm;
      if (llmLog && Number.isFinite(llmLog.latency_ms)) {
        metrics.last_latency = llmLog.latency_ms;
      }
      if (llmLog && llmLog.success === true) {
        metrics.llm_success_count += 1;
      }
      if (llmLog && llmLog.fallback === true) {
        metrics.llm_fallback_count += 1;
      }
      notificationState.previous_state = currentState;
      notificationState.previous_phase = currentPhase;
    } else {
      if (isVolatilityTick) {
        telegramMessage = [
          `🧪 MVP Tick: ${volatilityPayload.state}/${volatilityPayload.phase}`,
          `Event: ${volatilityPayload.event_name}`,
          `Time: ${volatilityPayload.event_time}`,
          `In: ${volatilityPayload.minutes_to_event}m`
        ].join("\n");
      } else {
        telegramMessage = generateMessageWithTemplate(volatilityPayload);
      }
      notificationState.previous_state = currentState;
      notificationState.previous_phase = currentPhase;
    }
  }

  const logPayload = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    body: req.body,
    ai_enabled: AI_ENABLED,
    simulation_mode: SIMULATION_MODE,
    simulation_now_value: SIMULATION_MODE ? SIMULATION_NOW : null,
    simulation_day_mode: req.body && req.body.simulation_day_mode,
    simulation_speed: req.body && req.body.simulation_speed,
    simulation_start_real_time: incomingSimulationStartRealTime || null,
    simulation_start_real_time_iso: incomingSimulationStartRealTimeIso || null,
    start_time: incomingStartTime || null,
    simulated_now: req.body && req.body.simulated_now,
    real_now: req.body && req.body.real_now,
    real_elapsed_minutes: Number.isFinite(incomingRealElapsedMinutes) ? incomingRealElapsedMinutes : incomingRealElapsedMinutes || null,
    effective_now_from_n8n: incomingEffectiveNow || null,
    effective_now: effectiveNowIso,
    effective_now_source: SIMULATION_MODE ? "bridge.SIMULATION_NOW" : "bridge.Date.now",
    simulation_now_from_n8n_ignored: Boolean(req.body && req.body.simulation_day_mode) && !SIMULATION_MODE,
    cron_tick_timestamp: cronTickTimestamp || null,
    previous_state: previousState,
    previous_phase: previousPhase,
    current_state: currentState,
    current_phase: currentPhase,
    transition_type: transitionType,
    state: volatilityPayload && volatilityPayload.state,
    impact_type: volatilityPayload && volatilityPayload.impact_type,
    anchor_label: volatilityPayload && volatilityPayload.anchor_label,
    primary_event: volatilityPayload && volatilityPayload.primary_event,
    contextual_anchor: volatilityPayload && volatilityPayload.contextual_anchor,
    contextual_anchor_names: volatilityPayload && volatilityPayload.contextual_anchor_names,
    cluster_has_anchor: volatilityPayload && volatilityPayload.cluster_has_anchor,
    cluster_anchor_names: volatilityPayload && volatilityPayload.cluster_anchor_names,
    active_event_name: volatilityPayload && volatilityPayload.event_name,
    active_event_time: volatilityPayload && volatilityPayload.event_time,
    event_name: volatilityPayload && volatilityPayload.event_name,
    phase: volatilityPayload && volatilityPayload.phase,
    llm_called: llmCalled,
    duplicate_state_phase_skipped: skippedDuplicateStatePhase,
    validation_result: llmLog && llmLog.validation_result ? llmLog.validation_result : null,
    llm: llmLog,
    llm_attempts: llmLog && typeof llmLog.llm_attempts === "number" ? llmLog.llm_attempts : null,
    repair_triggered: llmLog && llmLog.repair_triggered === true,
    final_validation_result: llmLog && llmLog.final_validation_result ? llmLog.final_validation_result : null,
    telegramMessage
  };

  console.log("[bridge:event]", JSON.stringify(logPayload, null, 2));

  if (!OPENCLAW_GATEWAY_TOKEN || !OPENCLAW_TELEGRAM_CHAT_ID) {
    return res.status(500).json({
      status: "error",
      error: "bridge missing OPENCLAW_GATEWAY_TOKEN or OPENCLAW_TELEGRAM_CHAT_ID"
    });
  }

  try {
    if (skippedDuplicateStatePhase) {
      return res.json({
        status: "ok",
        bridge: "received",
        skipped: "duplicate_state_phase"
      });
    }

    const runtimeBody = await sendTelegramMessage(OPENCLAW_TELEGRAM_CHAT_ID, telegramMessage);

    return res.json({
      status: "ok",
      bridge: "received",
      openclaw: runtimeBody.result && runtimeBody.result.details ? runtimeBody.result.details : runtimeBody
    });
  } catch (error) {
    console.error("[bridge:openclaw:exception]", error && error.details ? JSON.stringify(error.details, null, 2) : error);
    return res.status(502).json({
      status: "error",
      bridge: "received",
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Bridge service listening on port ${PORT}`);
});
