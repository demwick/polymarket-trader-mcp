import Database from "better-sqlite3";
import { getDailySpent, addDailySpent, getDailyBudgetRemaining } from "../db/queries.js";

export interface CopyAmountInput {
  originalAmount: number;
  activeTraderCount: number;
}

function getConvictionMultiplier(amount: number): number {
  if (amount < 10) return 0.5;
  if (amount <= 50) return 1.0;
  return 1.5;
}

export class BudgetManager {
  constructor(
    private db: Database.Database,
    private dailyLimit: number
  ) {}

  calculateCopyAmount(input: CopyAmountInput): number {
    const today = new Date().toISOString().split("T")[0];
    const limit = this.getDailyLimit();
    const remaining = getDailyBudgetRemaining(this.db, today, limit);

    if (remaining <= 0) return 0;

    const base = limit / input.activeTraderCount;
    const multiplier = getConvictionMultiplier(input.originalAmount);
    const raw = base * multiplier;
    const cap = limit * 0.25;
    const capped = Math.min(raw, cap);

    return Math.min(capped, remaining);
  }

  recordSpending(date: string, amount: number): void {
    addDailySpent(this.db, date, amount, this.getDailyLimit());
  }

  getRemainingBudget(): number {
    const today = new Date().toISOString().split("T")[0];
    return getDailyBudgetRemaining(this.db, today, this.getDailyLimit());
  }

  // Budget source-of-truth: the dashboard can override the env-configured
  // default by writing `daily_budget.limit_amount` for today. If present and
  // positive, that override wins; otherwise fall back to the startup value.
  getDailyLimit(): number {
    const today = new Date().toISOString().split("T")[0];
    const row = this.db
      .prepare("SELECT limit_amount FROM daily_budget WHERE date = ?")
      .get(today) as { limit_amount: number } | undefined;
    if (row && typeof row.limit_amount === "number" && row.limit_amount > 0) {
      return row.limit_amount;
    }
    return this.dailyLimit;
  }

  setDailyLimit(limit: number): void {
    this.dailyLimit = limit;
  }
}
