import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../../src/utils/fetch.js", () => ({
  fetchWithRetry: vi.fn(async (url: string) => globalThis.fetch(url)),
}));

import { scoreTrader } from "../../src/services/conviction-scorer.js";

describe("ConvictionScorer", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("scores a high-conviction trader", async () => {
    // Mock trader with high win rate, many trades, diverse markets
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("activity")) {
        const trades = [];
        for (let i = 0; i < 20; i++) {
          trades.push({ side: "BUY", size: "50", price: "0.55", title: `Market ${i % 8}`, timestamp: Date.now() / 1000, outcome: "" });
        }
        for (let i = 0; i < 15; i++) {
          trades.push({ side: "SELL", size: "50", price: "0.75", title: `Market ${i % 8}`, timestamp: Date.now() / 1000, outcome: "" });
        }
        return Response.json(trades);
      }
      if (urlStr.includes("positions")) {
        return Response.json([{}, {}, {}, {}]);
      }
      return Response.json([]);
    });

    const result = await scoreTrader("0xGoodTrader");
    expect(result.score).toBeGreaterThan(50);
    expect(result.level).toBe("high");
    expect(result.breakdown.winRate).toBeGreaterThan(0);
    expect(result.breakdown.diversity).toBeGreaterThan(0);
  });

  it("scores a low-conviction trader", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("activity")) {
        return Response.json([
          { side: "BUY", size: "2", price: "0.50", title: "Only Market", timestamp: Date.now() / 1000, outcome: "" },
          { side: "SELL", size: "2", price: "0.30", title: "Only Market", timestamp: Date.now() / 1000, outcome: "" },
        ]);
      }
      return Response.json([]);
    });

    const result = await scoreTrader("0xBadTrader");
    expect(result.score).toBeLessThan(40);
    expect(result.level).toBe("low");
  });
});
