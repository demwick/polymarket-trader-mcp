import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { initializeDb } from "../../src/db/schema.js";
import { setConfig } from "../../src/db/queries.js";
import { checkSafetyLimits } from "../../src/utils/safety.js";

describe("checkSafetyLimits", () => {
  function createDb() {
    const db = new Database(":memory:");
    initializeDb(db);
    return db;
  }

  it("passes when no limits are set and amount is reasonable", () => {
    const db = createDb();
    const result = checkSafetyLimits(db, { amount: 10, conditionId: "cond_1" });
    expect(result.pass).toBe(true);
  });

  it("rejects when amount exceeds max_order_size", () => {
    const db = createDb();
    setConfig(db, "safety_max_order_size", "5");
    const result = checkSafetyLimits(db, { amount: 10, conditionId: "cond_1" });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("max order size");
  });

  it("rejects when total exposure would exceed max_exposure", () => {
    const db = createDb();
    setConfig(db, "safety_max_exposure", "20");
    db.prepare("INSERT INTO trades (trader_address, market_slug, condition_id, token_id, side, price, amount, original_amount, mode, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("0x1", "test", "c1", "t1", "BUY", 0.5, 15, 15, "preview", "simulated");
    const result = checkSafetyLimits(db, { amount: 10, conditionId: "cond_2" });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("total exposure");
  });

  it("rejects when per-market exposure would exceed max_per_market", () => {
    const db = createDb();
    setConfig(db, "safety_max_per_market", "15");
    db.prepare("INSERT INTO trades (trader_address, market_slug, condition_id, token_id, side, price, amount, original_amount, mode, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("0x1", "test", "cond_1", "t1", "BUY", 0.5, 10, 10, "preview", "simulated");
    const result = checkSafetyLimits(db, { amount: 10, conditionId: "cond_1" });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("per-market");
  });

  it("passes when within all limits", () => {
    const db = createDb();
    setConfig(db, "safety_max_order_size", "50");
    setConfig(db, "safety_max_exposure", "200");
    setConfig(db, "safety_max_per_market", "100");
    const result = checkSafetyLimits(db, { amount: 10, conditionId: "cond_1" });
    expect(result.pass).toBe(true);
  });
});
