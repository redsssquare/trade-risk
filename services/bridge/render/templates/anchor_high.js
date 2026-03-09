const { pluralRu } = require("../../../../utils/pluralRu");

const getSafeMinutes = (payload) => {
  const raw = payload && Number.isFinite(payload.minutes_to_event)
    ? payload.minutes_to_event
    : 0;
  return Math.max(0, Math.ceil(raw));
};

const getEventName = (payload) => {
  const eventName = String(payload && payload.event_name ? payload.event_name : "").trim();
  return eventName || "ключевого события";
};

const renderAnchorHighDuringEvent = (payload) =>
  `Публикуется ${getEventName(payload)}.`;

const renderAnchorHighPreEvent = (payload) => {
  const minutes = getSafeMinutes(payload);
  const eventName = getEventName(payload);
  const clusterSize = Number.isFinite(payload && payload.cluster_size)
    ? payload.cluster_size
    : 0;

  const minWord = pluralRu(minutes, "минуту", "минуты", "минут");
  if (clusterSize > 1) {
    return `⚡ Через ${minutes} ${minWord} серия публикаций, включая ${eventName}.`;
  }
  return `⚡ Через ${minutes} ${minWord} выходит ${eventName}.`;
};

const renderAnchorHighTemplate = (payload) => {
  const phase = String(payload && payload.phase ? payload.phase : "none").trim();

  if (phase === "during_event") {
    return [
      renderAnchorHighDuringEvent(payload),
      "Идёт реакция рынка."
    ].join("\n");
  }
  if (phase === "pre_event") {
    return renderAnchorHighPreEvent(payload);
  }
  return `⚡ Окно волатильности активно.`;
};

module.exports = {
  renderAnchorHighTemplate,
  renderAnchorHighDuringEvent
};
