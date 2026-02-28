const {
  PRE_EVENT,
  DURING_EVENT,
  POST_EVENT,
  GREEN,
  pickFromPool,
  applyPlaceholders,
  resolveCategory,
} = require("./phrases");

const PHASE_KEYS = { PRE_EVENT: "pre", DURING_EVENT: "dur", POST_EVENT: "post" };

const renderPhrase = (phasePool, phaseKey, category, payload, phraseOpts) => {
  const pool = phasePool[category];
  if (!pool || pool.length === 0) return null;
  const phrase = pickFromPool(`${phaseKey}_${category}`, pool);
  return phrase ? applyPlaceholders(phrase, payload, phraseOpts) : null;
};

const renderTelegramTextTemplate = (payload, opts) => {
  if (!payload || payload.state === "GREEN") {
    const previousClusterSize = (opts && opts.previousClusterSize) || 0;
    const greenPool = previousClusterSize > 1 ? GREEN.cluster : GREEN.single;
    const poolKey = previousClusterSize > 1 ? "green_cluster" : "green_single";
    const phrase = pickFromPool(poolKey, greenPool);
    if (phrase) {
      return [phrase.first, phrase.second].join("\n");
    }
    return "🟢 Окно волатильности закрыто.\n\nСейчас нет активных high-impact событий.";
  }

  const phase = String(payload.phase || "none").trim();
  const category = resolveCategory(payload);

  if (phase === "pre_event") {
    return renderPhrase(PRE_EVENT, "pre", category, payload, { appendCurrencies: true })
      || `⏳ Через ${payload.minutes_to_event || 0} минут публикация важных экономических данных.`;
  }
  if (phase === "during_event") {
    return renderPhrase(DURING_EVENT, "dur", category, payload)
      || "Выходят данные.\nДвижения ускоряются.";
  }
  if (phase === "post_event") {
    return renderPhrase(POST_EVENT, "post", category, payload)
      || "Первичная реакция завершена.\nДвижения постепенно снижаются.";
  }

  return renderPhrase(PRE_EVENT, "pre", category, payload)
    || "Активно окно волатильности.";
};

const getDuringEventFirstLine = (payload) => {
  const category = resolveCategory(payload);
  const pool = DURING_EVENT[category];
  if (pool && pool.length > 0) {
    const phrase = pickFromPool(`during_first_${category}`, pool);
    if (phrase) {
      return applyPlaceholders({ first: phrase.first, second: "" }, payload).trim();
    }
  }
  return "Выходят данные.";
};

module.exports = {
  renderTelegramTextTemplate,
  getDuringEventFirstLine,
};
