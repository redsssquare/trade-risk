# Volatility Window Test Cases

Контракт форматов: [MVP-CONTRACT.md](MVP-CONTRACT.md)

Ниже матрица для ручной проверки логики `volatility_window` в n8n.
Все времена в UTC.

## Сценарий 1: Один обычный High (pre -> during -> post -> green)

Окна: pre 7 мин, during 4 мин, post 5 мин (event+4..event+9).

| now | events (name, time, impact) | expected primary_event | expected phase | expected impact_type | contextual_anchor | contextual_anchor_names |
|---|---|---|---|---|---|---|
| 2026-03-03T11:55:00Z | US Retail Sales, 2026-03-03T12:00:00Z, High | US Retail Sales @ 12:00 | pre_event | high | false | [] |
| 2026-03-03T12:01:00Z | US Retail Sales, 2026-03-03T12:00:00Z, High | US Retail Sales @ 12:00 | during_event | high | false | [] |
| 2026-03-03T12:05:00Z | US Retail Sales, 2026-03-03T12:00:00Z, High | US Retail Sales @ 12:00 | post_event | high | false | [] |
| 2026-03-03T12:10:00Z | US Retail Sales, 2026-03-03T12:00:00Z, High | null | none (GREEN) | null | false | [] |

## Сценарий 2: Один anchor_high (pre -> during -> post)

| now | events (name, time, impact) | expected primary_event | expected phase | expected impact_type | contextual_anchor | contextual_anchor_names |
|---|---|---|---|---|---|---|
| 2026-03-03T13:55:00Z | FOMC Rate Decision, 2026-03-03T14:00:00Z, High | FOMC Rate Decision @ 14:00 | pre_event | anchor_high | false | [] |
| 2026-03-03T14:02:00Z | FOMC Rate Decision, 2026-03-03T14:00:00Z, High | FOMC Rate Decision @ 14:00 | during_event | anchor_high | false | [] |
| 2026-03-03T14:06:00Z | FOMC Rate Decision, 2026-03-03T14:00:00Z, High | FOMC Rate Decision @ 14:00 | post_event | anchor_high | false | [] |

## Сценарий 3: High + anchor внутри одного окна

CPI в 10:12 — в одном окне с UK GDP (10:03–10:15).

| now | events (name, time, impact) | expected primary_event | expected phase | expected impact_type | contextual_anchor | contextual_anchor_names |
|---|---|---|---|---|---|---|
| 2026-03-03T10:05:00Z | UK GDP q/q, 2026-03-03T10:10:00Z, High; CPI y/y, 2026-03-03T10:12:00Z, High | UK GDP q/q @ 10:10 | pre_event | high | true | ["CPI y/y"] |
| 2026-03-03T10:12:00Z | UK GDP q/q, 2026-03-03T10:10:00Z, High; CPI y/y, 2026-03-03T10:12:00Z, High | CPI y/y @ 10:12 | during_event | anchor_high | false | [] |

## Сценарий 4: Два High подряд без anchor

| now | events (name, time, impact) | expected primary_event | expected phase | expected impact_type | contextual_anchor | contextual_anchor_names |
|---|---|---|---|---|---|---|
| 2026-03-03T09:25:00Z | German Ifo, 2026-03-03T09:30:00Z, High; Eurozone PMI, 2026-03-03T09:50:00Z, High | German Ifo @ 09:30 | pre_event | high | false | [] |
| 2026-03-03T09:44:00Z | German Ifo, 2026-03-03T09:30:00Z, High; Eurozone PMI, 2026-03-03T09:50:00Z, High | Eurozone PMI @ 09:50 | pre_event | high | false | [] |

## Сценарий 5: Anchor через 20 минут после обычного High

| now | events (name, time, impact) | expected primary_event | expected phase | expected impact_type | contextual_anchor | contextual_anchor_names |
|---|---|---|---|---|---|---|
| 2026-03-03T14:58:00Z | US ISM Services, 2026-03-03T15:00:00Z, High; FOMC Minutes, 2026-03-03T15:20:00Z, High | US ISM Services @ 15:00 | pre_event | high | false | [] |
| 2026-03-03T15:14:00Z | US ISM Services, 2026-03-03T15:00:00Z, High; FOMC Minutes, 2026-03-03T15:20:00Z, High | FOMC Minutes @ 15:20 | pre_event | anchor_high | false | [] |

## Сценарий 6: Событие уже прошло (post -> green)

| now | events (name, time, impact) | expected primary_event | expected phase | expected impact_type | contextual_anchor | contextual_anchor_names |
|---|---|---|---|---|---|---|
| 2026-03-03T08:05:00Z | CAD Employment Change, 2026-03-03T08:00:00Z, High | CAD Employment Change @ 08:00 | post_event | high | false | [] |
| 2026-03-03T08:10:00Z | CAD Employment Change, 2026-03-03T08:00:00Z, High | null | none (GREEN) | null | false | [] |

## Manual Test Checklist

Цель: любой сценарий из таблицы выше прогоняется вручную за 2-3 минуты.

### Общая подготовка (один раз)

1. Откройте workflow `Volatility Window` в n8n.
2. Временно замените внутри Code node:
   - `const nowMs = Date.now();`
   - на `const nowMs = Date.parse('<TEST_NOW_ISO>');`
3. Временно замените fetch-блок на локальный тестовый массив:
   - `const payload = <TEST_EVENTS_JSON>;`
4. После проверки верните исходный код (`Date.now()` и `fetch`).

### Шаблон events JSON для ручной подстановки

Используйте этот формат в Code node или Set node:

```json
[
  {
    "title": "Event Name",
    "date": "2026-03-03T12:00:00Z",
    "impact": "High",
    "currency": "USD"
  }
]
```

### Сценарий 1: Один обычный High (pre -> during -> post -> green)

1. **Как задать now вручную:** поочередно подставьте `2026-03-03T11:55:00Z`, `2026-03-03T12:01:00Z`, `2026-03-03T12:05:00Z`, `2026-03-03T12:10:00Z`.
2. **Как подставить events JSON:** `[{"title":"US Retail Sales","date":"2026-03-03T12:00:00Z","impact":"High","currency":"USD"}]`.
3. **Какие поля должны попасть в bridge:** `state`, `phase`, `context.event_name`, `context.event_time`, `context.impact_type`, `context.contextual_anchor`, `context.contextual_anchor_names`.
4. **Какие логи проверить:** `workflow: volatility-state` и `bridge:event`.
5. **Успех:** фазы идут `pre_event -> during_event -> post_event -> none`, `impact_type=high`, `contextual_anchor=false`.
6. **Ошибка:** фаза не совпадает с ожиданием, `GREEN` в окне, лишний `anchor_high`, некорректный `llm_called`.

### Сценарий 2: Один anchor_high (pre -> during -> post)

1. **Как задать now вручную:** `2026-03-03T13:55:00Z`, `2026-03-03T14:02:00Z`, `2026-03-03T14:06:00Z`.
2. **Как подставить events JSON:** `[{"title":"FOMC Rate Decision","date":"2026-03-03T14:00:00Z","impact":"High","currency":"USD"}]`.
3. **Какие поля должны попасть в bridge:** те же, плюс `context.impact_type=anchor_high`.
4. **Какие логи проверить:** `primary_event`, `impact_type`, `contextual_anchor`, `contextual_anchor_names`.
5. **Успех:** `primary_event=FOMC Rate Decision`, `impact_type=anchor_high`, `contextual_anchor=false`, фазы корректны.
6. **Ошибка:** `impact_type=high` или `contextual_anchor=true` при anchor primary.

### Сценарий 3: High + anchor внутри одного окна

1. **Как задать now вручную:** `2026-03-03T10:05:00Z`, затем `2026-03-03T10:12:00Z`.
2. **Как подставить events JSON:** `[{"title":"UK GDP q/q","date":"2026-03-03T10:10:00Z","impact":"High","currency":"GBP"},{"title":"CPI y/y","date":"2026-03-03T10:12:00Z","impact":"High","currency":"USD"}]`.
3. **Какие поля должны попасть в bridge:** `primary_event`, `contextual_anchor`, `contextual_anchor_names`, `impact_type`.
4. **Какие логи проверить:** что `primary_event` переключается на ближайшее событие во втором запуске.
5. **Успех:** в `10:05` primary=`UK GDP`, `impact_type=high`, `contextual_anchor=true`, `contextual_anchor_names=["CPI y/y"]`; в `10:12` primary=`CPI y/y`, `impact_type=anchor_high`, `contextual_anchor=false`.
6. **Ошибка:** anchor не учитывается в окне, либо не происходит переключение primary на более близкое.

### Сценарий 4: Два High подряд без anchor

1. **Как задать now вручную:** `2026-03-03T09:25:00Z`, затем `2026-03-03T09:44:00Z`.
2. **Как подставить events JSON:** `[{"title":"German Ifo","date":"2026-03-03T09:30:00Z","impact":"High","currency":"EUR"},{"title":"Eurozone PMI","date":"2026-03-03T09:50:00Z","impact":"High","currency":"EUR"}]`.
3. **Какие поля должны попасть в bridge:** `primary_event`, `phase`, `impact_type`, `contextual_anchor`.
4. **Какие логи проверить:** смену `primary_event` и `transition_type`.
5. **Успех:** primary меняется с `German Ifo` на `Eurozone PMI`, `impact_type=high`, `contextual_anchor=false`.
6. **Ошибка:** остаётся старый primary или выставляется anchor логика без anchor событий.

### Сценарий 5: Anchor через 20 минут после обычного High

1. **Как задать now вручную:** `2026-03-03T14:58:00Z`, затем `2026-03-03T15:14:00Z`.
2. **Как подставить events JSON:** `[{"title":"US ISM Services","date":"2026-03-03T15:00:00Z","impact":"High","currency":"USD"},{"title":"FOMC Minutes","date":"2026-03-03T15:20:00Z","impact":"High","currency":"USD"}]`.
3. **Какие поля должны попасть в bridge:** `primary_event`, `impact_type`, `contextual_anchor`, `contextual_anchor_names`.
4. **Какие логи проверить:** сначала обычный high, затем переключение на anchor primary.
5. **Успех:** в `14:58` primary=`US ISM Services`, `impact_type=high`, `contextual_anchor=false`; в `15:14` primary=`FOMC Minutes`, `impact_type=anchor_high`, `contextual_anchor=false`.
6. **Ошибка:** anchor не становится primary при приближении, или появляется неверный contextual anchor.

### Сценарий 6: Событие уже прошло (post -> green)

1. **Как задать now вручную:** `2026-03-03T08:05:00Z`, затем `2026-03-03T08:10:00Z`.
2. **Как подставить events JSON:** `[{"title":"CAD Employment Change","date":"2026-03-03T08:00:00Z","impact":"High","currency":"CAD"}]`.
3. **Какие поля должны попасть в bridge:** в `08:05` ожидается полный контекст, в `08:10` — `state=GREEN`, `phase=none`, `context=null`.
4. **Какие логи проверить:** `transition_type`, `llm_called`, а также отсутствие active контекста на GREEN.
5. **Успех:** `post_event -> none(GREEN)` без лишних intermediate состояний.
6. **Ошибка:** остаётся `RED` после `event_time+5m` (post окно), или отправляется контекст для GREEN.

## Что проверять в логах bridge:event

Проверяйте эти поля на каждом прогоне:

- `now` (в текущей реализации это `cron_tick_timestamp`)
- `primary_event`
- `phase`
- `impact_type`
- `contextual_anchor`
- `contextual_anchor_names`
- `previous_phase`
- `transition_type`
- `llm_called`

Минимальные критерии корректности:

- `primary_event` соответствует сценарию и меняется только когда появляется более близкое событие.
- `phase` строго соответствует временным границам.
- `transition_type`:
  - `state_change` при переходе `GREEN <-> RED`,
  - `phase_change` при смене фазы внутри `RED`,
  - `none` если изменений нет.
- `llm_called=true` только при `state_change` или `phase_change`; иначе `false`.
- `contextual_anchor_names` непустой только когда `contextual_anchor=true`.

