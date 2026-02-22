# Тестовый сценарий: 4 часа, 6 блоков

**Файл данных:** `data/simulated_day.json`  
**Дата:** 2026-02-22 (воскресенье)  
**Период:** 17:20 – 21:20 по Ташкенту (12:20 – 16:20 UTC)  
**Всего событий:** 23  
**Инструменты:** USD, GBP, EUR, CAD  

**Параметры алгоритма:**  
- pre\_event: 7 мин до начала кластера  
- during\_event: 4 мин от конца кластера  
- post\_event: 5 мин после during  
- cluster\_window: 5 мин между соседними событиями  

---

## Структура по блокам

### Блок 1 — Одиночное событие (single)

| Время UTC | Ташкент | Событие | Тип |
|-----------|---------|---------|-----|
| 12:35 | 17:35 | ADP Non-Farm Employment Change | single, High |

**Кластер:** start=12:35, end=12:35, size=1  
**Фазы:**

| Фаза | UTC | Ташкент |
|------|-----|---------|
| GREEN → RED (pre) | 12:28 | 17:28 |
| pre → during | 12:35 | 17:35 |
| during → post | 12:39 | 17:39 |
| post → GREEN | 12:44 | 17:44 |

**Что проверяем:** корректная смена фаз для одиночного события.

---

### Блок 2 — Пачка событий (batch cluster)

| Время UTC | Ташкент | Событие | Тип |
|-----------|---------|---------|-----|
| 13:05 | 18:05 | GBP Retail Sales m/m | batch[1/3], High |
| 13:07 | 18:07 | GBP Trade Balance | batch[2/3], High |
| 13:09 | 18:09 | GBP Industrial Production m/m | batch[3/3], High |

**Кластер:** start=13:05, end=13:09, size=3 (интервал 2 мин ≤ 5 мин → объединяются)  
**Фазы:**

| Фаза | UTC | Ташкент |
|------|-----|---------|
| GREEN → RED (pre) | 12:58 | 17:58 |
| pre → during | 13:05 | 18:05 |
| during → post | 13:13 | 18:13 |
| post → GREEN | 13:18 | 18:18 |

**Что проверяем:** cluster\_size=3, cluster\_events содержит все три события, primary\_event — ближайшее к now.

---

### Блок 3 — Якорное событие (anchor) + зависимые

| Время UTC | Ташкент | Событие | Тип |
|-----------|---------|---------|-----|
| 13:50 | 18:50 | FOMC Rate Decision | **anchor\_high** |
| 13:52 | 18:52 | USD ISM Manufacturing PMI | high |
| 13:53 | 18:53 | USD Unemployment Claims | high |

**Кластер:** start=13:50, end=13:53, size=3  
**Anchor:** impact\_type=anchor\_high, anchor\_label="FOMC Rate Decision", cluster\_has\_anchor=true  
**Фазы:**

| Фаза | UTC | Ташкент |
|------|-----|---------|
| GREEN → RED (pre) | 13:43 | 18:43 |
| pre → during | 13:50 | 18:50 |
| during → post | 13:57 | 18:57 |
| post → GREEN | 14:02 | 19:02 |

**Что проверяем:**
- impact\_type=anchor\_high когда FOMC primary
- contextual\_anchor=true для зависимых событий когда они primary
- cluster\_has\_anchor=true весь кластер

---

### Блок 4 — Разреженный поток (sparse singles)

| Время UTC | Ташкент | Событие | Тип |
|-----------|---------|---------|-----|
| 14:20 | 19:20 | EUR Retail Sales m/m | single, High |
| 14:50 | 19:50 | CAD Trade Balance | single, High |

**Интервал между событиями:** 30 мин → отдельные кластеры, size=1 каждый  
**Фазы EUR Retail Sales:**

| Фаза | UTC | Ташкент |
|------|-----|---------|
| pre | 14:13 | 19:13 |
| during | 14:20 | 19:20 |
| post → GREEN | 14:29 | 19:29 |

**Фазы CAD Trade Balance:**

| Фаза | UTC | Ташкент |
|------|-----|---------|
| pre | 14:43 | 19:43 |
| during | 14:50 | 19:50 |
| post → GREEN | 14:59 | 19:59 |

**Что проверяем:** разные инструменты (EUR, CAD), каждый обрабатывается независимо.

---

### Блок 5 — Высокая плотность (stress)

| Время UTC | Ташкент | Событие | Тип |
|-----------|---------|---------|-----|
| 15:10 | 20:10 | USD Core CPI m/m | high |
| 15:11 | 20:11 | EUR GDP q/q | high |
| 15:12 | 20:12 | USD Factory Orders m/m | high |
| 15:12 | 20:12 | GBP Construction PMI | high |
| 15:13 | 20:13 | USD ADP Employment Change | high |
| 15:14 | 20:14 | CAD Building Permits m/m | high |
| 15:15 | 20:15 | USD ISM Services PMI | high |
| 15:17 | 20:17 | USD Consumer Credit m/m | high |

**Кластер:** start=15:10, end=15:17, size=8  
Все события в одном кластере (каждое ≤5 мин от предыдущего).  
**Инструменты в кластере:** USD, EUR, GBP, CAD  
**Фазы:**

| Фаза | UTC | Ташкент |
|------|-----|---------|
| GREEN → RED (pre) | 15:03 | 20:03 |
| pre → during | 15:10 | 20:10 |
| during → post | 15:21 | 20:21 |
| post → GREEN | 15:26 | 20:26 |

**Что проверяем:** cluster\_size=8, устойчивость при максимальной плотности, primary\_event меняется по мере прохождения времени.

> **Примечание:** "USD Core CPI m/m" соответствует алиасу `cpi m/m` из anchor\_events.json → детектируется как `anchor_high` (US CPI). Это означает: в pre-фазе блока 5 primary=CPI (anchor), а во время during CPI уходит дальше по времени → primary переключается на другие события → contextual\_anchor=true. Это дополнительно покрывает поведение contextual anchor в высокоплотном потоке.

---

### Блок 6 — Смешанный режим (mixed)

#### 6A — Anchor + batch (EUR)

| Время UTC | Ташкент | Событие | Тип |
|-----------|---------|---------|-----|
| 15:40 | 20:40 | ECB Rate Decision | **anchor\_high** |
| 15:42 | 20:42 | EUR Trade Balance | high |

**Кластер A:** start=15:40, end=15:42, size=2  
Фазы: pre 15:33 → during 15:40 → post 15:51 → GREEN 15:51

#### 6B — Одиночное (CAD)

| Время UTC | Ташкент | Событие | Тип |
|-----------|---------|---------|-----|
| 15:52 | 20:52 | CAD Employment Change | single, high |

**Кластер B:** start=15:52, size=1  
10 мин от конца кластера A → новый кластер  
Фазы: pre 15:45 → during 15:52 → post 16:01 → GREEN 16:01

#### 6C — Двойной anchor + batch (USD)

| Время UTC | Ташкент | Событие | Тип |
|-----------|---------|---------|-----|
| 16:00 | 21:00 | Non-Farm Payrolls | **anchor\_high** (NFP) |
| 16:01 | 21:01 | USD Average Hourly Earnings m/m | high |
| 16:03 | 21:03 | Powell Speech | **anchor\_high** |

**Кластер C:** start=16:00, end=16:03, size=3  
**cluster\_anchor\_names:** ["Non-Farm Payrolls", "Powell Speech"] (2 anchor в одном кластере)  
Фазы: pre 15:53 → during 16:00 → post 16:12 → GREEN 16:12

**Переходная зона 6B → 6C:**  
- 15:53 UTC: CAD в post, NFP входит в pre — алгоритм выбирает ближайший кластер
- ~15:56 UTC: NFP становится ближе → primary переключается на кластер C

**Что проверяем:**
- Корректный переход между перекрывающимися фазами
- cluster\_anchor\_names с двумя якорями
- Перемешанный порядок single/batch/anchor

---

## Полная хронология (UTC → Ташкент)

```
12:20 (17:20)  Start — GREEN
12:28 (17:28)  [B1] RED pre_event — ADP Non-Farm
12:35 (17:35)  [B1] RED during_event
12:39 (17:39)  [B1] RED post_event
12:44 (17:44)  GREEN

12:58 (17:58)  [B2] RED pre_event — GBP cluster (size=3)
13:05 (18:05)  [B2] RED during_event
13:09 (18:09)       last event in cluster
13:13 (18:13)  [B2] RED post_event
13:18 (18:18)  GREEN

13:43 (18:43)  [B3] RED pre_event — FOMC Rate Decision (anchor)
13:50 (18:50)  [B3] RED during_event
13:53 (18:53)       last dependent event
13:57 (18:57)  [B3] RED post_event
14:02 (19:02)  GREEN

14:13 (19:13)  [B4a] RED pre_event — EUR Retail Sales
14:20 (19:20)  [B4a] RED during_event
14:24 (19:24)  [B4a] RED post_event
14:29 (19:29)  GREEN

14:43 (19:43)  [B4b] RED pre_event — CAD Trade Balance
14:50 (19:50)  [B4b] RED during_event
14:54 (19:54)  [B4b] RED post_event
14:59 (19:59)  GREEN

15:03 (20:03)  [B5] RED pre_event — HIGH DENSITY (size=8, USD/EUR/GBP/CAD)
15:10 (20:10)  [B5] RED during_event
15:17 (20:17)       last event in cluster
15:21 (20:21)  [B5] RED post_event
15:26 (20:26)  GREEN

15:33 (20:33)  [B6A] RED pre_event — ECB Rate Decision (anchor, size=2)
15:40 (20:40)  [B6A] RED during_event
15:42 (20:42)       EUR Trade Balance
15:46 (20:46)  [B6A] RED post_event
15:51 (20:51)  GREEN

15:45 (20:45)  [B6B] pre starts (overlaps B6A post) — CAD Employment Change
15:52 (20:52)  [B6B] RED during_event
15:56 (20:56)  [B6B] RED post_event
16:01 (21:01)  GREEN

15:53 (20:53)  [B6C] pre starts (overlaps B6B post) — NFP + Powell Speech (2 anchors, size=3)
16:00 (21:00)  [B6C] RED during_event
16:03 (21:03)       last event
16:07 (21:07)  [B6C] RED post_event
16:12 (21:12)  GREEN  ← End of scenario
```

---

## Покрытые кейсы

| Кейс | Блок |
|------|------|
| Сортировка событий по времени | Все |
| Одиночное событие (single) | 1, 4a, 4b, 6B |
| Batch-кластер (3 события) | 2 |
| Anchor событие как primary | 3 (FOMC), 6A (ECB), 6C (NFP) |
| Anchor как contextual (не primary) | 3 (когда now > FOMC, зависимые — primary) |
| Высокая плотность (8 событий, 7 мин) | 5 |
| Два anchor в одном кластере | 6C (NFP + Powell Speech) |
| Разные инструменты (USD/EUR/GBP/CAD) | 1–6 |
| Перекрывающиеся фазы между кластерами | 6B → 6C |
| Переключение primary\_event внутри кластера | 5, 6C |
| Отсутствие GREEN-пропусков между блоками | Все |

---

## Запуск теста

```bash
# Убедиться что CALENDAR_TEST_MODE=true в .env или переменных окружения
# Данные уже записаны в data/simulated_day.json

# Проверить содержимое
cat data/simulated_day.json | jq '.events | length'
# Ожидаемый результат: 23

# Деплой и smoke-тест
node scripts/deploy-smoke-volatility-workflow.js
```
