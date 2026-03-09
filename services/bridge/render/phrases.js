const { pluralRu } = require("../../../utils/pluralRu");

const PRE_EVENT = {
  high: [
    { first: "⏳ Через {min} {min_word} выходят важные данные.", second: "Ожидается выход данных." },
    { first: "⏳ Через {min} {min_word} публикация значимой статистики.", second: "Ожидается повышенная активность." },
    { first: "⏳ Через {min} {min_word} выход ключевых показателей.", second: "Публикация приближается." },
    { first: "⏳ Через {min} {min_word} ожидаются важные цифры.", second: "Ожидается повышенная активность." },
    { first: "⏳ Через {min} {min_word} выходят данные.", second: "Публикация приближается." },
  ],
  anchor: [
    { first: "⚡ Через {min} {min_word} — {event}.", second: "Ожидается выход данных." },
    { first: "⚡ Через {min} {min_word} ожидается {event}.", second: "Ожидается повышенная активность." },
    { first: "⚡ Через {min} {min_word} выходит {event}.", second: "Публикация приближается." },
    { first: "⚡ Через {min} {min_word} — {event}.", second: "Ожидается повышенная активность." },
    { first: "⚡ Через {min} {min_word} — {event}.", second: "Ожидается повышенная активность." },
  ],
  stack: [
    { first: "⏳ Через {min} {min_word} выходит несколько данных подряд.", second: "Серия публикаций подряд." },
    { first: "⏳ Через {min} {min_word} публикации пойдут одна за другой.", second: "Серия публикаций подряд." },
    { first: "⏳ Через {min} {min_word} серия экономических публикаций.", second: "Последовательная реакция на публикации." },
    { first: "⏳ Через {min} {min_word} несколько релизов подряд.", second: "Серия публикаций подряд." },
    { first: "⏳ Через {min} {min_word} блок данных без пауз.", second: "Последовательная реакция на публикации." },
  ],
  anchorStack: [
    { first: "⚡ Через {min} {min_word} серия публикаций, включая {event}.", second: "Серия публикаций подряд." },
    { first: "⚡ Через {min} {min_word} блок данных, среди них {event}.", second: "Последовательная реакция на публикации." },
    { first: "⚡ Через {min} {min_word} несколько релизов подряд, включая {event}.", second: "Ожидается выход данных." },
    { first: "⚡ Через {min} {min_word} данные идут один за другим, включая {event}.", second: "Ожидается повышенная активность." },
    { first: "⚡ Через {min} {min_word} серия публикаций, в том числе {event}.", second: "Последовательная реакция на публикации." },
  ],
};

const DURING_EVENT = {
  high: [
    { first: "🔴 {event_with_currency}.", second: "Публикация началась. Идёт реакция рынка." },
    { first: "🔴 {event_with_currency}.", second: "Идёт реакция рынка." },
    { first: "🔴 {event_with_currency}.", second: "Опубликованы данные." },
    { first: "🔴 {event_with_currency}.", second: "Наблюдается повышенная активность." },
    { first: "🔴 {event_with_currency}.", second: "Идёт первичная реакция на публикацию." },
    { first: "🔴 {event_with_currency}.", second: "Публикация началась." },
  ],
  anchor: [
    { first: "🔴 {event_with_currency}.", second: "Публикация началась. Идёт реакция рынка." },
    { first: "🔴 {event_with_currency}.", second: "Идёт реакция рынка." },
    { first: "🔴 {event_with_currency}.", second: "Опубликованы данные." },
    { first: "🔴 {event_with_currency}.", second: "Наблюдается повышенная активность." },
    { first: "🔴 {event_with_currency}.", second: "Идёт первичная реакция на публикацию." },
  ],
  stack: [
    { first: "🔴 Идёт {cluster_series}.", second: "Идёт реакция рынка." },
    { first: "🔴 Идёт {cluster_series}.", second: "Последовательная реакция на публикации." },
    { first: "🔴 Идёт {cluster_series}.", second: "Идёт последовательная реакция." },
    { first: "🔴 Идёт {cluster_series}.", second: "Опубликованы данные." },
    { first: "🔴 Идёт {cluster_series}.", second: "Наблюдается повышенная активность." },
  ],
  anchorStack: [
    { first: "🔴 Идёт {cluster_series}, включая {event}.", second: "Идёт реакция рынка." },
    { first: "🔴 Идёт {cluster_series}, включая {event}.", second: "Последовательная реакция на публикации." },
    { first: "🔴 Идёт {cluster_series}, включая {event}.", second: "Идёт последовательная реакция." },
    { first: "🔴 Идёт {cluster_series}, включая {event}.", second: "Опубликованы данные." },
  ],
};

const GREEN = {
  single: [
    { first: "🟢 Окно волатильности закрыто.", second: "Активность в норме." },
    { first: "🟢 Фаза активности завершена.", second: "Активность в норме." },
    { first: "🟢 Окно волатильности закрыто.", second: "Активность в норме." },
    { first: "🟢 Окно волатильности закрыто.", second: "Публикация отработана." },
    { first: "🟢 Публикация отработана.", second: "Активность в норме." },
    { first: "🟢 Фаза активности завершена.", second: "Активность в норме." },
  ],
  cluster: [
    { first: "🟢 Окно волатильности закрыто.", second: "Активность в норме." },
    { first: "🟢 Блок данных отработан.", second: "Активность в норме." },
    { first: "🟢 Фаза активности завершена.", second: "Публикация отработана." },
    { first: "🟢 Окно волатильности закрыто.", second: "Активность в норме." },
    { first: "🟢 Блок данных отработан.", second: "Активность в норме." },
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

/** Фраза "серия из N публикаций" с цифрой (n ≥ 2 в практике — cluster_size > 1) */
const getClusterSeriesPhrase = (payload) => {
  const n = getClusterCount(payload);
  const word = pluralRu(n, "публикации", "публикаций", "публикаций");
  return `серия из ${n} ${word}`;
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
  const minWord = pluralRu(minutes, "минуту", "минуты", "минут");
  const filled = text
    .replace(/\{min\}/g, String(minutes))
    .replace(/\{min_word\}/g, minWord)
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
