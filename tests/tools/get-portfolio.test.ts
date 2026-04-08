import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { initializeDb } from "../../src/db/schema.js";
import { handleGetPortfolio } from "../../src/tools/get-portfolio.js";
import { addToWatchlist, recordTrade, updateTradeExit } from "../../src/db/queries.js";

vi.mock("../../src/utils/license.js", () => ({
  checkLicense: vi.fn().mockResolvedValue(true),
  requirePro: vi.fn((name: string) => `${name} requires Pro`),
}));

describe("handleGetPortfolio", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeDb(db);
  });

  it("shows empty state with no data", async () => {
    const result = await handleGetPortfolio(db);
    expect(result).toContain("No portfolio data");
  });

  it("shows per-wallet breakdown", async () => {
    addToWatchlist(db, { address: "0xAAA1234567890123456789012345678901234567", alias: "Whale", roi: 0, volume: 1000, pnl: 500, trade_count: 10 });
    addToWatchlist(db, { address: "0xBBB1234567890123456789012345678901234567", alias: "Shark", roi: 0, volume: 2000, pnl: 800, trade_count: 20 });

    recordTrade(db, { trader_address: "0xAAA1234567890123456789012345678901234567", market_slug: "m1", condition_id: "c1", token_id: "t1", side: "BUY", price: 0.5, amount: 10, original_amount: 20, mode: "preview", status: "simulated" });
    const id2 = recordTrade(db, { trader_address: "0xBBB1234567890123456789012345678901234567", market_slug: "m2", condition_id: "c2", token_id: "t2", side: "BUY", price: 0.4, amount: 5, original_amount: 15, mode: "preview", status: "simulated" });
    updateTradeExit(db, id2, 0.8, "market_resolved", 5);

    const result = await handleGetPortfolio(db);
    expect(result).toContain("Portfolio Overview");
    expect(result).toContain("Whale");
    expect(result).toContain("Shark");
    expect(result).toContain("Open Positions");
  });

  it("shows SL/TP in positions table", async () => {
    addToWatchlist(db, { address: "0xAAA1234567890123456789012345678901234567", alias: "Test", roi: 0, volume: 0, pnl: 0, trade_count: 0 });
    const id = recordTrade(db, { trader_address: "0xAAA1234567890123456789012345678901234567", market_slug: "sltp-test", condition_id: "c1", token_id: "t1", side: "BUY", price: 0.5, amount: 10, original_amount: 20, mode: "preview", status: "simulated" });
    db.prepare("UPDATE trades SET sl_price = 0.3, tp_price = 0.8 WHERE id = ?").run(id);

    const result = await handleGetPortfolio(db);
    expect(result).toContain("$0.30");
    expect(result).toContain("$0.80");
  });
});
