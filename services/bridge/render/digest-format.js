/**
 * Форматирование текста дневного дайджеста по шаблонам из digest-phrases.
 * События уже отфильтрованы: сегодня, high-impact, с полями is_anchor, anchor_label.
 * Время выводится без указания часового пояса.
 */

const {
  DIGEST_HEADER,
  DIGEST_EMPTY_BODY,
  DIGEST_EVENT_LINE,
  DIGEST_ANCHOR_EVENT_LINE,
  DIGEST_CLUSTER_EVENT_LINE,
  DIGEST_CLUSTER_ANCHOR_EVENT_LINE,
  DIGEST_CLOSING,
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

const TITLE_TRANSLATIONS = [
  // ── Центральные банки: решения по ставке ──────────────────────────────────
  { pattern: /fomc rate decision|fed rate decision|federal.*(reserve|funds) rate decision/i, ru: "Решение ФРС по ставке" },
  { pattern: /fomc statement|fed statement/i,             ru: "Заявление ФРС" },
  { pattern: /ecb.*(rate decision|interest rate|monetary policy decision)/i, ru: "Решение ЕЦБ по ставке" },
  { pattern: /boe.*(rate decision|interest rate|monetary policy decision)|bank of england rate/i, ru: "Решение Банка Англии по ставке" },
  { pattern: /boj.*(rate decision|interest rate|monetary policy decision)|bank of japan rate/i, ru: "Решение Банка Японии по ставке" },
  { pattern: /rba.*(rate decision|interest rate|monetary policy decision)|reserve bank of australia rate/i, ru: "Решение РБА по ставке" },
  { pattern: /boc.*(rate decision|interest rate|monetary policy decision)|bank of canada rate/i, ru: "Решение Банка Канады по ставке" },
  { pattern: /snb.*(rate decision|interest rate|monetary policy decision)|swiss national bank rate/i, ru: "Решение НБШ по ставке" },
  { pattern: /rbnz.*(rate decision|interest rate|monetary policy decision)|reserve bank of new zealand rate/i, ru: "Решение РБНЗ по ставке" },
  { pattern: /pboc.*(rate decision|loan prime rate|lpr)/i, ru: "Решение НБК по ставке" },

  // ── Пресс-конференции и речи глав ЦБ ─────────────────────────────────────
  { pattern: /powell.*(speech|speaks|press conference|testimony)|fed chair powell/i, ru: "Речь Пауэлла (ФРС)" },
  { pattern: /lagarde.*(speech|speaks|press conference)/i, ru: "Речь Лагард (ЕЦБ)" },
  { pattern: /bailey.*(speech|speaks|press conference)/i, ru: "Речь Бэйли (Банк Англии)" },
  { pattern: /ueda.*(speech|speaks|press conference)/i,   ru: "Речь Уэды (Банк Японии)" },
  { pattern: /bullock.*(speech|speaks|press conference)/i, ru: "Речь Буллок (РБА)" },
  { pattern: /fomc.*(minutes|meeting minutes)/i,          ru: "Протокол ФРС (FOMC)" },
  { pattern: /ecb.*(minutes|account of monetary)/i,       ru: "Протокол ЕЦБ" },
  { pattern: /boe.*(minutes|mpc minutes)/i,               ru: "Протокол Банка Англии" },
  { pattern: /fed.*(chair|governor|president).*(speech|speaks|testif)/i, ru: "Выступление представителя ФРС" },
  { pattern: /beige book/i,                               ru: "Бежевая книга ФРС" },

  // ── США: рынок труда ──────────────────────────────────────────────────────
  { pattern: /non.?farm (payroll|employment change)|nfp/i, ru: "Нонфарм (NFP)" },
  { pattern: /adp (non.?farm|employment change|nonfarm)/i, ru: "Занятость ADP" },
  { pattern: /unemployment claims|initial (jobless )?claims/i, ru: "Заявки по безработице" },
  { pattern: /continuing (unemployment )?claims/i,        ru: "Повторные заявки по безработице" },
  { pattern: /unemployment rate/i,                        ru: "Уровень безработицы" },
  { pattern: /average hourly earnings/i,                  ru: "Почасовые заработки" },
  { pattern: /labor force participation/i,                ru: "Участие в рабочей силе" },
  { pattern: /jolts|job openings (and labor turnover)?/i, ru: "Вакансии JOLTS" },
  { pattern: /challenger (job cuts|layoffs)/i,            ru: "Увольнения Challenger" },

  // ── США: инфляция ────────────────────────────────────────────────────────
  { pattern: /core (cpi|consumer price index)/i,          ru: "Базовая инфляция CPI" },
  { pattern: /(cpi|consumer price index).*(m\/m|y\/y|mom|yoy)/i, ru: "Инфляция CPI" },
  { pattern: /us cpi|consumer price index/i,              ru: "Инфляция CPI (США)" },
  { pattern: /core (pce|personal consumption expenditure).*(price|deflator|index)/i, ru: "Базовая инфляция PCE" },
  { pattern: /(pce|personal consumption expenditure).*(price index|deflator)/i, ru: "Инфляция PCE" },
  { pattern: /core (ppi|producer price)/i,                ru: "Базовая инфляция PPI" },
  { pattern: /ppi|producer price index/i,                 ru: "Инфляция PPI" },
  { pattern: /import price/i,                             ru: "Цены на импорт" },
  { pattern: /export price/i,                             ru: "Цены на экспорт" },
  { pattern: /trimmed mean (pce|inflation)/i,             ru: "Усечённая инфляция PCE" },

  // ── США: ВВП ──────────────────────────────────────────────────────────────
  { pattern: /gdp (price index|deflator)/i,               ru: "Дефлятор ВВП" },
  { pattern: /(advance|preliminary|final|flash|second|third).*(gdp|gross domestic)/i, ru: "ВВП" },
  { pattern: /gdp.*(q[0-9]|annuali|growth|qoq|yoy|m\/m|y\/y)/i, ru: "ВВП" },
  { pattern: /^gdp$/i,                                    ru: "ВВП" },
  { pattern: /gross domestic product/i,                   ru: "ВВП" },

  // ── США: потребитель и розница ────────────────────────────────────────────
  { pattern: /core retail sales/i,                        ru: "Розничные продажи (без авто)" },
  { pattern: /retail sales/i,                             ru: "Розничные продажи" },
  { pattern: /personal (spending|consumption|income)/i,   ru: "Личные расходы и доходы" },
  { pattern: /consumer (confidence|sentiment)/i,          ru: "Потребительская уверенность" },
  { pattern: /university of michigan.*(sentiment|consumer|confidence)/i, ru: "Потребительское доверие (Мичиган)" },
  { pattern: /michigan.*(sentiment|consumer|confidence)/i, ru: "Потребительское доверие (Мичиган)" },
  { pattern: /conference board.*consumer/i,               ru: "Потребительская уверенность (CB)" },
  { pattern: /cboe|chicago business barometer/i,          ru: "Деловая активность Чикаго" },

  // ── США: деловая активность (PMI / ISM) ─────────────────────────────────
  { pattern: /ism (manufacturing|non.manufacturing|services|non.?mfg)/i, ru: "Деловая активность ISM" },
  { pattern: /ism.*pmi/i,                                 ru: "Деловая активность ISM" },
  { pattern: /(flash|final|prelim\w*|composite|s&p global|markit).*(manufacturing|services|composite).*pmi/i, ru: "PMI" },
  { pattern: /pmi.*(manufacturing|services|composite|flash|final|prelim\w*|s&p global)/i, ru: "PMI" },
  { pattern: /(manufacturing|services|composite|flash|final) pmi/i, ru: "PMI" },
  { pattern: /^pmi$/i,                                    ru: "PMI" },
  { pattern: /chicago (pmi|purchasing managers)/i,        ru: "PMI Чикаго" },
  { pattern: /richmond fed/i,                             ru: "ФРБ Ричмонда" },
  { pattern: /philly fed|philadelphia fed/i,              ru: "ФРБ Филадельфии" },
  { pattern: /empire (state|fed)/i,                       ru: "ФРБ Нью-Йорка" },
  { pattern: /dallas fed/i,                               ru: "ФРБ Далласа" },
  { pattern: /kansas city fed/i,                          ru: "ФРБ Канзас-Сити" },
  { pattern: /atlanta fed|gdpnow/i,                       ru: "ВВП (Atlanta Fed)" },
  { pattern: /national activity index|nai/i,              ru: "Индекс активности ФРБ Чикаго" },

  // ── США: промышленность ───────────────────────────────────────────────────
  { pattern: /industrial production/i,                    ru: "Промышленное производство" },
  { pattern: /manufacturing (production|output)/i,        ru: "Производственный выпуск" },
  { pattern: /capacity utilization/i,                     ru: "Загрузка производственных мощностей" },
  { pattern: /factory orders/i,                           ru: "Заказы на фабрики" },
  { pattern: /durable goods orders/i,                     ru: "Заказы на товары длительного пользования" },
  { pattern: /core durable goods/i,                       ru: "Заказы (без авто и авиа)" },

  // ── США: жильё ───────────────────────────────────────────────────────────
  { pattern: /nahb (housing|home builder|market index)/i, ru: "Индекс рынка жилья NAHB" },
  { pattern: /housing starts/i,                           ru: "Закладки новых домов" },
  { pattern: /building permits/i,                         ru: "Разрешения на строительство" },
  { pattern: /existing home sales/i,                      ru: "Продажи вторичного жилья" },
  { pattern: /new home sales/i,                           ru: "Продажи нового жилья" },
  { pattern: /pending home sales/i,                       ru: "Незавершённые продажи жилья" },
  { pattern: /case.?shiller|home price index/i,           ru: "Цены на жильё (Case-Shiller)" },
  { pattern: /mortgage (applications|delinquencies|rates)/i, ru: "Ипотечные заявки" },

  // ── США: торговля и бюджет ────────────────────────────────────────────────
  { pattern: /trade balance/i,                            ru: "Торговый баланс" },
  { pattern: /current account/i,                         ru: "Счёт текущих операций" },
  { pattern: /federal budget balance/i,                   ru: "Федеральный бюджет" },
  { pattern: /treasury (budget|statement)/i,              ru: "Бюджет Казначейства США" },

  // ── Еврозона / EUR ────────────────────────────────────────────────────────
  { pattern: /eurozone.*cpi|euro.?area.*cpi|eu.*cpi/i,   ru: "Инфляция CPI (Еврозона)" },
  { pattern: /german.*(cpi|consumer price|inflation)/i,   ru: "Инфляция CPI (Германия)" },
  { pattern: /french.*(cpi|consumer price|inflation)/i,   ru: "Инфляция CPI (Франция)" },
  { pattern: /italian.*(cpi|consumer price|inflation)/i,  ru: "Инфляция CPI (Италия)" },
  { pattern: /spanish.*(cpi|consumer price|inflation)/i,  ru: "Инфляция CPI (Испания)" },
  { pattern: /eurozone.*gdp|euro.?area.*gdp/i,            ru: "ВВП (Еврозона)" },
  { pattern: /german.*(gdp|gross domestic)/i,             ru: "ВВП (Германия)" },
  { pattern: /eurozone.*(pmi|purchasing managers)/i,      ru: "PMI (Еврозона)" },
  { pattern: /german.*(pmi|ifo|zew|ifо)/i,                ru: "Деловая активность (Германия)" },
  { pattern: /ifo (business climate|expectations|current)/i, ru: "IFO (Германия)" },
  { pattern: /zew (economic sentiment|expectations)/i,    ru: "ZEW (Германия)" },
  { pattern: /eurozone.*zew/i,                            ru: "ZEW (Еврозона)" },
  { pattern: /eurozone.*(retail sales|consumer)/i,        ru: "Розничные продажи (Еврозона)" },
  { pattern: /eurozone.*(unemployment|jobless)/i,         ru: "Безработица (Еврозона)" },
  { pattern: /eurozone.*(industrial production|factory)/i, ru: "Промышленное производство (Еврозона)" },
  { pattern: /eurozone.*(trade balance)/i,                ru: "Торговый баланс (Еврозона)" },
  { pattern: /german.*(retail sales|trade balance|industrial|factory|unemployment|ifo)/i, ru: "Данные Германии" },
  { pattern: /sentix (investor confidence|eurozone)/i,    ru: "Sentix (Еврозона)" },

  // ── Великобритания / GBP ─────────────────────────────────────────────────
  { pattern: /uk.*(cpi|consumer price|inflation)|british.*cpi/i, ru: "Инфляция CPI (Великобритания)" },
  { pattern: /uk.*(gdp|gross domestic)/i,                 ru: "ВВП (Великобритания)" },
  { pattern: /uk.*(pmi|purchasing managers)/i,            ru: "PMI (Великобритания)" },
  { pattern: /uk.*(retail sales)/i,                       ru: "Розничные продажи (Великобритания)" },
  { pattern: /claimant count/i,                           ru: "Заявки на пособие (Великобритания)" },
  { pattern: /average (earnings|wages).*(uk|britain|british|gbp)/i, ru: "Заработные платы (Великобритания)" },
  { pattern: /uk.*unemployment|claimant count change/i,   ru: "Безработица (Великобритания)" },
  { pattern: /uk.*(industrial production|manufacturing)/i, ru: "Промышленное производство (Великобритания)" },
  { pattern: /uk.*(trade balance)/i,                      ru: "Торговый баланс (Великобритания)" },
  { pattern: /uk.*(ppi|producer price)/i,                 ru: "Инфляция PPI (Великобритания)" },
  { pattern: /uk.*(public sector|net borrowing)/i,        ru: "Госзаимствования (Великобритания)" },
  { pattern: /gfk (consumer confidence|consumer climate)/i, ru: "Потребительская уверенность GfK" },

  // ── Япония / JPY ─────────────────────────────────────────────────────────
  { pattern: /japan.*(cpi|consumer price|inflation)|tokyo.*(cpi|inflation)/i, ru: "Инфляция CPI (Япония)" },
  { pattern: /japan.*(gdp|gross domestic)/i,              ru: "ВВП (Япония)" },
  { pattern: /japan.*(pmi|tankan)/i,                      ru: "Деловая активность (Япония)" },
  { pattern: /tankan/i,                                   ru: "Танкан (Япония)" },
  { pattern: /japan.*(trade balance)/i,                   ru: "Торговый баланс (Япония)" },
  { pattern: /japan.*(retail sales|consumer)/i,           ru: "Розничные продажи (Япония)" },
  { pattern: /japan.*(industrial production)/i,           ru: "Промышленное производство (Япония)" },
  { pattern: /japan.*(unemployment|jobs\/applicants)/i,   ru: "Безработица (Япония)" },
  { pattern: /japan.*(current account)/i,                 ru: "Счёт текущих операций (Япония)" },

  // ── Австралия / AUD ───────────────────────────────────────────────────────
  { pattern: /australia.*(cpi|consumer price|inflation)|australian.*cpi/i, ru: "Инфляция CPI (Австралия)" },
  { pattern: /australia.*(gdp|gross domestic)/i,          ru: "ВВП (Австралия)" },
  { pattern: /australia.*(employment change|labor|labour|jobs)/i, ru: "Занятость (Австралия)" },
  { pattern: /australia.*(unemployment rate)/i,           ru: "Безработица (Австралия)" },
  { pattern: /australia.*(pmi|purchasing managers)/i,     ru: "PMI (Австралия)" },
  { pattern: /australia.*(retail sales)/i,                ru: "Розничные продажи (Австралия)" },
  { pattern: /australia.*(trade balance)/i,               ru: "Торговый баланс (Австралия)" },
  { pattern: /rba.*(statement|minutes|governor)/i,        ru: "Заявление/протокол РБА" },
  { pattern: /westpac (consumer sentiment|confidence)/i,  ru: "Настроения потребителей Westpac" },
  { pattern: /nab (business confidence|business conditions)/i, ru: "Деловая уверенность NAB (Австралия)" },

  // ── Канада / CAD ──────────────────────────────────────────────────────────
  { pattern: /canada.*(cpi|consumer price|inflation)|canadian.*cpi/i, ru: "Инфляция CPI (Канада)" },
  { pattern: /canada.*(gdp|gross domestic)/i,             ru: "ВВП (Канада)" },
  { pattern: /canada.*(employment change|net change in employment|jobs)/i, ru: "Занятость (Канада)" },
  { pattern: /canada.*(unemployment rate)/i,              ru: "Безработица (Канада)" },
  { pattern: /canada.*(retail sales)/i,                   ru: "Розничные продажи (Канада)" },
  { pattern: /canada.*(trade balance)/i,                  ru: "Торговый баланс (Канада)" },
  { pattern: /ivey pmi/i,                                 ru: "PMI Ivey (Канада)" },
  { pattern: /boc.*(statement|minutes|governor|summary)/i, ru: "Заявление/протокол Банка Канады" },

  // ── Новая Зеландия / NZD ─────────────────────────────────────────────────
  { pattern: /new zealand.*(cpi|consumer price|inflation)|nz.*cpi/i, ru: "Инфляция CPI (Новая Зеландия)" },
  { pattern: /new zealand.*(gdp|gross domestic)/i,        ru: "ВВП (Новая Зеландия)" },
  { pattern: /new zealand.*(employment change|labor|labour|jobs)/i, ru: "Занятость (Новая Зеландия)" },
  { pattern: /new zealand.*(trade balance)/i,             ru: "Торговый баланс (Новая Зеландия)" },
  { pattern: /rbnz.*(statement|minutes|governor)/i,       ru: "Заявление/протокол РБНЗ" },
  { pattern: /westpac.*new zealand/i,                     ru: "Настроения потребителей (Новая Зеландия)" },

  // ── Швейцария / CHF ───────────────────────────────────────────────────────
  { pattern: /swiss.*(cpi|consumer price|inflation)/i,    ru: "Инфляция CPI (Швейцария)" },
  { pattern: /swiss.*(gdp|gross domestic)/i,              ru: "ВВП (Швейцария)" },
  { pattern: /swiss.*(trade balance)/i,                   ru: "Торговый баланс (Швейцария)" },
  { pattern: /kof (leading|economic|indicator)/i,         ru: "Опережающий индикатор KOF (Швейцария)" },
  { pattern: /snb.*(statement|minutes|governor)/i,        ru: "Заявление/протокол НБШ" },

  // ── Китай / CNY ───────────────────────────────────────────────────────────
  { pattern: /china.*(cpi|consumer price|inflation)|chinese.*cpi/i, ru: "Инфляция CPI (Китай)" },
  { pattern: /china.*(ppi|producer price)/i,              ru: "Инфляция PPI (Китай)" },
  { pattern: /china.*(gdp|gross domestic)/i,              ru: "ВВП (Китай)" },
  { pattern: /china.*(pmi|purchasing managers|caixin)/i,  ru: "PMI (Китай)" },
  { pattern: /caixin.*(pmi|manufacturing|services)/i,     ru: "PMI Caixin (Китай)" },
  { pattern: /china.*(retail sales|consumer)/i,           ru: "Розничные продажи (Китай)" },
  { pattern: /china.*(industrial production|factory)/i,   ru: "Промышленное производство (Китай)" },
  { pattern: /china.*(trade balance)/i,                   ru: "Торговый баланс (Китай)" },
  { pattern: /pboc.*(loan prime rate|lpr|mlf|omo|reverse repo)/i, ru: "Процентная ставка НБК" },
];

function translateTitle(title) {
  if (!title) return title;
  for (const { pattern, ru } of TITLE_TRANSLATIONS) {
    if (pattern.test(title)) return ru;
  }
  return title;
}

function pickFromPool(seed, pool) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  let n = 0;
  for (let i = 0; i < (seed || "").length; i++) n = (n * 31 + seed.charCodeAt(i)) >>> 0;
  return pool[n % pool.length];
}

/** Форматирует время события в HH:MM (без указания часового пояса) */
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
    const header = DIGEST_HEADER.replace("{date}", date);
    const bodyVariant = pickFromPool(moscowDateStr, DIGEST_EMPTY_BODY);
    const body = Array.isArray(bodyVariant) ? bodyVariant.join("\n") : String(bodyVariant || "");
    return `${header}\n\n${body}`.trim();
  }

  const hasAnchor = events.some((e) => e.is_anchor === true);
  const anchorEvent = hasAnchor ? events.find((e) => e.is_anchor) : null;
  const anchorTime = anchorEvent && anchorEvent.date ? formatTimeMsk(anchorEvent.date) : null;

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
    const title = translateTitle((group[0].title || "").trim()) || "Публикация данных";
    const country = (group[0].country || "USD").trim().toUpperCase();
    const geo = `${currencyToFlag(country)} ${country}`;

    if (group.length > 1) {
      const isAnchorCluster = hasAnchor && group.some((x) => x.is_anchor);
      const template = isAnchorCluster ? DIGEST_CLUSTER_ANCHOR_EVENT_LINE : DIGEST_CLUSTER_EVENT_LINE;
      const line = template.replace("{time}", t).replace("{count}", group.length).replace("{geo}", geo);
      lines.push(line);
    } else {
      const template = group[0].is_anchor ? DIGEST_ANCHOR_EVENT_LINE : DIGEST_EVENT_LINE;
      lines.push(template.replace("{time}", t).replace("{title}", title).replace("{geo}", geo));
    }
  }

  const header = DIGEST_HEADER.replace("{date}", date);
  const bodyLines = [header, "", ...lines];
  bodyLines.push("", DIGEST_CLOSING);

  return bodyLines.join("\n").trim();
}

module.exports = {
  formatDailyDigest,
  formatTimeMsk,
  formatDateMsk,
};
