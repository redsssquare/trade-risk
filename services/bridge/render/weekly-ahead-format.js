/**
 * Форматирование текста «Ритм недели» (Weekly Ahead) по спеке.
 * Вход: payload с week_range, high_events, anchor_events, clusters,
 * active_days, quiet_days_count, busy_day_bonus, high_events_per_day (опционально).
 */

const {
  WEEKLY_HEADER,
  LEVEL_CALM_PHRASES,
  LEVEL_MODERATE_PHRASES,
  LEVEL_SATURATED_PHRASES,
  ANCHOR_ZERO_PHRASES,
  ANCHOR_ONE_PHRASES,
  ANCHOR_TWO_PHRASES,
  ANCHOR_MANY_PHRASES,
  CLUSTERS_ZERO_PHRASES,
  CLUSTERS_ONE_PHRASES,
  CLUSTERS_TWO_PHRASES,
  DISTRIBUTION_CALM_PHRASES,
  DISTRIBUTION_MODERATE_PHRASES,
  DISTRIBUTION_SATURATED_PHRASES,
  CLOSING_PHRASES,
  LEVEL_CALM,
  LEVEL_MODERATE,
  LEVEL_SATURATED,
  LEVEL_CALM_SUB,
  LEVEL_MODERATE_SUB,
  LEVEL_SATURATED_SUB,
  DAY_NAME_RU,
  MAX_LINES,
  WEEKLY_AHEAD_FORBIDDEN_WORDS,
} = require("./weekly-ahead-phrases");
const { pluralRu } = require("../../../utils/pluralRu");

/** Баллы: anchor*3 + high*1 + clusters*2 + busy_day_bonus (как в Weekly End) */
function getScore(payload) {
  const a = Number(payload.anchor_events) || 0;
  const h = Number(payload.high_events) || 0;
  const c = Number(payload.clusters) || 0;
  const b = payload.busy_day_bonus === 1 ? 1 : 0;
  return a * 3 + h * 1 + c * 2 + b;
}

/** Уровень по score до понижения: 0–4 спокойная, 5–9 умеренная, 10+ насыщенная */
function getLevelFromScore(score) {
  if (score >= 10) return LEVEL_SATURATED;
  if (score >= 5) return LEVEL_MODERATE;
  return LEVEL_CALM;
}

/** Понижение на одну категорию при quiet_days_count >= 3 */
function applyQuietDowngrade(level, quietDaysCount) {
  const q = Number(quietDaysCount) || 0;
  if (q < 3) return level;
  if (level === LEVEL_SATURATED) return LEVEL_MODERATE;
  if (level === LEVEL_MODERATE) return LEVEL_CALM;
  return LEVEL_CALM;
}

/** Нормализует диапазон дат в заголовок: "03–07.03" → "03.03–07.03" (формат 03.03–07.03) */
function formatWeekRangeDisplay(weekRange) {
  if (!weekRange || typeof weekRange !== "string") return weekRange || "";
  const m = weekRange.match(/^(\d{1,2})–(\d{1,2}\.\d{1,2}(?:\.\d{2,4})?)$/);
  if (!m) return weekRange;
  return `${m[1]}.${m[2].replace(/^\d{1,2}\./, "")}–${m[2]}`;
}

/** Индекс варианта фразы 0..N (детерминировано по week_range) */
function getVariantIndex(weekRange) {
  if (!weekRange || typeof weekRange !== "string") return 0;
  let h = 0;
  for (let i = 0; i < weekRange.length; i++) h = (h * 31 + weekRange.charCodeAt(i)) | 0;
  return Math.abs(h) % 4;
}

/** active_days (Mon, Tue, ...) → русские названия */
function getActiveDaysRu(activeDays) {
  const days = Array.isArray(activeDays) ? activeDays : [];
  return days
    .map((d) => (typeof d === "string" ? DAY_NAME_RU[d] || d : ""))
    .filter(Boolean);
}

function checkForbiddenWords(text) {
  const normalized = (text || "").toLowerCase();
  return WEEKLY_AHEAD_FORBIDDEN_WORDS.find((word) => normalized.includes(word));
}

/** Проверка: только 📆 (заголовок) и цифры в эмодзи-позициях (как в Weekly End). */
function hasOnlyAllowedEmoji(text) {
  if (!text || typeof text !== "string") return true;
  const emojiMatches = text.match(/\p{Emoji}/gu);
  if (!emojiMatches || emojiMatches.length === 0) return true;
  const CALENDAR = 0x1f4c6; // 📆 (U+1F4C6)
  const ASCII_DIGITS = new Set([0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]);
  return emojiMatches.every((e) => {
    const cp = e.codePointAt(0);
    return cp === CALENDAR || ASCII_DIGITS.has(cp);
  });
}

/**
 * Валидация текста «Ритм недели» перед отправкой.
 * @param {object} payload
 * @param {string} text
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function validateWeeklyAhead(payload, text) {
  const t = typeof text === "string" ? text.trim() : "";
  if (!t) return { ok: false, reason: "empty_text" };

  const score = getScore(payload);
  let levelKey = getLevelFromScore(score);
  levelKey = applyQuietDowngrade(levelKey, Number(payload.quiet_days_count) || 0);
  const levelSub =
    levelKey === LEVEL_SATURATED
      ? LEVEL_SATURATED_SUB
      : levelKey === LEVEL_MODERATE
        ? LEVEL_MODERATE_SUB
        : LEVEL_CALM_SUB;
  if (!t.includes(levelSub)) {
    return { ok: false, reason: "level_mismatch" };
  }

  const lines = t.split("\n").map((s) => s.trim()).filter(Boolean);
  if (lines.length > MAX_LINES) {
    return { ok: false, reason: "too_many_lines" };
  }

  const forbidden = checkForbiddenWords(t);
  if (forbidden) {
    return { ok: false, reason: `forbidden_word:${forbidden}` };
  }

  if (!hasOnlyAllowedEmoji(t)) {
    return { ok: false, reason: "extra_emoji" };
  }

  return { ok: true };
}

/** Строка про высокозначимые: «Запланированы N публикации/публикаций высокой значимости» */
function getHighEventsLine(n) {
  const word = pluralRu(n, "публикация", "публикации", "публикаций");
  return `Запланированы ${n} ${word} высокой значимости.`;
}

/**
 * Формирует итоговый текст для Telegram.
 * @param {{
 *   week_range?: string,
 *   high_events?: number,
 *   anchor_events?: number,
 *   clusters?: number,
 *   active_days?: string[],
 *   quiet_days_count?: number,
 *   busy_day_bonus?: 0 | 1,
 *   high_events_per_day?: number[]
 * }} payload
 * @returns {string}
 */
function formatWeeklyAhead(payload) {
  const weekRange = payload.week_range || "";
  const highEvents = Number(payload.high_events) || 0;
  const anchorEvents = Number(payload.anchor_events) || 0;
  const clusters = Number(payload.clusters) || 0;
  const quietDaysCount = Number(payload.quiet_days_count) || 0;

  const score = getScore(payload);
  let levelKey = getLevelFromScore(score);
  levelKey = applyQuietDowngrade(levelKey, quietDaysCount);

  const v = getVariantIndex(weekRange);
  const blocks = [];

  // Блок 1: заголовок
  const dateDisplay = formatWeekRangeDisplay(weekRange);
  blocks.push(WEEKLY_HEADER.replace("{date}", dateDisplay));

  // Блок 2: уровень недели
  const levelPhrases =
    levelKey === LEVEL_SATURATED
      ? LEVEL_SATURATED_PHRASES
      : levelKey === LEVEL_MODERATE
        ? LEVEL_MODERATE_PHRASES
        : LEVEL_CALM_PHRASES;
  blocks.push(levelPhrases[v % levelPhrases.length] || levelPhrases[0]);

  // Блок 3: метрики (high, anchor, clusters) — отдельным списком
  const metricLines = [];
  if (highEvents > 0) {
    metricLines.push(getHighEventsLine(highEvents));
  }
  if (anchorEvents === 0) {
    metricLines.push(ANCHOR_ZERO_PHRASES[v % ANCHOR_ZERO_PHRASES.length] || ANCHOR_ZERO_PHRASES[0]);
  } else if (anchorEvents === 1) {
    metricLines.push(ANCHOR_ONE_PHRASES[v % ANCHOR_ONE_PHRASES.length] || ANCHOR_ONE_PHRASES[0]);
  } else if (anchorEvents === 2) {
    metricLines.push(ANCHOR_TWO_PHRASES[v % ANCHOR_TWO_PHRASES.length] || ANCHOR_TWO_PHRASES[0]);
  } else {
    const manyPhrase = ANCHOR_MANY_PHRASES[v % ANCHOR_MANY_PHRASES.length] || ANCHOR_MANY_PHRASES[0];
    const anchorWord = pluralRu(anchorEvents, "ключевое событие", "ключевых события", "ключевых событий");
    metricLines.push(manyPhrase.replace("{n} ключевых событий", `${anchorEvents} ${anchorWord}`));
  }
  if (clusters === 0) {
    metricLines.push(CLUSTERS_ZERO_PHRASES[v % CLUSTERS_ZERO_PHRASES.length] || CLUSTERS_ZERO_PHRASES[0]);
  } else if (clusters === 1) {
    metricLines.push(CLUSTERS_ONE_PHRASES[v % CLUSTERS_ONE_PHRASES.length] || CLUSTERS_ONE_PHRASES[0]);
  } else {
    metricLines.push(CLUSTERS_TWO_PHRASES[v % CLUSTERS_TWO_PHRASES.length] || CLUSTERS_TWO_PHRASES[0]);
  }
  const metricList = metricLines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `• ${line}`)
    .join("\n");
  blocks.push(metricList);

  // Блок 4: распределение по неделе
  const distributionPhrases =
    levelKey === LEVEL_CALM
      ? DISTRIBUTION_CALM_PHRASES
      : levelKey === LEVEL_MODERATE
        ? DISTRIBUTION_MODERATE_PHRASES
        : DISTRIBUTION_SATURATED_PHRASES;
  blocks.push(distributionPhrases[v % distributionPhrases.length] || distributionPhrases[0]);

  // Блок 5: закрытие
  blocks.push(CLOSING_PHRASES[v % CLOSING_PHRASES.length] || CLOSING_PHRASES[0]);

  const text = blocks.join("\n\n").trim();
  const lines = text.split("\n").filter((s) => s.trim().length > 0);

  if (lines.length > MAX_LINES) {
    console.warn("[weekly-ahead] Превышено макс. строк:", lines.length, ">", MAX_LINES);
  }
  const forbidden = checkForbiddenWords(text);
  if (forbidden) {
    console.warn("[weekly-ahead] Обнаружено запрещённое слово:", forbidden);
  }

  return text;
}

module.exports = {
  formatWeeklyAhead,
  validateWeeklyAhead,
  getScore,
  getLevelFromScore,
  applyQuietDowngrade,
  checkForbiddenWords,
};
