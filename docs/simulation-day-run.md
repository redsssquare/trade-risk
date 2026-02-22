# Запуск симуляции дня (сообщения в Telegram сегодня)

## 1. Включить симуляцию в .env

В корне проекта в `.env` добавь (или раскомментируй):

```bash
SIMULATION_DAY_FILE=/app/data/simulated_day.json
SIMULATION_SPEED=6
```

- **SIMULATION_SPEED=6** — 1 реальная минута = 6 виртуальных. За ~8 реальных часов проиграется ~48 виртуальных часов (два виртуальных дня).
- События берутся из `data/simulated_day.json` (несколько High-событий, в т.ч. anchor_high и overlapping).

## 2. Запустить контейнеры

```bash
docker compose up -d
```

Или перезапуск, если уже запущены:

```bash
docker compose restart
```

## 3. Workflow в n8n

1. Открой n8n: http://localhost:5678
2. Импортируй workflow, если ещё не импортирован: **Workflows → Import from File** → выбери `n8n-volatility-window-workflow.json`
3. Открой workflow **"Volatility Window"**
4. Включи его: переключатель **Active** в положение ON (workflow будет срабатывать по крону каждую минуту)

После этого каждую минуту workflow считает виртуальное время, проверяет фазы (pre_event, during_event, post_event) и при смене состояния/фазы шлёт событие в bridge → в Telegram.

## 4. Что будет в симуляции

В `data/simulated_day.json` заданы 12 High-событий с 01:00 до 03:00 следующего виртуального дня:

- Обычные High (UK GDP, Retail Sales, Unemployment Claims, German CPI и т.д.)
- **Anchor high** (по alias): CPI (US), Non-Farm Payrolls, FOMC Rate Decision, Powell Speech, Interest Rate Decision, Fed rate speech
- **Overlapping**: FOMC Rate Decision 15:00 + Powell Speech 15:30 (окно 30 мин)

Ты увидишь в Telegram смену фаз и состояний (RED/GREEN, pre_event → during_event → post_event, contextual anchor, overlapping) без привязки к реальному календарю.

## 5. Если сообщения не приходят (n8n не читает файл)

В n8n Code node иногда недоступен `require('fs')`, тогда загрузка по `SIMULATION_DAY_FILE` падает с ошибкой.

**Что сделать:** передать JSON событиями через переменную окружения.

1. В корне проекта выполни (одной строкой в одну строку выведется JSON):
   ```bash
   node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync('data/simulated_day.json','utf8')); console.log(JSON.stringify(j));"
   ```
2. Скопируй вывод (одна длинная строка).
3. В `.env` закомментируй `SIMULATION_DAY_FILE` и добавь (вставь скопированную строку вместо `...`):
   ```
   SIMULATION_DAY_JSON={"start_time":"...","events":[...]}
   ```
4. В `docker-compose.yml` для n8n уже есть `SIMULATION_DAY_JSON=${SIMULATION_DAY_JSON:-}`.
5. Перезапусти контейнеры: `docker compose restart`.

Workflow сначала пробует `SIMULATION_DAY_JSON`; если не задан — читает файл по `SIMULATION_DAY_FILE`.

**Проверка:** в n8n открой workflow → вкладка **Executions** — смотри последние запуски. Если в ошибке есть `simulation_day_load:` или `file_read:`, переходи на `SIMULATION_DAY_JSON` как выше.

## 6. Выключить симуляцию

В `.env` закомментируй или удали строки:

```bash
# SIMULATION_DAY_FILE=/app/data/simulated_day.json
# SIMULATION_SPEED=6
```

Затем:

```bash
docker compose restart
```

После перезапуска n8n снова будет использовать реальный календарь (Forex API). Если использовался `SIMULATION_DAY_JSON`, закомментируй и его.
