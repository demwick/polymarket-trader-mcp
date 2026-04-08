import Database from "better-sqlite3";
import { getOpenPositions, updateTradeExit } from "../db/queries.js";
import { log } from "../utils/logger.js";

const DATA_API_BASE = "https://data-api.polymarket.com";
const GAMMA_API_BASE = "https://gamma-api.polymarket.com";

export class PositionTracker {
  constructor(private db: Database.Database) {}

  async checkExits(): Promise<number> {
    const openPositions = getOpenPositions(this.db);
    if (openPositions.length === 0) return 0;

    let closedCount = 0;

    for (const pos of openPositions) {
      try {
        // Check 1: Did the trader exit?
        const traderExited = await this.checkTraderExit(
          pos.trader_address,
          pos.condition_id!
        );
        if (traderExited) {
          const exitPrice = await this.getCurrentPrice(pos.condition_id!);
          const pnl = this.calculatePnl(pos.price, exitPrice, pos.amount);
          updateTradeExit(this.db, pos.id!, exitPrice, "trader_exit", pnl);
          log("trade", `Position closed (trader exit): ${pos.market_slug} P&L: $${pnl.toFixed(2)}`);
          closedCount++;
          continue;
        }

        // Check 2: Did the market resolve?
        const resolution = await this.checkMarketResolved(pos.condition_id!);
        if (resolution !== null) {
          const pnl = this.calculatePnl(pos.price, resolution, pos.amount);
          updateTradeExit(this.db, pos.id!, resolution, "market_resolved", pnl);
          log("trade", `Position resolved: ${pos.market_slug} → ${resolution === 1 ? "YES" : "NO"} P&L: $${pnl.toFixed(2)}`);
          closedCount++;
        }
      } catch (err) {
        log("error", `Error tracking position ${pos.id}: ${err}`);
      }
    }

    return closedCount;
  }

  private async checkTraderExit(traderAddress: string, conditionId: string): Promise<boolean> {
    try {
      const url = `${DATA_API_BASE}/activity?user=${traderAddress}&type=TRADE&side=SELL&limit=20`;
      const res = await fetch(url);
      if (!res.ok) return false;
      const activities = await res.json();
      return activities.some((a: any) => a.conditionId === conditionId);
    } catch {
      return false;
    }
  }

  private async checkMarketResolved(conditionId: string): Promise<number | null> {
    try {
      const url = `${GAMMA_API_BASE}/markets?condition_id=${conditionId}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return null;
      const market = data[0];
      if (market.closed && market.resolved) {
        return market.outcome === "Yes" ? 1.0 : 0.0;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async getCurrentPrice(conditionId: string): Promise<number> {
    try {
      const url = `${GAMMA_API_BASE}/markets?condition_id=${conditionId}`;
      const res = await fetch(url);
      if (!res.ok) return 0;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return 0;
      return parseFloat(data[0].outcomePrices?.split(",")[0] ?? "0");
    } catch {
      return 0;
    }
  }

  private calculatePnl(entryPrice: number, exitPrice: number, amount: number): number {
    if (entryPrice === 0) return 0;
    return ((exitPrice - entryPrice) * amount) / entryPrice;
  }
}
