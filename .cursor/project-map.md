Project: Trade Volatility Notification System

Entry Point:
services/bridge/server.js

Core Logic:
lib/volatility-compute.js
lib/anchor-event-classifier.js

Rendering:
services/bridge/render/telegram-render.js

State:
bridge-state/notification_state.json

Data:
data/

Workflows:
workflows/
n8n-volatility-window-workflow.json

Important:
server.js содержит часть бизнес-логики (фильтрация, payload, LLM). Внутренние таймеры Bridge отключены.
Основной таймер/расписание запуска хранится в n8n workflow — Bridge вызывается извне как вычислительный модуль.
Daily workflow должен переиспользовать существующую логику, а не дублировать её.
