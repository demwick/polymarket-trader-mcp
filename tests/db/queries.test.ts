import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { initializeDb } from "../../src/db/schema.js";
import {
  addToWatchlist,
  removeFromWatchlist,
  getWatchlist,
  getWatchlistCount,
  updateLastChecked,
  recordTrade,
  getTradeHistory,
  hasExistingPosition,
  getDailySpent,
  addDailySpent,
  getDailyBudgetRemaining,
  getTradeStats,
  getConfig,
  setConfig,
  getOpenPositions,
  updateTradeExit,
  getPositionsByStatus,
  getDailyPnlHistory,
} from "../../src/db/queries.js";

describe("Database queries", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeDb(db);
  });

  it("adds and retrieves watchlist entries", () => {
    addToWatchlist(db, {
      address: "0xabc123def456abc123def456abc123def456abc1",
      alias: "TopTrader",
      roi: 142.5,
      volume: 50000,
      pnl: 12000,
      trade_count: 85,
    });
    const list = getWatchlist(db);
    expect(list).toHaveLength(1);
    expect(list[0].address).toBe("0xabc123def456abc123def456abc123def456abc1");
    expect(list[0].alias).toBe("TopTrader");
    expect(list[0].roi).toBe(142.5);
  });

  it("removes from watchlist", () => {
    addToWatchlist(db, { address: "0xabc123def456abc123def456abc123def456abc1", alias: null, roi: 10, volume: 100, pnl: 50, trade_count: 5 });
    removeFromWatchlist(db, "0xabc123def456abc123def456abc123def456abc1");
    expect(getWatchlist(db)).toHaveLength(0);
  });

  it("counts watchlist entries", () => {
    addToWatchlist(db, { address: "0xabc123def456abc123def456abc123def456abc1", alias: "A", roi: 10, volume: 100, pnl: 50, trade_count: 5 });
    addToWatchlist(db, { address: "0xdef456abc123def456abc123def456abc123def4", alias: "B", roi: 20, volume: 200, pnl: 100, trade_count: 10 });
    expect(getWatchlistCount(db)).toBe(2);
  });

  it("records and retrieves trades", () => {
    recordTrade(db, {
      trader_address: "0xabc",
      market_slug: "trump-wins-2028",
      condition_id: "cond123",
      token_id: "tok123",
      side: "BUY",
      price: 0.45,
      amount: 5.0,
      original_amount: 30.0,
      mode: "preview",
      status: "simulated",
    });
    const trades = getTradeHistory(db, { limit: 10 });
    expect(trades).toHaveLength(1);
    expect(trades[0].market_slug).toBe("trump-wins-2028");
    expect(trades[0].amount).toBe(5.0);
  });

  it("tracks daily budget spent", () => {
    const today = new Date().toISOString().split("T")[0];
    addDailySpent(db, today, 5.0, 20);
    addDailySpent(db, today, 3.0, 20);
    expect(getDailySpent(db, today)).toBe(8.0);
  });

  it("gets and sets config", () => {
    setConfig(db, "copy_mode", "preview");
    expect(getConfig(db, "copy_mode")).toBe("preview");
    setConfig(db, "copy_mode", "live");
    expect(getConfig(db, "copy_mode")).toBe("live");
  });

  it("returns null for missing config key", () => {
    expect(getConfig(db, "nonexistent")).toBeNull();
  });

  it("updates last_checked timestamp", () => {
    addToWatchlist(db, { address: "0xabc123def456abc123def456abc123def456abc1", alias: "A", roi: 10, volume: 100, pnl: 50, trade_count: 5 });
    updateLastChecked(db, "0xabc123def456abc123def456abc123def456abc1");
    const list = getWatchlist(db);
    expect(list[0].last_checked).toBeTruthy();
  });

  it("detects existing position by conditionId", () => {
    recordTrade(db, {
      trader_address: "0xabc",
      market_slug: "test",
      condition_id: "cond_existing",
      token_id: "tok1",
      side: "BUY",
      price: 0.5,
      amount: 5,
      original_amount: 10,
      mode: "preview",
      status: "simulated",
    });
    expect(hasExistingPosition(db, "cond_existing")).toBe(true);
    expect(hasExistingPosition(db, "cond_none")).toBe(false);
  });

  it("does not count resolved trades as existing position", () => {
    recordTrade(db, {
      trader_address: "0xabc",
      market_slug: "test",
      condition_id: "cond_resolved",
      token_id: "tok1",
      side: "BUY",
      price: 0.5,
      amount: 5,
      original_amount: 10,
      mode: "preview",
      status: "resolved_win",
    });
    expect(hasExistingPosition(db, "cond_resolved")).toBe(false);
  });

  it("calculates daily budget remaining", () => {
    const today = new Date().toISOString().split("T")[0];
    addDailySpent(db, today, 12, 20);
    expect(getDailyBudgetRemaining(db, today, 20)).toBe(8);
  });

  it("returns full budget when no spending recorded", () => {
    expect(getDailyBudgetRemaining(db, "2099-01-01", 50)).toBe(50);
  });

  it("clamps remaining budget at zero", () => {
    const today = new Date().toISOString().split("T")[0];
    addDailySpent(db, today, 25, 20);
    expect(getDailyBudgetRemaining(db, today, 20)).toBe(0);
  });

  it("computes trade stats correctly", () => {
    recordTrade(db, { trader_address: "0x1", market_slug: "a", condition_id: "c1", token_id: "t1", side: "BUY", price: 0.5, amount: 10, original_amount: 20, mode: "preview", status: "resolved_win" });
    recordTrade(db, { trader_address: "0x1", market_slug: "b", condition_id: "c2", token_id: "t2", side: "BUY", price: 0.3, amount: 5, original_amount: 10, mode: "preview", status: "resolved_loss" });
    recordTrade(db, { trader_address: "0x1", market_slug: "c", condition_id: "c3", token_id: "t3", side: "BUY", price: 0.4, amount: 8, original_amount: 15, mode: "preview", status: "simulated" });

    const stats = getTradeStats(db);
    expect(stats.total).toBe(3);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(1);
    expect(stats.winRate).toBe(50);
  });

  it("returns zero win rate with no resolved trades", () => {
    const stats = getTradeStats(db);
    expect(stats.total).toBe(0);
    expect(stats.winRate).toBe(0);
  });

  it("retrieves open positions only", () => {
    recordTrade(db, { trader_address: "0x1", market_slug: "a", condition_id: "c1", token_id: "t1", side: "BUY", price: 0.5, amount: 10, original_amount: 20, mode: "preview", status: "simulated" });
    recordTrade(db, { trader_address: "0x1", market_slug: "b", condition_id: "c2", token_id: "t2", side: "BUY", price: 0.3, amount: 5, original_amount: 10, mode: "live", status: "executed" });
    recordTrade(db, { trader_address: "0x1", market_slug: "c", condition_id: "c3", token_id: "t3", side: "BUY", price: 0.4, amount: 8, original_amount: 15, mode: "preview", status: "resolved_win" });

    const open = getOpenPositions(db);
    expect(open).toHaveLength(2);
    expect(open.every((t) => ["simulated", "executed"].includes(t.status))).toBe(true);
  });

  it("updates trade exit with pnl and status", () => {
    const id = recordTrade(db, { trader_address: "0x1", market_slug: "a", condition_id: "c1", token_id: "t1", side: "BUY", price: 0.5, amount: 10, original_amount: 20, mode: "preview", status: "simulated" });

    updateTradeExit(db, id, 0.8, "trader_exit", 6);
    const trades = getTradeHistory(db, { limit: 10 });
    expect(trades[0].status).toBe("resolved_win");
    expect(trades[0].current_price).toBe(0.8);
    expect(trades[0].exit_reason).toBe("trader_exit");
    expect(trades[0].pnl).toBe(6);
    expect(trades[0].resolved_at).toBeTruthy();
  });

  it("marks negative pnl as resolved_loss", () => {
    const id = recordTrade(db, { trader_address: "0x1", market_slug: "a", condition_id: "c1", token_id: "t1", side: "BUY", price: 0.5, amount: 10, original_amount: 20, mode: "preview", status: "simulated" });

    updateTradeExit(db, id, 0.3, "market_resolved", -4);
    const trades = getTradeHistory(db, { limit: 10 });
    expect(trades[0].status).toBe("resolved_loss");
  });

  it("filters positions by status", () => {
    recordTrade(db, { trader_address: "0x1", market_slug: "a", condition_id: "c1", token_id: "t1", side: "BUY", price: 0.5, amount: 10, original_amount: 20, mode: "preview", status: "simulated" });
    recordTrade(db, { trader_address: "0x1", market_slug: "b", condition_id: "c2", token_id: "t2", side: "BUY", price: 0.3, amount: 5, original_amount: 10, mode: "preview", status: "resolved_win" });
    recordTrade(db, { trader_address: "0x1", market_slug: "c", condition_id: "c3", token_id: "t3", side: "BUY", price: 0.4, amount: 8, original_amount: 15, mode: "preview", status: "failed" });

    expect(getPositionsByStatus(db, "open")).toHaveLength(1);
    expect(getPositionsByStatus(db, "closed")).toHaveLength(2);
    expect(getPositionsByStatus(db, "all")).toHaveLength(3);
  });

  it("filters trade history by trader", () => {
    recordTrade(db, { trader_address: "0xAAA", market_slug: "a", condition_id: "c1", token_id: "t1", side: "BUY", price: 0.5, amount: 10, original_amount: 20, mode: "preview", status: "simulated" });
    recordTrade(db, { trader_address: "0xBBB", market_slug: "b", condition_id: "c2", token_id: "t2", side: "BUY", price: 0.3, amount: 5, original_amount: 10, mode: "preview", status: "simulated" });

    const filtered = getTradeHistory(db, { trader: "0xAAA" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].trader_address).toBe("0xAAA");
  });

  it("filters trade history by status", () => {
    recordTrade(db, { trader_address: "0x1", market_slug: "a", condition_id: "c1", token_id: "t1", side: "BUY", price: 0.5, amount: 10, original_amount: 20, mode: "preview", status: "simulated" });
    recordTrade(db, { trader_address: "0x1", market_slug: "b", condition_id: "c2", token_id: "t2", side: "BUY", price: 0.3, amount: 5, original_amount: 10, mode: "preview", status: "failed" });

    const filtered = getTradeHistory(db, { status: "failed" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].status).toBe("failed");
  });

  it("returns daily P&L history with cumulative totals", () => {
    // Create resolved trades with known dates
    const id1 = recordTrade(db, { trader_address: "0x1", market_slug: "a", condition_id: "c1", token_id: "t1", side: "BUY", price: 0.5, amount: 10, original_amount: 20, mode: "preview", status: "simulated" });
    const id2 = recordTrade(db, { trader_address: "0x1", market_slug: "b", condition_id: "c2", token_id: "t2", side: "BUY", price: 0.3, amount: 5, original_amount: 10, mode: "preview", status: "simulated" });
    const id3 = recordTrade(db, { trader_address: "0x1", market_slug: "c", condition_id: "c3", token_id: "t3", side: "BUY", price: 0.4, amount: 8, original_amount: 15, mode: "preview", status: "simulated" });

    // Resolve them with different dates
    db.prepare("UPDATE trades SET pnl = 5, status = 'resolved_win', resolved_at = '2026-04-06 10:00:00' WHERE id = ?").run(id1);
    db.prepare("UPDATE trades SET pnl = -3, status = 'resolved_loss', resolved_at = '2026-04-06 14:00:00' WHERE id = ?").run(id2);
    db.prepare("UPDATE trades SET pnl = 8, status = 'resolved_win', resolved_at = '2026-04-07 09:00:00' WHERE id = ?").run(id3);

    const history = getDailyPnlHistory(db);
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ date: "2026-04-06", pnl: 2, cumulative: 2 });
    expect(history[1]).toEqual({ date: "2026-04-07", pnl: 8, cumulative: 10 });
  });

  it("returns empty array when no resolved trades", () => {
    expect(getDailyPnlHistory(db)).toEqual([]);
  });
});
