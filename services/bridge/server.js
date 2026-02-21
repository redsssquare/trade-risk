const express = require("express");
const OpenAI = require("openai");

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
const metrics = {
  llm_success_count: 0,
  llm_fallback_count: 0,
  last_latency: null,
  current_volatility_state: "UNKNOWN"
};

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const generateMessageWithTemplate = (state, context) => {
  if (state === "GREEN") {
    return "🟢 Volatility Window Closed\n\nNo high-impact events active.";
  }

  const safeContext = context && typeof context === "object" ? context : {};
  const eventTitle = safeContext.event_title || "N/A";
  const currency = safeContext.currency || "N/A";
  const eventTime = safeContext.event_time || "N/A";
  const minutesToEvent = Number.isFinite(safeContext.minutes_to_event) ? safeContext.minutes_to_event : 0;

  return [
    "🔴 High Impact Event Incoming",
    "",
    `${eventTitle}`,
    `Currency: ${currency}`,
    `Time: ${eventTime} UTC`,
    `In: ${minutesToEvent} minutes`
  ].join("\n");
};

const buildLlmUserMessage = (state, context) => {
  if (state === "RED") {
    const safeContext = context && typeof context === "object" ? context : {};
    return [
      "State: RED",
      `Event: ${safeContext.event_title || "N/A"}`,
      `Currency: ${safeContext.currency || "N/A"}`,
      `Event Time (UTC): ${safeContext.event_time || "N/A"}`,
      `Minutes to event: ${Number.isFinite(safeContext.minutes_to_event) ? safeContext.minutes_to_event : 0}`,
      `Impact: ${safeContext.impact || "High"}`,
      "Desired tone: alert"
    ].join("\n");
  }

  return [
    "State: GREEN",
    "No active high-impact events.",
    "Desired tone: calm"
  ].join("\n");
};

const generateMessageWithLlm = async (context, state) => {
  const startedAt = Date.now();
  const fallback = (reason) => ({
    telegramMessage: generateMessageWithTemplate(state, context),
    llm: {
      model: AI_MODEL,
      latency_ms: Date.now() - startedAt,
      success: false,
      fallback: true,
      reason
    }
  });

  if (!openaiClient || !OPENAI_API_KEY) {
    return fallback("missing_openai_api_key");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESOLVED_AI_TIMEOUT_MS);

  try {
    const completion = await openaiClient.chat.completions.create({
      model: AI_MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You generate Telegram notifications about market volatility.",
            "Return valid JSON only.",
            "Do not include explanations.",
            "Do not include markdown.",
            "Do not include text outside JSON.",
            "Required JSON structure:",
            "{",
            "  \"telegram_text\": \"string\",",
            "  \"tone\": \"alert | calm | neutral\"",
            "}"
          ].join("\n")
        },
        {
          role: "user",
          content: buildLlmUserMessage(state, context)
        }
      ]
    }, { signal: controller.signal });

    const responseText = completion &&
      completion.choices &&
      completion.choices[0] &&
      completion.choices[0].message &&
      completion.choices[0].message.content;

    if (typeof responseText !== "string" || !responseText.trim()) {
      return fallback("empty_ai_response");
    }

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (_error) {
      return fallback("invalid_json");
    }

    if (!parsed.telegram_text || typeof parsed.telegram_text !== "string") {
      return fallback("invalid_schema");
    }

    return {
      telegramMessage: parsed.telegram_text.trim(),
      llm: {
        model: AI_MODEL,
        latency_ms: Date.now() - startedAt,
        success: true,
        fallback: false
      }
    };
  } catch (error) {
    const reason = error && error.name === "AbortError"
      ? `timeout_${RESOLVED_AI_TIMEOUT_MS}ms`
      : "openai_request_failed";
    return fallback(reason);
  } finally {
    clearTimeout(timer);
  }
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

app.post("/hooks/event", async (req, res) => {
  const incomingEventType = req.body && req.body.event_type;
  const incomingState = req.body && req.body.state;
  const incomingContext = req.body && req.body.context;
  const isVolatilityStateChanged =
    incomingEventType === "volatility.state_changed" &&
    (incomingState === "RED" || incomingState === "GREEN");
  let telegramMessage = OPENCLAW_B2_TEST_MESSAGE;
  let llmLog = null;

  if (isVolatilityStateChanged) {
    metrics.current_volatility_state = incomingState;
    if (AI_ENABLED) {
      const llmResult = await generateMessageWithLlm(incomingContext, incomingState);
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
    } else {
      telegramMessage = generateMessageWithTemplate(incomingState, incomingContext);
    }
  }

  const logPayload = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    body: req.body,
    ai_enabled: AI_ENABLED,
    llm: llmLog,
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
