# Trade System Workflow Guide

This repository uses a single source workflow file for n8n volatility logic.

## Canonical workflow file
- `n8n-volatility-window-workflow.json` — the only workflow file to edit, review, and push.

## How workflow is deployed
- `scripts/push-volatility-workflow.js` updates the active n8n workflow from `n8n-volatility-window-workflow.json`.
- `scripts/activate-volatility-workflow.js` activates the same workflow in n8n.

## Agent rules
- Do not create alternate workflow JSON files for the same flow.
- Do not edit archived/legacy copies (none should exist now).
- Keep changes focused and verify in n8n executions and Telegram before moving to next step.
