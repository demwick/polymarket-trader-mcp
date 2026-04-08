import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { initializeDb } from "../../src/db/schema.js";
import { handleRebalance } from "../../src/tools/rebalance.js";
import { addToWatchlist, getWatchlist } from "../../src/db/queries.js";

vi.mock("../../src/utils/license.js", () => ({
  checkLicense: vi.fn().mockResolvedValue(true),
  requirePro: vi.fn((name: string) => `${name} requires Pro`),
  resetLicenseCache: vi.fn(),
}));

vi.mock("../../src/utils/fetch.js", () => ({
  fetchWithRetry: vi.fn(async (url: string) => globalThis.fetch(url)),
}));

describe("handleRebalance", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeDb(db);
  });

  it("reports empty watchlist", async () => {
    const result = await handleRebalance(db, { min_score: 30, min_win_rate: 20, dry_run: true });
    expect(result).toContain("empty");
  });

  it("analyzes and reports traders in dry run", async () => {
    addToWatchlist(db, { address: "0xAAA1234567890123456789012345678901234567", alias: "Good", roi: 0, volume: 1000, pnl: 500, trade_count: 10 });

    // Mock trader data — high win rate
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("activity")) {
        const trades = [];
        for (let i = 0; i < 20; i++) trades.push({ side: "BUY", size: "50", price: "0.55", title: `M${i % 5}`, timestamp: Date.now() / 1000 });
        for (let i = 0; i < 15; i++) trades.push({ side: "SELL", size: "50", price: "0.75", title: `M${i % 5}`, timestamp: Date.now() / 1000 });
        return Response.json(trades);
      }
      if (urlStr.includes("positions")) return Response.json([{}, {}, {}]);
      return Response.json([]);
    });

    const result = await handleRebalance(db, { min_score: 30, min_win_rate: 20, dry_run: true });
    expect(result).toContain("Rebalance Report");
    expect(result).toContain("Good");
    expect(result).toContain("keep");
  });

  it("removes trader when not dry run", async () => {
    addToWatchlist(db, { address: "0xBBB1234567890123456789012345678901234567", alias: "Bad", roi: 0, volume: 100, pnl: -50, trade_count: 2 });

    // Mock trader data — terrible stats
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("activity")) {
        return Response.json([
          { side: "BUY", size: "2", price: "0.50", title: "Only", timestamp: Date.now() / 1000 },
          { side: "SELL", size: "2", price: "0.20", title: "Only", timestamp: Date.now() / 1000 },
        ]);
      }
      return Response.json([]);
    });

    const result = await handleRebalance(db, { min_score: 50, min_win_rate: 30, dry_run: false });
    expect(result).toContain("REMOVE");
    expect(getWatchlist(db)).toHaveLength(0);
  });
});
