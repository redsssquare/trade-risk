# MVP Module Contract

**Версия:** 1.0  
**Цель:** зафиксировать форматы данных между Feed → Compute → Bridge, чтобы агенты в разных чатах не расходились по структурам.

---

## Диаграмма потока

```
Cron (n8n, каждую минуту)
    ↓
GET /calendar-feed (Bridge)  ←── Вход Feed
    ↓
{ source, fetched_at, items[] }
    ↓
Compute Volatility State (n8n code node)
    ↓
{ event_type, state, phase, timestamp, context }  ←── Выход Compute = Вход Bridge
    ↓
POST /hooks/event (Bridge)
    ↓
OpenClaw → Telegram
```

---

## 1. Вход Feed (источник данных для Compute)

Feed — это результат `GET http://bridge:3000/calendar-feed`. Compute читает ответ.

### Формат ответа Feed

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| `source` | string | да | `"live"` \| `"cache"` \| `"stale_cache"` \| `"test_file"` \| `"fallback_synthetic"` |
| `fetched_at` | string | да | ISO8601 timestamp |
| `items` | array | да | Массив событий календаря |
| `warning` | string | нет | Сообщение об ошибке (если fallback) |

### Формат элемента `items[]`

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| `title` | string | да | Название события |
| `date` | string | да | ISO8601 timestamp |
| `impact` | string | да | `"High"` \| `"Medium"` \| `"Low"` — Compute учитывает только `"High"` |
| `country` | string | нет | Код валюты/страны (напр. `"USD"`) |
| `forecast` | string | нет | Прогноз (опционально) |
| `previous` | string | нет | Предыдущее значение (опционально) |

### Тестовый фид (`CALENDAR_TEST_MODE=true`)

Bridge читает `data/simulated_day.json`:

```json
{
  "start_time": "ISO8601",
  "events": [
    { "name": "string", "time": "ISO8601", "impact": "High" }
  ]
}
```

Маппинг в Feed: `name` → `title`, `time` → `date`, `impact` → `impact`, `country` = `"USD"`.

---

## 2. Выход Compute (и вход Bridge)

Compute (n8n code node или `lib/volatility-compute.js`) передаёт результат в Bridge через `POST /hooks/event` с JSON body.

### Тело запроса POST /hooks/event

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| `event_type` | string | да | `"volatility.state_changed"` \| `"volatility.tick"` |
| `state` | string | да | `"RED"` \| `"GREEN"` |
| `phase` | string | да | `"pre_event"` \| `"during_event"` \| `"post_event"` \| `"none"` |
| `timestamp` | string | да | ISO8601 timestamp |
| `context` | object \| null | да | Детали события; `null` когда `state === "GREEN"` |

### Формат `context` (когда `state === "RED"`)

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| `event_name` | string | да* | Название события (*или `event_title`) |
| `event_title` | string | нет | Альтернатива `event_name` |
| `event_time` | string | да | ISO8601 timestamp события |
| `minutes_to_event` | number | нет | Минуты до события (0 если в прошлом) |
| `impact` | string | нет | Обычно `"High"` |
| `phase` | string | нет | Фаза (дублирует верхний уровень) |
| `currency` | string | нет | Код валюты |
| `impact_type` | string | нет | `"anchor_high"` \| `"high"` — Bridge может вывести сам |
| `contextual_anchor` | boolean | нет | Есть anchor-события в окне, но не primary |
| `contextual_anchor_names` | string[] | нет | Список имён anchor-событий |
| `primary_event` | object | нет | `{ name, time }` — primary событие |

### Дополнительные поля (опционально, для логирования/simulation)

| Поле | Тип | Использование |
|------|-----|---------------|
| `simulation_start_real_time` | number | Логирование, simulation clock |
| `simulation_start_real_time_iso` | string | Логирование |
| `start_time` | string | Логирование |
| `real_elapsed_minutes` | number | Логирование |
| `effective_now` | string | Альтернативный `now` при simulation |
| `simulation_day_mode` | boolean | Режим simulation |
| `simulation_speed` | number | Скорость simulation |
| `simulated_now`, `real_now` | string | Логирование |

---

## 3. Временные окна (бизнес-правила)

| Фаза | Окно |
|------|------|
| `pre_event` | 7 минут до события |
| `during_event` | 4 минуты во время события |
| `post_event` | 5 минут после события (event+4min до event+9min) |
| `none` | Вне окон → `state === "GREEN"` |

> **Примечание:** Окна укорочены в 3× для быстрых тестов (~14 мин на цикл вместо ~40).

---

## 4. Поля «нельзя менять без согласования»

Изменение этих полей или типов ломает цепочку Feed → Compute → Bridge. Любое изменение требует отдельной задачи и согласования.

### Feed → Compute

| Путь | Тип | Заморожено |
|------|-----|------------|
| `items` | array | да |
| `items[].title` | string | да |
| `items[].date` | string (ISO8601) | да |
| `items[].impact` | string | да (значение `"High"` для фильтрации) |

### Compute → Bridge

| Путь | Тип | Заморожено |
|------|-----|------------|
| `event_type` | string | да |
| `state` | `"RED"` \| `"GREEN"` | да |
| `phase` | `"pre_event"` \| `"during_event"` \| `"post_event"` \| `"none"` | да |
| `timestamp` | string (ISO8601) | да |
| `context` | object \| null | да (структура) |
| `context.event_name` или `context.event_title` | string | да |
| `context.event_time` | string (ISO8601) | да |

### Bridge (внутреннее использование из context)

| Поле | Назначение |
|------|------------|
| `impact_type` | Шаблоны сообщений (anchor_high vs high) |
| `contextual_anchor`, `contextual_anchor_names` | Упоминание anchor-событий в LLM |
| `primary_event` | Резерв для генерации текста |

---

## 5. Воспроизведение потока без догадок

Любой агент должен суметь по этому документу:

1. **Смокать Feed:** `GET http://localhost:3000/calendar-feed` — получить `items[]` с `title`, `date`, `impact`.
2. **Смокать Compute:** вызвать `computeFromRawEvents(nowMs, items)` из `lib/volatility-compute.js` — получить `{ state, phase, primary_event, impact_type, contextual_anchor, contextual_anchor_names }`.
3. **Смокать Bridge:** сформировать body `{ event_type: "volatility.tick", state, phase, timestamp, context }` и вызвать `POST http://localhost:3000/hooks/event`.

### Минимальный тестовый payload для Bridge

```json
{
  "event_type": "volatility.tick",
  "state": "RED",
  "phase": "pre_event",
  "timestamp": "2026-02-22T12:00:00.000Z",
  "context": {
    "event_name": "Test Event",
    "event_time": "2026-02-22T12:20:00.000Z",
    "minutes_to_event": 20,
    "impact": "High"
  }
}
```

**Ожидаемый `telegram_text`** (при `generateMessageWithTemplate`, без LLM):

```
🔴 Volatility window active. Phase pre_event, 20m to event.
```

Для `impact_type: "anchor_high"` (например, event_name="FOMC Rate Decision"):

```
🔴 Volatility Window: FOMC Rate Decision. Activation phase pre_event, 15m to event.
```

Для `state: "GREEN"` и `context: null`:

```
🟢 Volatility Window Closed

No high-impact events active.
```

---

## 6. Связь с test-runner

Скрипт `scripts/run-volatility-tests.js` прогоняет Compute по кейсам из `docs/volatility_test_cases.md` и проверяет соответствие контракту (state, phase, impact_type, contextual_anchor). Формат событий в test cases: `name`→`title`, `time`→`date` для `computeFromRawEvents`.

Проверка контракта:

```bash
npm run test:volatility
```

Или через Docker (Node 14+ не требуется на хосте):

```bash
npm run test:volatility:docker
```

---

## Связанные документы

- [README.md](../README.md) — Runbook и правила для агентов
- [docs/stage1-test-run.md](stage1-test-run.md) — Инструкция по тестовому прогону
