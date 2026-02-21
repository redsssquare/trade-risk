const express = require("express");

const app = express();
const PORT = 3000;
const OPENCLAW_RUNTIME_URL = process.env.OPENCLAW_RUNTIME_URL || "http://openclaw:18789/tools/invoke";
const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || "";
const OPENCLAW_TELEGRAM_CHAT_ID = process.env.OPENCLAW_TELEGRAM_CHAT_ID || "";
const OPENCLAW_B2_TEST_MESSAGE = process.env.OPENCLAW_B2_TEST_MESSAGE || "[B2 TEST] POST -> bridge -> openclaw -> Telegram";

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/hooks/event", (req, res) => {
  const incomingEventType = req.body && req.body.event_type;
  const incomingState = req.body && req.body.state;
  const isVolatilityStateChanged =
    incomingEventType === "volatility.state_changed" &&
    (incomingState === "RED" || incomingState === "GREEN");
  const telegramMessage = isVolatilityStateChanged ? incomingState : OPENCLAW_B2_TEST_MESSAGE;

  const logPayload = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    body: req.body,
    telegramMessage
  };

  console.log("[bridge:event]", JSON.stringify(logPayload, null, 2));

  if (!OPENCLAW_GATEWAY_TOKEN || !OPENCLAW_TELEGRAM_CHAT_ID) {
    return res.status(500).json({
      status: "error",
      error: "bridge missing OPENCLAW_GATEWAY_TOKEN or OPENCLAW_TELEGRAM_CHAT_ID"
    });
  }

  fetch(OPENCLAW_RUNTIME_URL, {
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
        target: OPENCLAW_TELEGRAM_CHAT_ID,
        message: telegramMessage
      }
    })
  })
    .then(async (runtimeResponse) => {
      const runtimeBody = await runtimeResponse.json().catch(() => ({}));
      if (!runtimeResponse.ok || runtimeBody.ok !== true) {
        console.error("[bridge:openclaw:error]", JSON.stringify({
          status: runtimeResponse.status,
          body: runtimeBody
        }, null, 2));
        return res.status(502).json({
          status: "error",
          bridge: "received",
          openclaw: runtimeBody
        });
      }

      return res.json({
        status: "ok",
        bridge: "received",
        openclaw: runtimeBody.result && runtimeBody.result.details ? runtimeBody.result.details : runtimeBody
      });
    })
    .catch((error) => {
      console.error("[bridge:openclaw:exception]", error);
      return res.status(502).json({
        status: "error",
        bridge: "received",
        error: error.message
      });
    });
});

app.listen(PORT, () => {
  console.log(`Bridge service listening on port ${PORT}`);
});
