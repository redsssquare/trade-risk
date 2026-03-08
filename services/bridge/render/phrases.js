const PRE_EVENT = {
  high: [
    { first: "⏳ Через {min} минут выходят важные данные.", second: "Рынок входит в фазу ожидания." },
    { first: "⏳ Через {min} минут публикация значимой статистики.", second: "Возможно оживление на рынке." },
    { first: "⏳ Через {min} минут выход ключевых показателей.", second: "Движения могут стать активнее." },
    { first: "⏳ Через {min} минут ожидаются важные цифры.", second: "Активность может вырасти." },
    { first: "⏳ Через {min} минут выходят данные.", second: "Рынок готовится к движению." },
  ],
  anchor: [
    { first: "⚡ Через {min} минут — {event}.", second: "Рынок готовится к движению." },
    { first: "⚡ Через {min} минут ожидается {event}.", second: "Движения могут стать заметнее." },
    { first: "⚡ Через {min} минут выходит {event}.", second: "Рынок входит в фазу ожидания." },
    { first: "⚡ Через {min} минут — {event}.", second: "Возможно оживление на рынке." },
    { first: "⚡ Через {min} минут — {event}.", second: "Диапазон движений может расшириться." },
  ],
  stack: [
    { first: "⏳ Через {min} минут выходит несколько данных подряд.", second: "Активность может сохраняться дольше обычного." },
    { first: "⏳ Через {min} минут публикации пойдут одна за другой.", second: "Рынок может оставаться подвижным в этот период." },
    { first: "⏳ Через {min} минут серия экономических публикаций.", second: "Движение может быть неравномерным." },
    { first: "⏳ Через {min} минут несколько релизов подряд.", second: "Рынок входит в активный период." },
    { first: "⏳ Через {min} минут блок данных без пауз.", second: "Цена может реагировать на каждый." },
  ],
  anchorStack: [
    { first: "⚡ Через {min} минут серия публикаций, включая {event}.", second: "Рынок входит в активный период." },
    { first: "⚡ Через {min} минут блок данных, среди них {event}.", second: "Движения могут идти волнами." },
    { first: "⚡ Через {min} минут несколько релизов подряд, включая {event}.", second: "Рынок начинает реагировать." },
    { first: "⚡ Через {min} минут данные идут один за другим, включая {event}.", second: "Активность может нарастать постепенно." },
    { first: "⚡ Через {min} минут серия публикаций, в том числе {event}.", second: "Возможны последовательные движения." },
  ],
};

const DURING_EVENT = {
  high: [
    { first: "🔴 {event_with_currency}.", second: "Публикация началась. В рынке идёт движение." },
    { first: "🔴 {event_with_currency}.", second: "Рынок начинает реагировать." },
    { first: "🔴 {event_with_currency}.", second: "В рынке идёт движение." },
    { first: "🔴 {event_with_currency}.", second: "Рынок переваривает цифры." },
    { first: "🔴 {event_with_currency}.", second: "Цена отвечает на данные." },
    { first: "🔴 {event_with_currency}.", second: "Рынок в фазе реакции." },
  ],
  anchor: [
    { first: "🔴 {event_with_currency}.", second: "Публикация началась. В рынке идёт движение." },
    { first: "🔴 {event_with_currency}.", second: "Рынок начинает реагировать." },
    { first: "🔴 {event_with_currency}.", second: "В рынке идёт движение." },
    { first: "🔴 {event_with_currency}.", second: "Рынок переваривает цифры." },
    { first: "🔴 {event_with_currency}.", second: "Цена отвечает на данные." },
  ],
  stack: [
    { first: "🔴 Идёт {cluster_series}.", second: "В рынке сохраняется движение." },
    { first: "🔴 Идёт {cluster_series}.", second: "Рынок реагирует на каждую из них." },
    { first: "🔴 Идёт {cluster_series}.", second: "Идёт последовательная реакция." },
    { first: "🔴 Идёт {cluster_series}.", second: "Рынок отвечает на релизы." },
    { first: "🔴 Идёт {cluster_series}.", second: "Движения могут идти волнами." },
  ],
  anchorStack: [
    { first: "🔴 Идёт {cluster_series}, включая {event}.", second: "В рынке сохраняется движение." },
    { first: "🔴 Идёт {cluster_series}, включая {event}.", second: "Рынок реагирует на блок данных." },
    { first: "🔴 Идёт {cluster_series}, включая {event}.", second: "Идёт последовательная реакция." },
    { first: "🔴 Идёт {cluster_series}, включая {event}.", second: "Рынок отвечает на серию событий." },
  ],
};

const POST_EVENT = {
  high: [
    { first: "Основной импульс постепенно утихает.", second: "Движения становятся спокойнее." },
    { first: "Активная фаза после публикации прошла.", second: "Рынок выравнивается." },
    { first: "Первичная реакция завершена.", second: "Колебания сокращаются." },
    { first: "Реакция на данные постепенно затихает.", second: "Рынок переходит в более ровную фазу." },
    { first: "Основное движение после данных отработано.", second: "Амплитуда идёт на убыль." },
    { first: "Пик активности позади.", second: "Рынок успокаивается." },
  ],
  anchor: [
    { first: "⚡ Реакция на {event} постепенно утихает.", second: "Движения становятся ровнее." },
    { first: "⚡ Основной импульс по {event} прошёл.", second: "Рынок выравнивается." },
    { first: "⚡ Реакция на {event} снижается.", second: "Колебания идут на убыль." },
    { first: "⚡ {event} — пик активности позади.", second: "Движения становятся спокойнее." },
    { first: "⚡ Основная реакция на {event} завершена.", second: "Рынок переходит в более ровную фазу." },
  ],
  stack: [
    { first: "Основной импульс после серии данных постепенно утихает.", second: "Рынок выравнивается." },
    { first: "Реакция на блок публикаций снижается.", second: "Движения становятся спокойнее." },
    { first: "Пик активности после серии релизов позади.", second: "Колебания идут на убыль." },
    { first: "Активная фаза после блока данных прошла.", second: "Рынок успокаивается." },
    { first: "Серия публикаций отработана.", second: "Амплитуда сокращается." },
  ],
  anchorStack: [
    { first: "⚡ Основной импульс по серии данных, включая {event}, постепенно утихает.", second: "Рынок выравнивается." },
    { first: "⚡ Реакция на блок публикаций, включая {event}, снижается.", second: "Движения становятся ровнее." },
    { first: "⚡ Серия релизов, включая {event}, отработана.", second: "Колебания идут на убыль." },
    { first: "⚡ Блок данных, включая {event}, — пик активности позади.", second: "Рынок успокаивается." },
    { first: "⚡ Основная реакция на публикации, включая {event}, завершена.", second: "Рынок переходит в более ровную фазу." },
  ],
};

const GREEN = {
  single: [
    { first: "🟢 Окно волатильности закрыто.", second: "Рынок вернулся к обычному ритму." },
    { first: "🟢 Фаза активности завершена.", second: "Движения пришли в норму." },
    { first: "🟢 Окно волатильности закрыто.", second: "Рынок в стандартной фазе." },
    { first: "🟢 Окно волатильности закрыто.", second: "Рынок успокоился." },
    { first: "🟢 Публикация отработана.", second: "Движения нормализованы." },
    { first: "🟢 Фаза активности завершена.", second: "Рынок в обычном ритме." },
  ],
  cluster: [
    { first: "🟢 Окно волатильности закрыто.", second: "Рынок вернулся к обычному ритму." },
    { first: "🟢 Блок данных отработан.", second: "Движения пришли в норму." },
    { first: "🟢 Фаза активности завершена.", second: "Рынок успокоился." },
    { first: "🟢 Окно волатильности закрыто.", second: "Рынок в стандартной фазе." },
    { first: "🟢 Блок данных отработан.", second: "Движения нормализованы." },
  ],
};

const shuffleQueues = {};

const pickFromPool = (poolKey, pool) => {
  if (!pool || pool.length === 0) return null;
  if (pool.length === 1) return pool[0];

  let queue = shuffleQueues[poolKey];
  if (!queue || queue.length === 0) {
    queue = Array.from({ length: pool.length }, (_, i) => i);
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    shuffleQueues[poolKey] = queue;
  }

  const idx = queue.shift();
  return pool[idx];
};

const getSafeMinutes = (payload) => {
  const raw = payload && Number.isFinite(payload.minutes_to_event)
    ? payload.minutes_to_event
    : 0;
  return Math.max(0, Math.ceil(raw));
};

const RU_EVENT_NAMES = {
  "NFP": "NFP",
  "FOMC Rate Decision": "решение ФРС",
  "US CPI": "CPI США",
  "ECB Rate Decision": "решение ЕЦБ",
  "BOE Rate Decision": "решение Банка Англии",
  "BOJ Rate Decision": "решение Банка Японии",
  "Powell Speech": "выступление Пауэлла",
};

const translateEventName = (name) => {
  if (!name) return "";
  if (RU_EVENT_NAMES[name]) return RU_EVENT_NAMES[name];
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(RU_EVENT_NAMES)) {
    if (key.toLowerCase() === lower) return value;
  }
  return name;
};

const getEventName = (payload) => {
  if (!payload) return "";
  const anchorLabel = String(payload.anchor_label || "").trim();
  if (anchorLabel) return translateEventName(anchorLabel);
  const name = String(payload.event_name || "").trim();
  if (payload.cluster_has_anchor && Array.isArray(payload.cluster_anchor_names)) {
    const first = payload.cluster_anchor_names
      .map((n) => translateEventName(String(n || "").trim()))
      .filter(Boolean)[0];
    if (first) return first;
  }
  return name && name !== "N/A" ? translateEventName(name) : "";
};

const getEventTimeFormatted = (payload) => {
  if (!payload || !payload.event_time) return "";
  const ms = Date.parse(payload.event_time);
  if (!Number.isFinite(ms)) return "";
  const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
  const msk = new Date(ms + MSK_OFFSET_MS);
  const hh = String(msk.getUTCHours()).padStart(2, "0");
  const mm = String(msk.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

const capitalizeAfterEmoji = (line) =>
  line.replace(/^([\p{Emoji}\uFE0F\u200D]+\s*)(\p{Ll})/u, (_, prefix, char) => prefix + char.toUpperCase());

const CURRENCY_TO_COUNTRY = {
  USD: "US", EUR: "EU", GBP: "GB", JPY: "JP", AUD: "AU",
  CAD: "CA", CHF: "CH", NZD: "NZ", CNY: "CN", SEK: "SE",
  NOK: "NO", SGD: "SG", HKD: "HK", MXN: "MX", ZAR: "ZA",
  TRY: "TR", INR: "IN", BRL: "BR", KRW: "KR", PLN: "PL",
};

const currencyToFlag = (code) => {
  const country = CURRENCY_TO_COUNTRY[code] || code.slice(0, 2);
  if (!country || country.length !== 2) return "";
  return String.fromCodePoint(
    0x1F1E6 + country.charCodeAt(0) - 65,
    0x1F1E6 + country.charCodeAt(1) - 65
  );
};

const getEventWithCurrency = (payload) => {
  const eventName = getEventName(payload);
  if (!eventName || eventName === "N/A") return "Публикация данных";
  const primary = (payload && payload.currencies && payload.currencies[0]) || (payload && payload.currency) || (payload && payload.country);
  if (!primary) return eventName;
  const flag = currencyToFlag(primary);
  return `${eventName} ${flag} ${primary}`.trim();
};

const getClusterCount = (payload) => {
  if (!payload) return 1;
  if (Number.isFinite(payload.cluster_size)) return payload.cluster_size;
  if (Array.isArray(payload.cluster_events) && payload.cluster_events.length > 0) return payload.cluster_events.length;
  return 1;
};

/** Фраза "серия из N публикаций" с цифрой */
const getClusterSeriesPhrase = (payload) => {
  const n = getClusterCount(payload);
  return `серия из ${n} публикаций`;
};

const buildCurrencyLine = (payload) => {
  if (!payload || !Array.isArray(payload.currencies) || payload.currencies.length === 0) {
    return "";
  }
  const items = payload.currencies
    .map((c) => `${currencyToFlag(c)} ${c}`)
    .join(", ");
  return "\n\nЗатронет: " + items;
};

const applyPlaceholders = (phrase, payload, opts) => {
  const minutes = getSafeMinutes(payload);
  const event = getEventName(payload);
  const eventWithCurrency = getEventWithCurrency(payload);
  const clusterCount = getClusterCount(payload);
  const clusterSeries = getClusterSeriesPhrase(payload);
  const time = getEventTimeFormatted(payload);
  const text = [phrase.first, phrase.second].join("\n");
  const filled = text
    .replace(/\{min\}/g, String(minutes))
    .replace(/\{event\}/g, event)
    .replace(/\{event_with_currency\}/g, eventWithCurrency)
    .replace(/\{cluster_count\}/g, String(clusterCount))
    .replace(/\{cluster_series\}/g, clusterSeries)
    .replace(/\{time\}/g, time);
  const lines = filled.split("\n").map(capitalizeAfterEmoji).join("\n");
  if (opts && opts.appendCurrencies) {
    return lines + buildCurrencyLine(payload);
  }
  return lines;
};

const resolveCategory = (payload) => {
  const isCluster = payload && Number.isFinite(payload.cluster_size) && payload.cluster_size > 1;
  const isAnchor = payload && (
    payload.impact_type === "anchor_high" ||
    payload.cluster_has_anchor === true
  );

  if (isCluster && isAnchor) return "anchorStack";
  if (isCluster) return "stack";
  if (isAnchor) return "anchor";
  return "high";
};

module.exports = {
  PRE_EVENT,
  DURING_EVENT,
  POST_EVENT,
  GREEN,
  pickFromPool,
  applyPlaceholders,
  resolveCategory,
  getSafeMinutes,
  getEventName,
  getEventTimeFormatted,
  getEventWithCurrency,
  getClusterCount,
};
