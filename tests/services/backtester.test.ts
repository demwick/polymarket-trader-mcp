import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../../src/utils/fetch.js", () => ({
  fetchWithRetry: vi.fn(async (url: string) => globalThis.fetch(url)),
}));

import { backtestTrader } from "../../src/services/backtester.js";

describe("Backtester", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("calculates P&L from closed trades", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("side=BUY")) {
        return Response.json([
          { conditionId: "c1", price: "0.40", size: "25", usdcSize: "10", title: "BTC 100k", timestamp: "2026-04-01" },
          { conditionId: "c2", price: "0.60", size: "20", usdcSize: "12", title: "ETH Merge", timestamp: "2026-04-02" },
        ]);
      }
      if (urlStr.includes("side=SELL")) {
        return Response.json([
          { conditionId: "c1", price: "0.70", size: "25", title: "BTC 100k", timestamp: "2026-04-05" },
        ]);
      }
      // For open position price check (gamma API)
      if (urlStr.includes("gamma-api")) {
        return Response.json([{ outcomePrices: "[0.55, 0.45]", clobTokenIds: "[\"tok1\",\"tok2\"]" }]);
      }
      return Response.json([]);
    });

    const result = await backtestTrader("0xTrader", 10);

    expect(result.summary.totalTrades).toBe(2);
    expect(result.summary.wins).toBe(1);  // c1: 0.40 → 0.70 = win
    expect(result.trades.find(function(t) { return t.conditionId === "c1"; })!.status).toBe("won");
    expect(result.summary.simulatedCopyPnl).toBeGreaterThan(0);
  });

  it("handles empty activity", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json([]));

    const result = await backtestTrader("0xEmpty", 5);
    expect(result.summary.totalTrades).toBe(0);
    expect(result.summary.simulatedCopyPnl).toBe(0);
  });
});
