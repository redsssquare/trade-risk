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
  `Опубликованы данные ${getEventName(payload)}.`;

const renderAnchorHighPreEvent = (payload) => {
  const minutes = getSafeMinutes(payload);
  const eventName = getEventName(payload);
  const clusterSize = Number.isFinite(payload && payload.cluster_size)
    ? payload.cluster_size
    : 0;

  if (clusterSize > 1) {
    return `🔴 Через ${minutes} минут выходит серия важных публикаций, включая ${eventName}.`;
  }
  return `🔴 Через ${minutes} минут выходит публикация ${eventName}.`;
};

const renderAnchorHighPostEvent = (payload) =>
  `🔴 Публикация ${getEventName(payload)} уже состоялась. Рынок переваривает данные.`;

const renderAnchorHighTemplate = (payload) => {
  const phase = String(payload && payload.phase ? payload.phase : "none").trim();

  if (phase === "during_event") {
    return [
      renderAnchorHighDuringEvent(payload),
      "Рынок реагирует нейтрально, выраженного импульса не наблюдается."
    ].join("\n");
  }
  if (phase === "pre_event") {
    return renderAnchorHighPreEvent(payload);
  }
  if (phase === "post_event") {
    return renderAnchorHighPostEvent(payload);
  }
  return `🔴 Активно окно волатильности: ${getEventName(payload)}.`;
};

module.exports = {
  renderAnchorHighTemplate,
  renderAnchorHighDuringEvent
};
