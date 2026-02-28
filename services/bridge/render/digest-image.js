/**
 * Модуль данных для генерации изображения Daily Digest.
 * buildDigestImageData — формирует объект для HTML-шаблона.
 * renderDigestImage — рендер HTML в PNG через puppeteer.
 */

const fs = require("fs");
const path = require("path");
const { formatDateMsk, formatTimeMsk } = require("./digest-format");

const TEMPLATES_DIR = path.join(__dirname, "templates");

const CURRENCY_TO_COUNTRY = {
  USD: "US", EUR: "EU", GBP: "GB", JPY: "JP", AUD: "AU",
  CAD: "CA", CHF: "CH", NZD: "NZ", CNY: "CN", SEK: "SE",
  NOK: "NO", SGD: "SG", HKD: "HK", MXN: "MX", ZAR: "ZA",
  TRY: "TR", INR: "IN", BRL: "BR", KRW: "KR", PLN: "PL",
};

async function fetchUrlBase64(url) {
  try {
    const https = require("https");
    const http = require("http");
    const mod = url.startsWith("https") ? https : http;
    return await new Promise((resolve) => {
      mod.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchUrlBase64(res.headers.location).then(resolve);
          return;
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("base64")));
        res.on("error", () => resolve(null));
      }).on("error", () => resolve(null));
    });
  } catch {
    return null;
  }
}

async function fetchFlagBase64(countryCode) {
  return fetchUrlBase64(`https://flagcdn.com/24x18/${countryCode.toLowerCase()}.png`);
}

async function fetchChartEmojiBase64() {
  // Twemoji PNG for 📈 (U+1F4C8)
  return fetchUrlBase64("https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/1f4c8.png");
}

function currencyToFlagHtml(code, base64Map) {
  if (!code || typeof code !== "string") return code || "";
  const c = code.trim().toUpperCase().slice(0, 3);
  const country = CURRENCY_TO_COUNTRY[c] || c.slice(0, 2);
  if (!country || country.length !== 2) return c;
  const b64 = base64Map && base64Map[country];
  if (b64) {
    return `<img src="data:image/png;base64,${b64}" width="24" height="18" style="vertical-align:middle;border-radius:2px;margin-right:2px;" alt="${country}"> ${c}`;
  }
  return c;
}

const LEVEL_LABELS = {
  calm: "Спокойный",
  moderate: "Умеренный",
  intense: "Насыщенный",
};

const EMPTY_DAY_DESCRIPTION = "Высокозначимых событий не запланировано";

/**
 * Строит объект данных для шаблона изображения дайджеста.
 * @param {Array<{ title: string, date: string, country?: string, is_anchor?: boolean }>} events
 * @param {{ moscowDateStr?: string }} opts
 * @returns {{
 *   date: string,
 *   dateFormatted: string,
 *   level: "calm"|"moderate"|"intense",
 *   levelLabel: string,
 *   description: string,
 *   peakActivity: string,
 *   currencies: string,
 *   emptyDay: boolean
 * }}
 */
function buildDigestImageData(events, opts = {}) {
  const moscowDateStr = opts.moscowDateStr || new Date().toLocaleString("en-CA", { timeZone: "Europe/Moscow" }).slice(0, 10);
  const dateFormatted = formatDateMsk(moscowDateStr);

  const emptyDay = !Array.isArray(events) || events.length === 0;

  if (emptyDay) {
    return {
      date: moscowDateStr,
      dateFormatted,
      level: "calm",
      levelLabel: LEVEL_LABELS.calm,
      description: EMPTY_DAY_DESCRIPTION,
      peakActivity: "",
      currencies: "",
      emptyDay: true,
    };
  }

  const highCount = events.length;
  const hasAnchor = events.some((e) => e.is_anchor === true);

  let level;
  if (highCount === 0) level = "calm";
  else if (highCount >= 4 || hasAnchor) level = "intense";
  else level = "moderate";

  function timeToPeriodLabel(timeStr) {
    if (!timeStr || timeStr === "??:??") return "";
    const [hStr] = timeStr.split(":");
    const h = parseInt(hStr, 10);
    if (h >= 6 && h < 11) return "Утро";
    if (h >= 11 && h < 16) return "Середина дня";
    if (h >= 16 && h < 21) return "Вечер";
    return timeStr;
  }

  let peakActivity = "";
  if (hasAnchor) {
    const anchorEvent = events.find((e) => e.is_anchor);
    const time = anchorEvent && anchorEvent.date ? formatTimeMsk(anchorEvent.date) : null;
    if (time) peakActivity = timeToPeriodLabel(time) || time;
  } else if (events.length > 0) {
    const times = events.map((e) => (e.date ? formatTimeMsk(e.date) : null)).filter(Boolean);
    if (times.length > 0) {
      const byTime = new Map();
      for (const t of times) byTime.set(t, (byTime.get(t) || 0) + 1);
      const [busiest] = [...byTime.entries()].sort((a, b) => b[1] - a[1])[0] || [];
      if (busiest) peakActivity = timeToPeriodLabel(busiest) || busiest;
    }
  }

  const MAX_CURRENCIES = 3;
  const currencySet = new Set();
  for (const e of events) {
    const c = (e.country || "USD").trim().toUpperCase().slice(0, 3);
    if (c) currencySet.add(c);
  }
  const currencyList = [...currencySet].slice(0, MAX_CURRENCIES);
  const currencies = currencyList.join(",");

  const description = highCount === 1
    ? "Одно значимое событие"
    : `Запланировано ${highCount} событий`;

  return {
    date: moscowDateStr,
    dateFormatted,
    level,
    levelLabel: LEVEL_LABELS[level],
    description,
    peakActivity,
    currencies,
    emptyDay: false,
  };
}

/**
 * Подставляет данные в HTML-шаблон (плейсхолдеры {{key}}).
 * @param {string} html
 * @param {Record<string, string>} data
 * @returns {string}
 */
function substitutePlaceholders(html, data) {
  let result = html;
  for (const [key, value] of Object.entries(data)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(placeholder, String(value != null ? value : ""));
  }
  return result;
}

/**
 * Рендерит изображение дайджеста в PNG через puppeteer.
 * @param {ReturnType<typeof buildDigestImageData>} imageData
 * @param {{ width?: number; height?: number }} [opts]
 * @returns {Promise<Buffer>}
 */
async function renderDigestImage(imageData, opts = {}) {
  const width = opts.width != null ? opts.width : 712;

  const htmlPath = path.join(TEMPLATES_DIR, "digest-image.html");
  const cssPath = path.join(TEMPLATES_DIR, "digest-image.css");
  const iconPath = path.join(TEMPLATES_DIR, "digest-icon.png");

  let html = fs.readFileSync(htmlPath, "utf8");
  let css = fs.readFileSync(cssPath, "utf8");

  const iconBuffer = fs.existsSync(iconPath)
    ? fs.readFileSync(iconPath)
    : null;
  const iconBase64 = iconBuffer
    ? iconBuffer.toString("base64")
    : "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  css = css.replace(/url\(digest-icon\.png\)/g, `url(data:image/png;base64,${iconBase64})`);

  html = html.replace(
    /<link rel="stylesheet" href="digest-image\.css">/,
    `<style>${css}</style>`
  );

  const chartEmojiB64 = await fetchChartEmojiBase64();
  const chartEmojiHtml = chartEmojiB64
    ? `<img src="data:image/png;base64,${chartEmojiB64}" width="36" height="36" style="vertical-align:middle;" alt="📈">`
    : "";
  html = html.replace("{{chartEmoji}}", chartEmojiHtml);

  const rawCurrencies = imageData.currencies != null ? imageData.currencies : "";
  const currencyCodes = rawCurrencies ? rawCurrencies.split(",").map((s) => s.trim()).filter(Boolean) : [];

  const flagBase64Map = {};
  for (const code of currencyCodes) {
    const country = CURRENCY_TO_COUNTRY[code] || code.slice(0, 2);
    if (country && country.length === 2 && !flagBase64Map[country]) {
      const b64 = await fetchFlagBase64(country);
      if (b64) flagBase64Map[country] = b64;
    }
  }

  const currenciesHtml = currencyCodes
    .map((c) => currencyToFlagHtml(c, flagBase64Map))
    .join("&nbsp;&nbsp;&nbsp;");

  const data = {
    date: imageData.dateFormatted != null ? imageData.dateFormatted : imageData.date,
    level: imageData.level != null ? imageData.level : "calm",
    levelLabel: imageData.levelLabel != null ? imageData.levelLabel : LEVEL_LABELS.calm,
    description: imageData.description != null ? imageData.description : "",
    peakActivity: imageData.peakActivity != null ? imageData.peakActivity : "",
    currencies: currenciesHtml,
  };
  html = substitutePlaceholders(html, data);

  const puppeteer = require("puppeteer");
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--font-render-hinting=none",
      "--enable-font-antialiasing",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 1200, deviceScaleFactor: 2 });
    await page.setContent(html, {
      waitUntil: "networkidle2",
      timeout: 15000,
    });

    const contentHeight = await page.evaluate(() => {
      const el = document.querySelector(".digest-wrapper");
      return el ? el.getBoundingClientRect().height : document.body.scrollHeight;
    });

    await page.setViewport({ width, height: Math.ceil(contentHeight), deviceScaleFactor: 2 });

    const wrapper = await page.$(".digest-wrapper");
    const buffer = wrapper
      ? await wrapper.screenshot({ type: "png" })
      : await page.screenshot({ type: "png", fullPage: true });

    return Buffer.from(buffer);
  } finally {
    await browser.close();
  }
}

module.exports = {
  buildDigestImageData,
  renderDigestImage,
};
