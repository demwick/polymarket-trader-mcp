import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { initializeDb } from "../../src/db/schema.js";
import { handleWatchMarket } from "../../src/tools/watch-market.js";
import { getMarketWatchlist } from "../../src/db/queries.js";

vi.mock("../../src/utils/license.js", () => ({
  checkLicense: vi.fn().mockResolvedValue(true),
  requirePro: vi.fn((name: string) => `${name} requires Pro`),
}));

vi.mock("../../src/services/price-service.js", () => ({
  getMarketPriceByCondition: vi.fn().mockResolvedValue({ price: 0.55, tokenId: "tok1" }),
}));

describe("handleWatchMarket", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeDb(db);
  });

  it("shows empty watchlist", async () => {
    const result = await handleWatchMarket(db, { action: "list" });
    expect(result).toContain("empty");
  });

  it("adds a market with alerts", async () => {
    const result = await handleWatchMarket(db, {
      action: "add",
      condition_id: "cond_btc",
      title: "BTC 100k",
      alert_below: 0.30,
      alert_above: 0.80,
    });
    expect(result).toContain("BTC 100k");
    expect(result).toContain("$0.55");

    const markets = getMarketWatchlist(db);
    expect(markets).toHaveLength(1);
    expect(markets[0].alert_below).toBe(0.30);
    expect(markets[0].alert_above).toBe(0.80);
  });

  it("removes a market", async () => {
    await handleWatchMarket(db, { action: "add", condition_id: "cond_rm", title: "Remove me" });
    expect(getMarketWatchlist(db)).toHaveLength(1);

    const result = await handleWatchMarket(db, { action: "remove", condition_id: "cond_rm" });
    expect(result).toContain("Removed");
    expect(getMarketWatchlist(db)).toHaveLength(0);
  });

  it("lists markets with current prices", async () => {
    await handleWatchMarket(db, { action: "add", condition_id: "cond_list", title: "Test Market" });

    const result = await handleWatchMarket(db, { action: "list" });
    expect(result).toContain("Market Watchlist");
    expect(result).toContain("Test Market");
  });

  it("requires condition_id for add/remove", async () => {
    const result = await handleWatchMarket(db, { action: "add" });
    expect(result).toContain("condition_id");
  });
});
