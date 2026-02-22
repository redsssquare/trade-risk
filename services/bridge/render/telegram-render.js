const { renderHighTemplate, renderHighDuringEvent } = require("./templates/high");
const { renderAnchorHighTemplate, renderAnchorHighDuringEvent } = require("./templates/anchor_high");

const normalizeImpactType = (value) => {
  const normalized = String(value || "").toLowerCase().trim();
  return normalized === "anchor_high" ? "anchor_high" : "high";
};

const getDuringEventFirstLine = (payload) =>
  normalizeImpactType(payload && payload.impact_type) === "anchor_high"
    ? renderAnchorHighDuringEvent(payload)
    : renderHighDuringEvent(payload);

const renderTelegramTextTemplate = (payload) => {
  if (!payload || payload.state === "GREEN") {
    return "🟢 Окно волатильности закрыто.\n\nСейчас нет активных high-impact событий.";
  }

  const impactType = normalizeImpactType(payload.impact_type);
  return impactType === "anchor_high"
    ? renderAnchorHighTemplate(payload)
    : renderHighTemplate(payload);
};

module.exports = {
  renderTelegramTextTemplate,
  getDuringEventFirstLine
};
