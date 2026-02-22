# Stage 6: Pre-Merge Regression Checklist

Цель: быстрый регрессионный контроль между чатами агентов перед merge.

## 1) Обязательный авто-прогон (2-3 минуты)

Запустить из корня проекта:

```bash
npm run test:volatility:docker
npm run test:anchor-classifier
npm run test:render
npm run test:stage6
```

Ожидаемый результат:

- Все команды завершаются с exit code `0`.
- В `test:stage6` каждый шаг каждого сценария = `PASS`.
- В `test:stage6` summary: `steps_failed: 0`.

## 2) Что покрывают Stage 6 JSON-фактуры

Фикстуры расположены в `docs/fixtures/stage6/`:

- `single_event.json` — одиночный High + duplicate шаг внутри той же фазы.
- `batch_cluster.json` — пачка (кластер) High-событий.
- `anchor_primary.json` — одиночный anchor primary.
- `overlapping_anchor_in_cluster.json` — overlap: обычный High + anchor в том же кластере.

Каждый шаг содержит expected:

- `state`
- `phase`
- `event_name`
- `send`

Правило `send/no-send`:

- `send=true` на первом шаге сценария.
- Далее `send=true`, только если изменился `state` или `phase` относительно предыдущего шага.
- Если `state` и `phase` не изменились, ожидается `send=false`.

## 3) Manual smoke (по необходимости, 5-10 минут)

Если правка затронула интеграцию n8n/Bridge/Telegram, дополнительно сделать ручной smoke:

1. Прогнать базовый контур по `docs/stage1-test-run.md`.
2. Проверить, что в n8n execution совпадают `state`, `phase`, `context.event_name`.
3. Проверить в логах bridge (`[bridge:event]`), что `transition_type` соответствует переходу.
4. Убедиться, что нет лишней отправки при duplicate `state/phase` (должен быть skip/no-send).

Дополнительно можно использовать:

```bash
npm run deploy:volatility:smoke
```

## 4) Формат отчёта агента (обязателен)

После любой правки перед merge агент публикует отчёт в таком формате:

### Изменённые файлы

- `<path1>`
- `<path2>`

### Запущенные проверки

- `<command>` -> `PASS/FAIL`
- `<command>` -> `PASS/FAIL`

### Stage 6: expected vs actual

Для каждого шага каждого сценария:

- `scenario=<id> step=<n> now=<iso>`
- `expected: state=<...> phase=<...> event_name=<...> send=<...>`
- `actual:   state=<...> phase=<...> event_name=<...> send=<...>`
- `diff: <none | перечисление расхождений>`

### Итог

- `result: PASS` если расхождений нет.
- `result: FAIL` если есть хотя бы одно расхождение, с перечислением проблемных шагов.
