# Trade System MVP Runbook

Этот документ обязан прочитать каждый новый агент перед работой.

**История изменений:** [docs/CHANGELOG.md](docs/CHANGELOG.md)
Цель: развивать функционал поэтапно, без поломки текущего рабочего контура.

## 0) Текущий этап

- Этап 0: завершён.
- Этап 1: завершён.
- Этап 2: в работе.
- Следующий этап: Этап 2.5 (декомпозиция `Compute Volatility State` на подмодули без изменения поведения).

## 1) Текущий рабочий контур

Пайплайн:
1. `Cron` в n8n (каждую минуту)
2. `Fetch Calendar` -> `GET http://bridge:3000/calendar-feed`
3. `Compute Volatility State` (фазы/состояния)
4. `Send to Bridge` -> `POST http://bridge:3000/hooks/event`
5. Bridge -> OpenClaw -> Telegram

Ключевые файлы:
- `n8n-volatility-window-workflow.json` (единственный workflow-файл)
- `services/bridge/server.js`
- `data/simulated_day.json`
- `docker-compose.yml`
- `.env`

## 2) Единый источник workflow

- Каноничный workflow: `n8n-volatility-window-workflow.json`
- Не создавать дубликаты workflow JSON для того же потока.
- Скрипты деплоя:
  - `scripts/push-volatility-workflow.js`
  - `scripts/activate-volatility-workflow.js`
  - `scripts/deploy-smoke-volatility-workflow.js` (one-click: push + авто-smoke по ближайшему execution)
- **MCP для n8n:** чтобы агенты могли управлять/читать workflow через MCP — [настройка в docs/mcp-n8n-setup.md](docs/mcp-n8n-setup.md).

## 3) Текущие бизнес-правила MVP

- Фазы:
  - `pre_event`: 20 минут до события (не раньше)
  - `during_event`: 5 минут
  - `post_event`: 15 минут
- Отправка в Telegram: только при смене состояния/фазы (плюс bootstrap при первом прогоне, если включен в workflow staticData).
- Тестовый фид:
  - `CALENDAR_TEST_MODE=true` -> bridge читает `data/simulated_day.json`.
- **Bridge internal cron:** `BRIDGE_CRON_INTERVAL_MS=30000` (по умолчанию) — Bridge сам проверяет каждые 30 с. Для production с полными окнами можно `BRIDGE_CRON_INTERVAL_MS=60000`. `BRIDGE_CRON_INTERVAL_MS=0` — отключить (только n8n).

## 4) Жесткие правила для агентов

0. **Этап «Контракт» (текущий):** Разрешено менять только документацию (`README.md`, `docs/MVP-CONTRACT.md`). Запрещено трогать runtime-код.
1. Менять только один слой за итерацию.
2. Не смешивать фичи и cleanup в одном шаге.
3. Не менять payload-контракт без явной задачи на это.
4. После каждого изменения сделать smoke-проверку и остановиться.
5. В отчете всегда указывать:
   - какие файлы изменены,
   - что проверено,
   - почему baseline не сломан.

## 5) Контракт модулей (MVP Contract)

**Полная спецификация:** [docs/MVP-CONTRACT.md](docs/MVP-CONTRACT.md)

Кратко:
- **Вход Feed:** `items[]` с полями `title`, `date`, `impact` (Compute фильтрует по `impact === "High"`).
- **Выход Compute / вход Bridge:** `event_type`, `state`, `phase`, `timestamp`, `context`.

## 6) Что нельзя ломать (и нельзя менять без согласования)

- Структуру переходов `Cron -> Fetch -> Compute -> Send`.
- Поля payload для bridge:
  - `event_type`, `state`, `phase`, `timestamp`, `context`
- **Замороженные поля (см. docs/MVP-CONTRACT.md §4):**
  - Feed: `items[].title`, `items[].date`, `items[].impact`
  - Bridge input: `event_type`, `state`, `phase`, `timestamp`, `context.event_name`/`event_title`, `context.event_time`
- Механику активации workflow через скрипты.

## 7) Минимальная проверка после каждого шага

**Контракт:** `npm run test:volatility:docker` (или `npm run test:volatility` при Node 14+) — прогон Compute по [docs/volatility_test_cases.md](docs/volatility_test_cases.md). Ручная проверка: [docs/MVP-CONTRACT.md](docs/MVP-CONTRACT.md) §5 (test JSON → Compute → Bridge → telegram_text).

1. Workflow активен в n8n.
2. Последние execution успешны.
3. На переходе фазы `Compute` возвращает item (не пусто).
4. `Send to Bridge` отработал `ok`.
5. Сообщение пришло в Telegram.

## 8) Формат задачи для нового агента (копировать в чат)

Используй шаблон:
1. Сделай только Этап X из плана.
2. Не трогай другие этапы и соседние модули.
3. Покажи список измененных файлов.
4. Покажи проверку (n8n execution + Telegram).
5. Остановись после выполнения этапа.

## 9) Выбор модели (стоимость/сложность)

- По умолчанию: более дешевый агент для рутинных шагов.
- Для логики cluster/anchor и нетривиальных багов: более сильный агент.
- Тяжелую модель использовать точечно, только когда cheaper-model застрял.

## 10) Контроль перед переходом к следующему этапу

1. Есть краткий отчёт: `что изменено`, `что проверено`, `что осталось`.
2. Есть подтверждение в n8n execution (скрин/лог/ID execution).
3. Есть подтверждение в Telegram (если этап затрагивает отправку).
4. Изменения локальны и не затрагивают соседние этапы.
