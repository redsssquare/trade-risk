/**
 * Проверка payload для Weekly Ahead (POST /weekly-ahead).
 * Те же поля, что у weekly-digest, плюс опционально high_events_per_day (массив из 5 чисел).
 */

function isWeeklyAheadPayload(body) {
  if (!body || typeof body !== "object") return false;
  const base =
    typeof body.week_range === "string" &&
    Number.isFinite(Number(body.high_events)) &&
    Number.isFinite(Number(body.anchor_events)) &&
    Number.isFinite(Number(body.clusters)) &&
    Number.isFinite(Number(body.total_window_minutes)) &&
    Array.isArray(body.active_days) &&
    Number.isFinite(Number(body.quiet_days_count));
  if (!base) return false;
  if (body.high_events_per_day !== undefined) {
    if (!Array.isArray(body.high_events_per_day) || body.high_events_per_day.length !== 5) return false;
    if (!body.high_events_per_day.every((n) => Number.isFinite(Number(n)))) return false;
  }
  return true;
}

module.exports = { isWeeklyAheadPayload };
