/**
 * Форматирование текста дневного дайджеста по шаблонам из digest-phrases.
 * События уже отфильтрованы: сегодня MSK, high-impact, с полями is_anchor, anchor_label.
 */

const {
  DIGEST_EMPTY_HEADER,
  DIGEST_EMPTY_BODY,
  DIGEST_REGULAR_HEADER,
  DIGEST_EVENT_LINE,
  DIGEST_REGULAR_CLOSING,
  DIGEST_ANCHOR_HEADER,
  DIGEST_ANCHOR_EVENT_LINE,
  DIGEST_ANCHOR_HIGHLIGHT,
  DIGEST_ANCHOR_CLOSING,
  DIGEST_CLUSTER_HEADER,
  DIGEST_CLUSTER_EVENT_LINE,
  DIGEST_CLUSTER_CLOSING,
  DIGEST_CLUSTER_ANCHOR_EVENT_LINE,
  DIGEST_CLUSTER_ANCHOR_HIGHLIGHT,
  DIGEST_CLUSTER_ANCHOR_CLOSING,
} = require("./digest-phrases");

const CURRENCY_TO_COUNTRY = {
  USD: "US", EUR: "EU", GBP: "GB", JPY: "JP", AUD: "AU",
  CAD: "CA", CHF: "CH", NZD: "NZ", CNY: "CN", SEK: "SE",
  NOK: "NO", SGD: "SG", HKD: "HK", MXN: "MX", ZAR: "ZA",
  TRY: "TR", INR: "IN", BRL: "BR", KRW: "KR", PLN: "PL",
};

function currencyToFlag(code) {
  if (!code || typeof code !== "string") return "";
  const c = code.trim().toUpperCase().slice(0, 3);
  const country = CURRENCY_TO_COUNTRY[c] || c.slice(0, 2);
  if (!country || country.length !== 2) return "";
  return String.fromCodePoint(
    0x1F1E6 + country.charCodeAt(0) - 65,
    0x1F1E6 + country.charCodeAt(1) - 65
  );
}

function pickFromPool(seed, pool) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  let n = 0;
  for (let i = 0; i < (seed || "").length; i++) n = (n * 31 + seed.charCodeAt(i)) >>> 0;
  return pool[n % pool.length];
}

/** Форматирует время события в HH:MM по МСК */
function formatTimeMsk(dateIsoOrMs) {
  const ms = typeof dateIsoOrMs === "string" ? Date.parse(dateIsoOrMs) : dateIsoOrMs;
  if (!Number.isFinite(ms)) return "??:??";
  const d = new Date(ms);
  const msk = new Date(d.getTime() + (3 - d.getTimezoneOffset() / 60) * 60 * 60 * 1000);
  const h = msk.getUTCHours();
  const m = msk.getUTCMinutes();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Форматирует дату дня в DD.MM */
function formatDateMsk(moscowDateStr) {
  if (!moscowDateStr || typeof moscowDateStr !== "string") {
    const d = new Date();
    const s = d.toLocaleString("en-CA", { timeZone: "Europe/Moscow" }).slice(0, 10);
    const [y, m, day] = s.split("-");
    return `${day}.${m}`;
  }
  const parts = moscowDateStr.split("-");
  if (parts.length >= 3) return `${parts[2]}.${parts[1]}`;
  return moscowDateStr;
}

/**
 * Строит текст дайджеста по списку событий (уже отфильтрованных: сегодня, high, с is_anchor).
 * @param {Array<{ date: string, title: string, country?: string, is_anchor?: boolean, anchor_label?: string }>} events
 * @param {{ moscowDateStr: string }} opts
 * @returns {string}
 */
function formatDailyDigest(events, opts = {}) {
  const moscowDateStr = opts.moscowDateStr || new Date().toLocaleString("en-CA", { timeZone: "Europe/Moscow" }).slice(0, 10);
  const date = formatDateMsk(moscowDateStr);

  if (!Array.isArray(events) || events.length === 0) {
    const header = DIGEST_EMPTY_HEADER.replace("{date}", date);
    const bodyVariant = pickFromPool(moscowDateStr, DIGEST_EMPTY_BODY);
    const body = Array.isArray(bodyVariant) ? bodyVariant.join("\n") : String(bodyVariant || "");
    return `${header}\n\n${body}`.trim();
  }

  const hasAnchor = events.some((e) => e.is_anchor === true);
  const anchorEvent = hasAnchor ? events.find((e) => e.is_anchor) : null;
  const anchorTime = anchorEvent && anchorEvent.date ? formatTimeMsk(anchorEvent.date) : null;

  const header = hasAnchor
    ? DIGEST_ANCHOR_HEADER.replace("{date}", date)
    : DIGEST_REGULAR_HEADER.replace("{date}", date);

  const lines = [];
  const byTime = new Map();
  for (const e of events) {
    const t = e.date ? formatTimeMsk(e.date) : "??:??";
    if (!byTime.has(t)) byTime.set(t, []);
    byTime.get(t).push(e);
  }

  const sortedTimes = [...byTime.keys()].sort();
  for (const t of sortedTimes) {
    const group = byTime.get(t);
    const title = (group[0].title || "").trim() || "Публикация данных";
    const country = (group[0].country || "USD").trim().toUpperCase();
    const geo = `${currencyToFlag(country)} (${country})`;

    if (group.length > 1) {
      const template = hasAnchor && group.some((x) => x.is_anchor)
        ? DIGEST_CLUSTER_ANCHOR_EVENT_LINE
        : DIGEST_CLUSTER_EVENT_LINE;
      lines.push(template.replace("{time}", t).replace("{geo}", geo));
    } else {
      const template = group[0].is_anchor ? DIGEST_ANCHOR_EVENT_LINE : DIGEST_EVENT_LINE;
      lines.push(template.replace("{time}", t).replace("{title}", title).replace("{geo}", geo));
    }
  }

  const bodyLines = [header, "", ...lines];

  if (hasAnchor && anchorTime) {
    const highlight = pickFromPool(anchorTime, DIGEST_ANCHOR_HIGHLIGHT).replace("{anchor_time}", anchorTime);
    bodyLines.push("", highlight);
    const closing = pickFromPool("anchor", DIGEST_ANCHOR_CLOSING);
    bodyLines.push("", closing);
  } else {
    const closing = pickFromPool("regular", DIGEST_REGULAR_CLOSING);
    bodyLines.push("", closing);
  }

  return bodyLines.join("\n").trim();
}

module.exports = {
  formatDailyDigest,
  formatTimeMsk,
  formatDateMsk,
};
