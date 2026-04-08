import { log } from "../utils/logger.js";

const DATA_API_BASE = "https://data-api.polymarket.com";

export interface TraderProfile {
  address: string;
  activePositions: number;
  recentTrades: RecentTrade[];
  totalPnl: number;
  winRate: number;
  avgPositionSize: number;
}

export interface RecentTrade {
  title: string;
  side: string;
  size: number;
  price: number;
  timestamp: string;
  outcome: string;
}

export async function analyzeTrader(address: string, detailed: boolean): Promise<TraderProfile> {
  const [activities, positions] = await Promise.all([
    fetchTraderActivity(address),
    fetchTraderPositions(address),
  ]);

  const trades = activities.map((a: any) => ({
    title: a.title ?? "",
    side: a.side ?? "",
    size: parseFloat(a.size ?? "0"),
    price: parseFloat(a.price ?? "0"),
    timestamp: a.timestamp ?? "",
    outcome: a.outcome ?? "",
  }));

  const wins = trades.filter((t: RecentTrade) => t.side === "BUY").length;
  const total = trades.length;
  const winRate = total > 0 ? (wins / total) * 100 : 0;
  const avgSize = trades.length > 0
    ? trades.reduce((sum: number, t: RecentTrade) => sum + t.size * t.price, 0) / trades.length
    : 0;

  return {
    address,
    activePositions: positions.length,
    recentTrades: detailed ? trades.slice(0, 10) : [],
    totalPnl: 0,
    winRate,
    avgPositionSize: avgSize,
  };
}

async function fetchTraderActivity(address: string): Promise<any[]> {
  try {
    const url = `${DATA_API_BASE}/activity?user=${address}&type=TRADE&limit=50`;
    const res = await fetch(url);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    log("error", `Failed to fetch activity for ${address}: ${err}`);
    return [];
  }
}

async function fetchTraderPositions(address: string): Promise<any[]> {
  try {
    const url = `${DATA_API_BASE}/positions?user=${address}&limit=50`;
    const res = await fetch(url);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    log("error", `Failed to fetch positions for ${address}: ${err}`);
    return [];
  }
}

export async function getTraderOpenPositions(address: string, limit: number = 20): Promise<any[]> {
  try {
    const url = `${DATA_API_BASE}/positions?user=${address}&sortBy=CURRENT&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    log("error", `Failed to fetch positions for ${address}: ${err}`);
    return [];
  }
}
