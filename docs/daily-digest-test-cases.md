# Тестирование кейсов Daily Digest в тестовом Telegram-канале

Daily digest отправляется **только** в тестовый канал. Переменная **TELEGRAM_TEST_CHANNEL_ID** задаёт чат/канал, куда уходят сообщения. Основной канал (**OPENCLAW_TELEGRAM_CHAT_ID**) для дайджеста не используется.

Для отправки нужен **OPENCLAW_GATEWAY_TOKEN** (как и для volatility). Bridge должен быть запущен (локально или в Docker).

## Кейсы

| Кейс | Описание | Условие |
|------|----------|----------|
| 1 | Сегодня нет событий | Нет high-событий на сегодня (MSK) |
| 2 | Обычные события | Есть high, все не якорные, нет кластера |
| 3 | Якорное событие | Хотя бы одно якорное (NFP, FOMC, CPI и т.д.) |
| 4 | Кластер публикаций | Несколько событий в одно время (HH:MM), без якоря |
| 5 | Кластер + якорь | Кластер, в котором есть якорное событие |

**Кластер** = два и более события с одинаковым временем по Москве. **Якорь** = классификация по алиасам из `services/bridge/data/anchor_events.json` (например FOMC Rate Decision, Non-Farm Payrolls, CPI y/y).

## Быстрый прогон (скрипт)

```bash
BRIDGE_URL=http://localhost:3000 node scripts/send-daily-digest-test-cases.js
```

В Docker (если bridge в контейнере):

```bash
BRIDGE_URL=http://bridge:3000 node scripts/send-daily-digest-test-cases.js
```

В тестовый канал уйдёт 5 сообщений — по одному на каждый кейс.

## Ручная проверка (curl)

Подставьте `YYYY-MM-DD` — дату **сегодня по Москве** (например `2026-02-26`). URL: `http://localhost:3000` или `http://bridge:3000` в Docker.

### Кейс 1 — Нет событий

```bash
curl -s -X POST http://localhost:3000/daily-digest \
  -H "Content-Type: application/json" \
  -d '{"items":[]}'
```

### Кейс 2 — Обычные события (разное время)

```bash
curl -s -X POST http://localhost:3000/daily-digest \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"title": "Retail Sales", "date": "YYYY-MM-DDT07:00:00+03:00", "impact": "High", "country": "USD"},
      {"title": "Unemployment Claims", "date": "YYYY-MM-DDT11:00:00+03:00", "impact": "High", "country": "USD"}
    ]
  }'
```

### Кейс 3 — Якорное событие

```bash
curl -s -X POST http://localhost:3000/daily-digest \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"title": "FOMC Rate Decision", "date": "YYYY-MM-DDT14:00:00+03:00", "impact": "High", "country": "USD"}
    ]
  }'
```

### Кейс 4 — Кластер без якоря (одно время)

```bash
curl -s -X POST http://localhost:3000/daily-digest \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"title": "Retail Sales", "date": "YYYY-MM-DDT10:00:00+03:00", "impact": "High", "country": "USD"},
      {"title": "Unemployment Claims", "date": "YYYY-MM-DDT10:00:00+03:00", "impact": "High", "country": "USD"}
    ]
  }'
```

### Кейс 5 — Кластер + якорь (одно время, одно якорное)

```bash
curl -s -X POST http://localhost:3000/daily-digest \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"title": "FOMC Rate Decision", "date": "YYYY-MM-DDT14:00:00+03:00", "impact": "High", "country": "USD"},
      {"title": "Preliminary PMI", "date": "YYYY-MM-DDT14:00:00+03:00", "impact": "High", "country": "USD"}
    ]
  }'
```

## Ответ

При успехе: `{"status":"ok","meta":{"eventsCount":N,"sent":true,"calendar_source":"body"}}`. Если **TELEGRAM_TEST_CHANNEL_ID** не задан, вернётся 503 и сообщение никуда не отправится.
