/**
 * Daily Overview — генерация текста дневного дайджеста с окнами паузы (±15 мин).
 * Детерминированный вывод без LLM.
 *
 * Алгоритм:
 * 1. Фильтр high impact
 * 2. Сортировка по времени
 * 3. Создание окон паузы (time ± 15 мин)
 * 4. Объединение пересекающихся окон
 * 5. Генерация текста
 */

const {
  DIGEST_HEADER,
  DIGEST_EMPTY_BODY,
  DIGEST_CLOSING,
} = require("./digest-phrases");
const { pluralRu } = require("../../../utils/pluralRu");
const {
  formatDateMsk,
  formatTimeMsk,
  currencyToFlag,
  translateTitle,
  pickFromPool,
} = require("./digest-format");

const PAUSE_MINUTES = 15;

function normalizeImpact(value) {
  return String(value || "").toLowerCase().trim();
}

/**
 * Парсит время события: date (ISO) или time (HH:MM) → минуты с полуночи.
 * @param {{ date?: string, time?: string }} ev
 * @param {string} moscowDateStr — дата дня YYYY-MM-DD для парсинга HH:MM
 * @returns {{ minutes: number, timeStr: string } | null}
 */
function parseEventTime(ev, moscowDateStr) {
  const dateRaw = ev.date || ev.time || "";
  if (!dateRaw || typeof dateRaw !== "string") return null;

  const trimmed = dateRaw.trim();

  // HH:MM или HH:MM:SS
  const hhmmMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (hhmmMatch) {
    const h = parseInt(hhmmMatch[1], 10);
    const m = parseInt(hhmmMatch[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      const minutes = h * 60 + m;
      const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      return { minutes, timeStr };
    }
  }

  // ISO date
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const msk = new Date(d.getTime() + (3 - d.getTimezoneOffset() / 60) * 60 * 60 * 1000);
  const h = msk.getUTCHours();
  const m = msk.getUTCMinutes();
  const minutes = h * 60 + m;
  const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return { minutes, timeStr };
}

/**
 * Минуты → HH:MM
 */
function formatPauseTime(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Создаёт окна паузы для каждого события.
 * @param {Array} events — отсортированные по времени, с полями date/time, title, country, is_anchor, anchor_label
 * @param {string} moscowDateStr
 * @returns {Array<{ startMin: number, endMin: number, events: Array }>}
 */
function createPauseWindows(events, moscowDateStr) {
  const windows = [];
  for (const ev of events) {
    const parsed = parseEventTime(ev, moscowDateStr);
    if (!parsed) continue;
    const { minutes, timeStr } = parsed;
    const startMin = Math.max(0, minutes - PAUSE_MINUTES);
    const endMin = Math.min(24 * 60 - 1, minutes + PAUSE_MINUTES);
    windows.push({
      startMin,
      endMin,
      events: [{ ...ev, timeStr, eventMinutes: minutes }],
    });
  }
  return windows;
}

/**
 * Объединяет пересекающиеся окна (pause_end[i] >= pause_start[i+1]).
 * @param {Array<{ startMin: number, endMin: number, events: Array }>} windows — отсортированы по startMin
 * @returns {Array<{ startMin: number, endMin: number, events: Array }>}
 */
function mergeOverlappingWindows(windows) {
  if (!Array.isArray(windows) || windows.length === 0) return [];
  const sorted = [...windows].sort((a, b) => a.startMin - b.startMin);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = sorted[i];
    if (curr.startMin <= prev.endMin) {
      prev.endMin = Math.max(prev.endMin, curr.endMin);
      prev.events = [...prev.events, ...curr.events];
      prev.events.sort((a, b) => (a.eventMinutes || a.minutes || 0) - (b.eventMinutes || b.minutes || 0));
    } else {
      merged.push(curr);
    }
  }
  return merged;
}

/**
 * Строит текст дайджеста по объединённым окнам.
 * @param {Array<{ startMin: number, endMin: number, events: Array }>} windows
 * @param {string} moscowDateStr
 * @returns {string}
 */
function buildDigestText(windows, moscowDateStr) {
  const date = formatDateMsk(moscowDateStr);
  const header = DIGEST_HEADER.replace("{date}", date);

  if (!Array.isArray(windows) || windows.length === 0) {
    const bodyVariant = pickFromPool(moscowDateStr, DIGEST_EMPTY_BODY);
    const body = Array.isArray(bodyVariant) ? bodyVariant.join("\n") : String(bodyVariant || "");
    return `${header}\n\n${body}`.trim();
  }

  const lines = [];
  for (const win of windows) {
    const pauseStart = formatPauseTime(win.startMin);
    const pauseEnd = formatPauseTime(win.endMin);
    const pauseLine = `Пауза: ${pauseStart}–${pauseEnd}`;

    const firstEvent = win.events[0];
    const timeStr = firstEvent.timeStr || formatPauseTime(firstEvent.eventMinutes || win.startMin);
    const count = win.events.length;

    if (count === 1) {
      const title = translateTitle((firstEvent.title || "").trim()) || "Публикация данных";
      const currency = (firstEvent.country || firstEvent.currency || "USD").trim().toUpperCase();
      const geo = `${currencyToFlag(currency)} ${currency}`;
      const prefix = firstEvent.is_anchor ? "⚡ " : "";
      lines.push(`${prefix}${timeStr} — ${title} ${geo}`);
    } else {
      const hasAnchor = win.events.some((e) => e.is_anchor === true);
      const anchorEv = hasAnchor ? win.events.find((e) => e.is_anchor) : null;
      const anchorLabel = anchorEv && anchorEv.anchor_label ? anchorEv.anchor_label : null;
      const pubWord = pluralRu(count, "публикации", "публикации", "публикаций");
      const prefix = hasAnchor ? "⚡ " : "";
      const seriesText = anchorLabel
        ? `Серия из ${count} ${pubWord} (включая ${anchorLabel})`
        : `Серия из ${count} ${pubWord}`;
      lines.push(`${prefix}${timeStr} — ${seriesText}`);
    }
    lines.push(pauseLine);
    if (win !== windows[windows.length - 1]) lines.push("");
  }

  const bodyLines = [header, "", ...lines];
  bodyLines.push("", DIGEST_CLOSING);
  return bodyLines.join("\n").trim();
}

/**
 * Генерирует готовый текст Telegram-сообщения для дневного обзора.
 * @param {Array<{ date?: string, time?: string, title?: string, country?: string, currency?: string, impact?: string, is_anchor?: boolean, anchor_label?: string }>} events
 * @param {{ moscowDateStr?: string }} opts
 * @returns {string}
 */
function generateDailyOverview(events, opts = {}) {
  const moscowDateStr = opts.moscowDateStr || new Date().toLocaleString("en-CA", { timeZone: "Europe/Moscow" }).slice(0, 10);

  const highImpact = (Array.isArray(events) ? events : [])
    .filter((ev) => ev && normalizeImpact(ev.impact) === "high");

  const withParsed = highImpact
    .map((ev) => {
      const parsed = parseEventTime(ev, moscowDateStr);
      return parsed ? { ...ev, _parsed: parsed } : null;
    })
    .filter(Boolean);

  withParsed.sort((a, b) => a._parsed.minutes - b._parsed.minutes);

  const windows = createPauseWindows(withParsed.map(({ _parsed, ...rest }) => rest), moscowDateStr);
  const merged = mergeOverlappingWindows(windows);
  return buildDigestText(merged, moscowDateStr);
}

module.exports = {
  generateDailyOverview,
  createPauseWindows,
  mergeOverlappingWindows,
  buildDigestText,
  parseEventTime,
  formatPauseTime,
};
