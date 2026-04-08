import { log } from "../utils/logger.js";
import { fetchWithRetry } from "../utils/fetch.js";
import { getMarketPriceByCondition } from "./price-service.js";

const DATA_API_BASE = "https://data-api.polymarket.com";

export interface BacktestTrade {
  title: string;
  conditionId: string;
  side: string;
  entryPrice: number;
  exitPrice: number | null;
  amount: number;
  pnl: number;
  status: "won" | "lost" | "open";
  timestamp: string;
}

export interface BacktestResult {
  address: string;
  period: string;
  trades: BacktestTrade[];
  summary: {
    totalTrades: number;
    wins: number;
    losses: number;
    open: number;
    winRate: number;
    totalPnl: number;
    avgPnl: number;
    bestTrade: number;
    worstTrade: number;
    simulatedCopyPnl: number;
  };
}

export async function backtestTrader(
  address: string,
  copyBudget: number = 5
): Promise<BacktestResult> {
  log("info", `Running backtest for ${address.slice(0, 8)}... (copy budget: $${copyBudget})`);

  // Fetch all activity (BUY + SELL)
  const [buysRes, sellsRes] = await Promise.all([
    fetchActivity(address, "BUY"),
    fetchActivity(address, "SELL"),
  ]);

  // Build entry map: conditionId → { price, amount, title, timestamp }
  const entries = new Map<string, { price: number; amount: number; title: string; timestamp: string }>();
  for (const b of buysRes) {
    const price = parseFloat(b.price ?? "0");
    const amount = parseFloat(b.usdcSize ?? b.size ?? "0");
    if (price > 0 && amount > 0) {
      entries.set(b.conditionId, { price, amount, title: b.title ?? "", timestamp: b.timestamp ?? "" });
    }
  }

  // Build exit map: conditionId → exit price
  const exits = new Map<string, number>();
  for (const s of sellsRes) {
    const price = parseFloat(s.price ?? "0");
    if (price > 0) exits.set(s.conditionId, price);
  }

  const trades: BacktestTrade[] = [];

  for (const [condId, entry] of entries) {
    const exitPrice = exits.get(condId) ?? null;

    let pnl = 0;
    let status: BacktestTrade["status"] = "open";

    if (exitPrice !== null) {
      pnl = entry.price > 0
        ? ((exitPrice - entry.price) * copyBudget) / entry.price
        : 0;
      status = pnl >= 0 ? "won" : "lost";
    } else {
      // Check current price for open positions
      const currentInfo = await getMarketPriceByCondition(condId);
      if (currentInfo) {
        pnl = entry.price > 0
          ? ((currentInfo.price - entry.price) * copyBudget) / entry.price
          : 0;
      }
    }

    trades.push({
      title: entry.title,
      conditionId: condId,
      side: "BUY",
      entryPrice: entry.price,
      exitPrice,
      amount: entry.amount,
      pnl,
      status,
      timestamp: entry.timestamp,
    });
  }

  const closed = trades.filter((t) => t.status !== "open");
  const wins = closed.filter((t) => t.status === "won").length;
  const losses = closed.filter((t) => t.status === "lost").length;
  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const pnls = closed.map((t) => t.pnl);

  return {
    address,
    period: `Last ${buysRes.length + sellsRes.length} trades`,
    trades,
    summary: {
      totalTrades: trades.length,
      wins,
      losses,
      open: trades.length - closed.length,
      winRate: closed.length > 0 ? (wins / closed.length) * 100 : 0,
      totalPnl,
      avgPnl: closed.length > 0 ? totalPnl / closed.length : 0,
      bestTrade: pnls.length > 0 ? Math.max(...pnls) : 0,
      worstTrade: pnls.length > 0 ? Math.min(...pnls) : 0,
      simulatedCopyPnl: totalPnl,
    },
  };
}

async function fetchActivity(address: string, side: string): Promise<any[]> {
  try {
    const url = `${DATA_API_BASE}/activity?user=${address}&type=TRADE&side=${side}&limit=50`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    log("error", `Backtest: failed to fetch ${side} activity for ${address}: ${err}`);
    return [];
  }
}
