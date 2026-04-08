import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../../src/utils/fetch.js", () => ({
  fetchWithRetry: vi.fn(async (url: string, opts?: any) => globalThis.fetch(url)),
}));

import { checkMarketQuality } from "../../src/services/market-filter.js";

describe("MarketFilter", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("passes a healthy market", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      bids: [{ price: "0.50", size: "200" }, { price: "0.49", size: "150" }],
      asks: [{ price: "0.53", size: "180" }, { price: "0.54", size: "120" }],
    }));

    const result = await checkMarketQuality("tok_healthy");
    expect(result.pass).toBe(true);
    expect(result.reasons).toHaveLength(0);
    expect(result.metrics.spread).toBeCloseTo(0.03, 2);
  });

  it("rejects wide spread market", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      bids: [{ price: "0.30", size: "100" }],
      asks: [{ price: "0.60", size: "100" }],
    }));

    const result = await checkMarketQuality("tok_wide");
    expect(result.pass).toBe(false);
    expect(result.reasons[0]).toContain("Spread too wide");
  });

  it("rejects thin liquidity", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      bids: [{ price: "0.50", size: "5" }],
      asks: [{ price: "0.52", size: "5" }],
    }));

    const result = await checkMarketQuality("tok_thin");
    expect(result.pass).toBe(false);
    expect(result.reasons.some(function(r) { return r.includes("depth"); })).toBe(true);
  });

  it("respects custom thresholds", async () => {
    const bookData = { bids: [{ price: "0.45", size: "200" }], asks: [{ price: "0.60", size: "200" }] };
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(bookData));

    // 15% spread fails default (max 10%)
    const strict = await checkMarketQuality("tok_custom");
    expect(strict.pass).toBe(false);

    // With relaxed config, passes
    const relaxed = await checkMarketQuality("tok_custom", { maxSpread: 0.20 });
    expect(relaxed.pass).toBe(true);
  });

  it("handles API failure gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));

    const result = await checkMarketQuality("tok_fail");
    expect(result.pass).toBe(false);
    expect(result.reasons[0]).toContain("Failed");
  });
});
