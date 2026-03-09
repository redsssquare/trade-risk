# Руководство по сценарному тестированию

## Режим: основной канал (боевой)

Сценарии публикуют в **основной канал** (`TELEGRAM_CHAT_ID`). Убедитесь, что bridge запущен с `TEST_CHANNEL=false` или `TELEGRAM_MODE=production` в `.env`.

## Предусловия

Перед запуском убедитесь:

- Bridge запущен (`npm run bridge` или `node services/bridge/server.js`)
- В `.env` bridge заданы:
  - `TELEGRAM_BOT_TOKEN` — токен бота
  - `TELEGRAM_CHAT_ID` — ID основного канала (например, `-100xxxxxxxxxx`)
  - `TEST_CHANNEL=false` или `TELEGRAM_MODE=production` — маршрутизация в основной канал
- Бот является администратором основного канала

---

## Быстрый запуск (все 4 сценария последовательно)

```bash
BRIDGE_URL=http://localhost:3000 node scripts/run-all-scenario-tests.js
```

Скрипт запускает сценарии по порядку с паузой 2.5 сек между ними:
1. Weekly Ahead (ритм недели)
2. Weekly End (итоги недели)
3. Daily Digest (обзор дня) — только 5 ключевых кейсов в режиме SCENARIO_MODE
4. Volatility Window — 9 кейсов (S5→S1→S6→S7→S2→S8→S4→S9→S10)

---

## Запуск отдельных сценариев

### Weekly Ahead
```bash
BRIDGE_URL=http://localhost:3000 node scripts/send-weekly-ahead-test-cases.js
```

### Weekly End
```bash
BRIDGE_URL=http://localhost:3000 node scripts/send-weekly-digest-test.js
```

### Daily Digest
```bash
# Все 16 кейсов
BRIDGE_URL=http://localhost:3000 node scripts/send-daily-digest-test-cases.js

# Только 5 ключевых кейсов
SCENARIO_MODE=1 BRIDGE_URL=http://localhost:3000 node scripts/send-daily-digest-test-cases.js

# Локальный прогон без отправки в Telegram
DRY_RUN=1 node scripts/send-daily-digest-test-cases.js
```

### Volatility Window
```bash
BRIDGE_URL=http://localhost:3000 node scripts/send-volatility-test-events.js
```

---

## Таблица кейсов по сценариям

### Weekly Ahead (`send-weekly-ahead-test-cases.js`)

| Кейс | Тип | Что проверять в Telegram |
|------|-----|--------------------------|
| 1 — Спокойная неделя (high=1, anchor=0) | `single` | Текст уровня «спокойная», 1 событие, нет anchor |
| 2 — Умеренная (high=4, anchor=1) | `multiple` | Уровень «умеренная», несколько событий |
| 3 — Насыщенная (high=5, anchor=2) | `multiple` | Уровень «насыщенная», busy_day_bonus |
| 4 — Понижение: насыщенная→умеренная | `anchor` | Уровень понижен из-за quiet_days |
| 5 — Ключевые anchor 3+ | `anchor` | Фраза с anchor-событиями, склонение |
| 6 — С high_events_per_day | `multiple` | Распределение по дням |
| 7 — Граничный: все нули | `single` | Минимальный текст |
| 8 — Граничный: 1 anchor, 1 high | `anchor` | Корректное склонение |
| 9 — Кластер с anchor | `cluster_anchor` | clusters>0 && anchor>0 |

### Weekly End (`send-weekly-digest-test.js`)

| Кейс | Тип | Что проверять в Telegram |
|------|-----|--------------------------|
| 1 — Спокойная, 1 день | `single` | Уровень «спокойная», формат итогов |
| 2 — Умеренная, 2 дня | `multiple` | anchor_events=1, окно в часах |
| 3 — Насыщенная, busy_day_bonus | `anchor` | anchor_events=2, уровень |
| 4 — Понижение quiet_days | `anchor` | Понижение уровня |
| 5 — Кластер с anchor | `cluster_anchor` | clusters=2, anchor=2 |

### Daily Digest (`send-daily-digest-test-cases.js`)

| Кейс | Тип | Что проверять в Telegram |
|------|-----|--------------------------|
| 1 — Нет событий | `single` | «Событий нет» / тихий день |
| 2 — 6 обычных событий | `multiple` | Список событий, эмодзи валют |
| 3 — Якорное событие (FOMC) | `anchor` | ⚡ в тексте, название anchor |
| 5 — Кластер + якорь | `cluster_anchor` | Кластер событий в одно время + anchor |
| 7 — Одно событие | `single` | Одно событие в тексте |

### Volatility Window (`send-volatility-test-events.js`)

| Кейс | Тип | Фаза | Что проверять в Telegram |
|------|-----|------|--------------------------|
| S5 | `single` | pre_event | ⏳ high-фраза, без anchor |
| S1 | `anchor` | pre_event | ⏳ anchor-фраза, название NFP |
| S6 | `multiple` | pre_event | ⏳ stack-фраза (кластер из 3) |
| S7 | `cluster_anchor` | pre_event | ⏳ anchorStack-фраза |
| S2 | `reset` | none | GREEN — «Volatility Window Closed» |
| S8 | `single` | during_event | 🔴 high-фраза |
| S4 | `anchor` | during_event | 🔴 anchor-фраза, CPI m/m |
| S9 | `multiple` | during_event | 🔴 stack-фраза (кластер) |
| S10 | `cluster_anchor` | during_event | 🔴 anchorStack-фраза, FOMC |

---

## Чеклист ручной проверки в Telegram

После запуска проверьте в основном канале:

- [ ] Нет запрещённых слов: `рекомендуем`, `будьте`, `следите`, `критический`, `экстремальный`, `паника`, `режим`, `уровень`, `контроль`
- [ ] Нет внутренних технических терминов: `anchor_high`, `impact_type`, `anchor_label`, `is_anchor`, `high-событие`
- [ ] Эмодзи корректны: ⏳ для pre_event, 🔴 для during_event, ⚡ для anchor-событий, 📈 для digest
- [ ] Склонения корректны (1 событие / 2 события / 5 событий)
- [ ] Anchor-события упомянуты по названию в тексте
- [ ] Сообщения идут по порядку (Weekly Ahead → Weekly End → Daily Digest → Volatility)
- [ ] Строк в сообщении не более 15 (для digest) / 9 (для weekly)

---

## Диагностика ошибок

| Код | Причина | Решение |
|-----|---------|---------|
| HTTP 503 | `TELEGRAM_CHAT_ID` не задан в bridge | Добавить в `.env` bridge и перезапустить |
| HTTP 500 | Ошибка отправки в Telegram | Проверить `TELEGRAM_BOT_TOKEN`, бот в канале |
| exitCode 1 | Один из дочерних скриптов упал | Посмотреть логи выше ошибки |
| Bridge не доступен | Bridge не запущен | Запустить `npm run bridge` |
