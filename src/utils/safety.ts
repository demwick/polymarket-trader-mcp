import Database from "better-sqlite3";
import { getSafetyLimit } from "../tools/set-safety-limits.js";

interface SafetyCheck {
  amount: number;
  conditionId: string;
}

interface SafetyResult {
  pass: boolean;
  reason?: string;
}

export function checkSafetyLimits(db: Database.Database, check: SafetyCheck): SafetyResult {
  const maxOrderSize = getSafetyLimit(db, "max_order_size");
  if (maxOrderSize > 0 && check.amount > maxOrderSize) {
    return { pass: false, reason: `Order $${check.amount} exceeds max order size ($${maxOrderSize})` };
  }

  const maxExposure = getSafetyLimit(db, "max_exposure");
  if (maxExposure > 0) {
    const row = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM trades WHERE status IN ('simulated', 'executed')"
    ).get() as { total: number };
    if (row.total + check.amount > maxExposure) {
      return { pass: false, reason: `Would exceed total exposure limit ($${row.total + check.amount} > $${maxExposure})` };
    }
  }

  const maxPerMarket = getSafetyLimit(db, "max_per_market");
  if (maxPerMarket > 0) {
    const row = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM trades WHERE condition_id = ? AND status IN ('simulated', 'executed')"
    ).get(check.conditionId) as { total: number };
    if (row.total + check.amount > maxPerMarket) {
      return { pass: false, reason: `Would exceed per-market limit ($${row.total + check.amount} > $${maxPerMarket})` };
    }
  }

  return { pass: true };
}
