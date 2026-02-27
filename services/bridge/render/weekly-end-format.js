/**
 * Форматирование текста «Итоги недели» (Weekly End) по спеке.
 * Вход: payload с week_range, high_events, anchor_events, clusters,
 * total_window_minutes, active_days, quiet_days_count, busy_day_bonus (опционально).
 */

const {
  WEEKLY_HEADER,
  LEVEL_CALM_PHRASES,
  LEVEL_MODERATE_PHRASES,
  LEVEL_SATURATED_PHRASES,
  HIGH_EVENTS_PHRASES,
  ANCHOR_ZERO_PHRASES,
  ANCHOR_ONE_PHRASES,
  ANCHOR_TWO_PHRASES,
  CLUSTERS_ZERO_PHRASES,
  CLUSTERS_ONE_PHRASES,
  CLUSTERS_TWO_PHRASES,
  DISTRIBUTION_CALM_PHRASES,
  DISTRIBUTION_ONE_PHRASES,
  DISTRIBUTION_TWO_PHRASES,
  DISTRIBUTION_MANY_PHRASES,
  WINDOW_LINE,
  QUIET_NOTE,
  CLOSING,
  LEVEL_CALM,
  LEVEL_MODERATE,
  LEVEL_SATURATED,
  LEVEL_CALM_SUB,
  LEVEL_MODERATE_SUB,
  LEVEL_SATURATED_SUB,
  DAY_NAME_RU,
  MAX_LINES,
  WEEKLY_FORBIDDEN_WORDS,
} = require("./weekly-end-phrases");

/** Баллы: anchor*3 + high*1 + clusters*2 + busy_day_bonus */
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

/** total_window_minutes → "Xm" или "Xч Ym" (пример: 175 → "2ч 55м") */
function formatMinutes(totalMinutes) {
  const m = Math.max(0, Math.floor(Number(totalMinutes) || 0));
  if (m <= 59) return `${m}м`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}ч` : `${h}ч ${rem}м`;
}

/** Склонение для русского: one (1), few (2-4), many (0,5-20,21-24...) */
function pluralRu(n, one, few, many) {
  const x = Math.abs(Number(n)) % 100;
  const d = x % 10;
  if (x >= 11 && x <= 14) return many;
  if (d === 1) return one;
  if (d >= 2 && d <= 4) return few;
  return many;
}

/** Индекс варианта фразы 0..3 (детерминировано по week_range) */
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
  return WEEKLY_FORBIDDEN_WORDS.find((word) => normalized.includes(word));
}

/** Проверка: только 📊 (U+1F4CA) в тексте. В JS \p{Emoji} матчит и цифры — их не считаем за «лишние» эмодзи. */
function hasOnlyAllowedEmoji(text) {
  if (!text || typeof text !== "string") return true;
  const emojiMatches = text.match(/\p{Emoji}/gu);
  if (!emojiMatches || emojiMatches.length === 0) return true;
  const CHART = 0x1f4ca;
  const ASCII_DIGITS = new Set([0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]);
  return emojiMatches.every((e) => {
    const cp = e.codePointAt(0);
    return cp === CHART || ASCII_DIGITS.has(cp);
  });
}

/**
 * Валидация текста «Итоги недели» перед отправкой (шаг 4 спеки).
 * @param {object} payload — тот же объект, что передаётся в formatWeeklyEnd
 * @param {string} text — сформированный текст
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function validateWeeklyEnd(payload, text) {
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

  const expectedWindow = formatMinutes(Number(payload.total_window_minutes) || 0);
  if (!t.includes(expectedWindow)) {
    return { ok: false, reason: "window_format_mismatch" };
  }

  return { ok: true };
}

/**
 * Формирует итоговый текст для Telegram.
 * @param {{
 *   week_range?: string,
 *   high_events?: number,
 *   anchor_events?: number,
 *   clusters?: number,
 *   total_window_minutes?: number,
 *   active_days?: string[],
 *   quiet_days_count?: number,
 *   busy_day_bonus?: 0 | 1
 * }} payload
 * @returns {string}
 */
/** Строка про высокозначимые с правильным склонением */
function getHighEventsLine(n, variantIndex) {
  const templates = HIGH_EVENTS_PHRASES;
  const idx = variantIndex % (templates.length || 1);
  const t = templates[idx] || templates[0];
  const word =
    idx <= 1
      ? pluralRu(n, "публикация", "публикации", "публикаций")
      : idx === 2
        ? pluralRu(n, "high-событие", "high-события", "high-событий")
        : pluralRu(n, "публикация", "публикации", "публикаций");
  if (t.includes("высокой значимости")) {
    return `${n} ${word} высокой значимости.`;
  }
  return `${n} ${word}.`;
}

function formatWeeklyEnd(payload) {
  const weekRange = payload.week_range || "";
  const highEvents = Number(payload.high_events) || 0;
  const anchorEvents = Number(payload.anchor_events) || 0;
  const clusters = Number(payload.clusters) || 0;
  const totalMinutes = Number(payload.total_window_minutes) || 0;
  const quietDaysCount = Number(payload.quiet_days_count) || 0;
  const activeDaysRu = getActiveDaysRu(payload.active_days);

  const score = getScore(payload);
  let levelKey = getLevelFromScore(score);
  levelKey = applyQuietDowngrade(levelKey, quietDaysCount);

  const v = getVariantIndex(weekRange);
  const blocks = [];

  // Блок 1: заголовок
  blocks.push(WEEKLY_HEADER.replace("{date}", weekRange));

  // Блок 2: уровень недели
  const levelPhrases =
    levelKey === LEVEL_SATURATED
      ? LEVEL_SATURATED_PHRASES
      : levelKey === LEVEL_MODERATE
        ? LEVEL_MODERATE_PHRASES
        : LEVEL_CALM_PHRASES;
  blocks.push(levelPhrases[v] != null ? levelPhrases[v] : levelPhrases[0]);

  // Блок 3: метрики (high, anchor, clusters) — без пустых строк между строками
  const metricLines = [];
  if (highEvents > 0) {
    metricLines.push(getHighEventsLine(highEvents, v));
  }
  if (anchorEvents === 0) {
    metricLines.push(ANCHOR_ZERO_PHRASES[v] != null ? ANCHOR_ZERO_PHRASES[v] : ANCHOR_ZERO_PHRASES[0]);
  } else if (anchorEvents === 1) {
    metricLines.push(ANCHOR_ONE_PHRASES[v] != null ? ANCHOR_ONE_PHRASES[v] : ANCHOR_ONE_PHRASES[0]);
  } else if (anchorEvents === 2) {
    metricLines.push(ANCHOR_TWO_PHRASES[v] != null ? ANCHOR_TWO_PHRASES[v] : ANCHOR_TWO_PHRASES[0]);
  } else {
    metricLines.push(`${anchorEvents} ключевых событий.`);
  }
  if (clusters === 0) {
    metricLines.push(CLUSTERS_ZERO_PHRASES[v] != null ? CLUSTERS_ZERO_PHRASES[v] : CLUSTERS_ZERO_PHRASES[0]);
  } else if (clusters === 1) {
    metricLines.push(CLUSTERS_ONE_PHRASES[v] != null ? CLUSTERS_ONE_PHRASES[v] : CLUSTERS_ONE_PHRASES[0]);
  } else if (clusters === 2) {
    metricLines.push(CLUSTERS_TWO_PHRASES[v] != null ? CLUSTERS_TWO_PHRASES[v] : CLUSTERS_TWO_PHRASES[0]);
  } else {
    metricLines.push(`${clusters} плотных новостных интервалов.`);
  }
  blocks.push(metricLines.join("\n"));

  // Блок 4: распределение + окно
  const distributionLines = [];
  if (levelKey === LEVEL_CALM) {
    distributionLines.push(DISTRIBUTION_CALM_PHRASES[v] != null ? DISTRIBUTION_CALM_PHRASES[v] : DISTRIBUTION_CALM_PHRASES[0]);
  } else if (activeDaysRu.length === 1) {
    const onePhrase = DISTRIBUTION_ONE_PHRASES[v] != null ? DISTRIBUTION_ONE_PHRASES[v] : DISTRIBUTION_ONE_PHRASES[0];
    distributionLines.push(onePhrase.replace("{day}", activeDaysRu[0]));
  } else if (activeDaysRu.length === 2) {
    const twoPhrase = DISTRIBUTION_TWO_PHRASES[v] != null ? DISTRIBUTION_TWO_PHRASES[v] : DISTRIBUTION_TWO_PHRASES[0];
    distributionLines.push(twoPhrase.replace("{day1}", activeDaysRu[0]).replace("{day2}", activeDaysRu[1]));
  } else {
    distributionLines.push(DISTRIBUTION_MANY_PHRASES[v] != null ? DISTRIBUTION_MANY_PHRASES[v] : DISTRIBUTION_MANY_PHRASES[0]);
  }
  distributionLines.push(WINDOW_LINE.replace("{window}", formatMinutes(totalMinutes)));
  if (quietDaysCount >= 3) {
    distributionLines.push(QUIET_NOTE);
  }
  blocks.push(distributionLines.join("\n"));

  // Блок 5: закрытие
  blocks.push(CLOSING);

  const text = blocks.join("\n\n").trim();
  const lines = text.split("\n").filter((s) => s.trim().length > 0);

  if (lines.length > MAX_LINES) {
    console.warn("[weekly-end] Превышено макс. строк:", lines.length, ">", MAX_LINES);
  }
  const forbidden = checkForbiddenWords(text);
  if (forbidden) {
    console.warn("[weekly-end] Обнаружено запрещённое слово:", forbidden);
  }

  return text;
}

module.exports = {
  formatWeeklyEnd,
  validateWeeklyEnd,
  getScore,
  getLevelFromScore,
  applyQuietDowngrade,
  formatMinutes,
  checkForbiddenWords,
};
