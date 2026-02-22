const getSafeMinutes = (payload) => {
  const raw = payload && Number.isFinite(payload.minutes_to_event)
    ? payload.minutes_to_event
    : 0;
  return Math.max(0, Math.ceil(raw));
};

const pickAnchorName = (payload) => {
  if (!payload || !Array.isArray(payload.cluster_anchor_names)) {
    return null;
  }
  const normalized = payload.cluster_anchor_names
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return normalized[0] || null;
};

const renderHighDuringEvent = () => [
  "Опубликованы экономические данные.",
  "Рынок реагирует нейтрально, выраженного импульса не наблюдается."
].join("\n");

const renderHighPreEvent = (payload) => {
  const minutes = getSafeMinutes(payload);
  const clusterSize = Number.isFinite(payload && payload.cluster_size)
    ? payload.cluster_size
    : 0;
  const hasSeries = clusterSize > 1;
  const hasAnchorInSeries = payload && payload.cluster_has_anchor === true;
  const anchorName = pickAnchorName(payload);

  if (hasSeries && hasAnchorInSeries && anchorName) {
    return `🔴 Через ${minutes} минут выходит серия важных публикаций, включая ${anchorName}.`;
  }
  if (hasSeries) {
    return `🔴 Через ${minutes} минут выходит сразу несколько важных данных.`;
  }
  return `🔴 Через ${minutes} минут публикация важных экономических данных.`;
};

const renderHighPostEvent = () => [
  "🔴 Публикации уже вышли.",
  "Рынок переваривает данные без выраженного импульса."
].join(" ");

const renderHighTemplate = (payload) => {
  const phase = String(payload && payload.phase ? payload.phase : "none").trim();

  if (phase === "during_event") {
    return renderHighDuringEvent();
  }
  if (phase === "pre_event") {
    return renderHighPreEvent(payload);
  }
  if (phase === "post_event") {
    return renderHighPostEvent();
  }
  return "🔴 Активно окно волатильности.";
};

module.exports = {
  renderHighTemplate,
  renderHighDuringEvent
};
