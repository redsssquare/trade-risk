# Daily Workflow — чеклист ручной проверки

Цель: за 5–10 минут проверить Daily Digest workflow вручную.

**Важно:** переключите на тестовый режим (`TELEGRAM_MODE=test` или `TEST_CHANNEL=true`), чтобы уведомления шли в тестовый канал, а не в основной.

---

## Подготовка

1. Запустите bridge: `cd services/bridge && npm start` (или через Docker).
2. Убедитесь, что заданы `TELEGRAM_TEST_CHANNEL_ID`, `OPENCLAW_GATEWAY_TOKEN` (или `TELEGRAM_BOT_TOKEN`).

---

## 1. Подмена calendar-feed

**Способ A — POST с телом:** вместо фетча календаря передайте `items` в теле запроса:

```bash
curl -s -X POST http://localhost:3000/daily-digest \
  -H "Content-Type: application/json" \
  -d '{"items": [{"title": "CPI m/m", "date": "2026-03-08T12:00:00+03:00", "impact": "High", "country": "USD"}]}'
```

**Способ B — подмена в n8n:** в узле Fetch Calendar временно замените URL на мок или подставьте результат Set node с фиксированным JSON.

---

## 2. Проверка фильтра 9–21 МСК

Workflow фильтрует события по торговому окну **9:00–21:00 МСК**. События вне окна не попадают в digest.

| Событие | Время (МСК) | Ожидание |
|---------|-------------|----------|
| В окне | 10:00 | В items |
| В окне | 20:30 | В items |
| Вне окна | 08:00 | Отфильтровано |
| Вне окна | 22:00 | Отфильтровано |

**Проверка:** отправьте `items` с событием в 08:00 МСК — в digest не должно быть событий (или только те, что в окне).

---

## 3. Проверка фильтра High / Medium / Low

Только события с `impact === "High"` попадают в digest. Medium и Low отфильтровываются.

---

## 4. Проверка digest (anchor + high)

| Сценарий | Ожидание |
|----------|----------|
| Anchor (NFP, FOMC, CPI) | В тексте digest — с эмодзи ⚡ |
| High без anchor | Обычное отображение |
| Anchor + High в digest | Корректный текст, anchor с ⚡ |

---

## Быстрый прогон (скрипт)

```bash
BRIDGE_URL=http://localhost:3000 node scripts/send-daily-digest-test-cases.js
```

Скрипт отправляет 5 кейсов в тестовый канал. Подробнее: [daily-digest-test-cases.md](daily-digest-test-cases.md).

---

## Успех

- Digest приходит в тестовый канал.
- События «сегодня» по МСК в окне 9–21.
- Anchor-события отображаются с ⚡.
- События вне окна и Medium/Low отсутствуют.
