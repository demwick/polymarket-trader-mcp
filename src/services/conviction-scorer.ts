import { analyzeTrader, type TraderProfile } from "./trader-analyzer.js";
import { log } from "../utils/logger.js";

export interface ConvictionScore {
  score: number;       // 0-100
  level: "low" | "medium" | "high";
  breakdown: {
    winRate: number;     // 0-30 points
    tradeVolume: number; // 0-20 points
    consistency: number; // 0-20 points
    experience: number;  // 0-15 points
    diversity: number;   // 0-15 points
  };
  recommendation: string;
}

export async function scoreTrader(address: string): Promise<ConvictionScore> {
  const profile = await analyzeTrader(address, true);

  const breakdown = {
    winRate: scoreWinRate(profile.winRate),
    tradeVolume: scoreVolume(profile.avgPositionSize),
    consistency: scoreConsistency(profile.recentTrades),
    experience: scoreExperience(profile.recentTrades.length, profile.activePositions),
    diversity: scoreDiversity(profile.recentTrades),
  };

  const score = breakdown.winRate + breakdown.tradeVolume + breakdown.consistency + breakdown.experience + breakdown.diversity;
  const level = score >= 65 ? "high" : score >= 40 ? "medium" : "low";

  const recommendation = level === "high"
    ? "Strong copy candidate. Use full budget allocation."
    : level === "medium"
    ? "Moderate confidence. Use reduced allocation (50-75%)."
    : "Low confidence. Monitor only, or use minimal allocation.";

  log("info", `Conviction score for ${address.slice(0, 8)}: ${score}/100 (${level})`);

  return { score, level, breakdown, recommendation };
}

function scoreWinRate(winRate: number): number {
  // 0-30 points: >70% = 30, >50% = 20, >30% = 10, else 0
  if (winRate >= 70) return 30;
  if (winRate >= 50) return 20;
  if (winRate >= 30) return 10;
  return 0;
}

function scoreVolume(avgSize: number): number {
  // 0-20 points: larger avg position = more conviction from trader
  if (avgSize >= 100) return 20;
  if (avgSize >= 50) return 15;
  if (avgSize >= 20) return 10;
  if (avgSize >= 5) return 5;
  return 0;
}

function scoreConsistency(trades: { price: number; side: string }[]): number {
  // 0-20 points: how consistent are buy prices (low variance = disciplined)
  const buys = trades.filter((t) => t.side === "BUY");
  if (buys.length < 3) return 5;
  const prices = buys.map((t) => t.price);
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance = prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / prices.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;  // coefficient of variation
  // Low CV = consistent = good
  if (cv < 0.15) return 20;
  if (cv < 0.3) return 15;
  if (cv < 0.5) return 10;
  return 5;
}

function scoreExperience(tradeCount: number, activePositions: number): number {
  // 0-15 points: more trades + active positions = experienced
  let points = 0;
  if (tradeCount >= 30) points += 10;
  else if (tradeCount >= 15) points += 7;
  else if (tradeCount >= 5) points += 4;
  if (activePositions >= 3) points += 5;
  else if (activePositions >= 1) points += 3;
  return Math.min(15, points);
}

function scoreDiversity(trades: { title: string }[]): number {
  // 0-15 points: trading across different markets = diversified
  const uniqueMarkets = new Set(trades.map((t) => t.title)).size;
  if (uniqueMarkets >= 8) return 15;
  if (uniqueMarkets >= 5) return 10;
  if (uniqueMarkets >= 3) return 7;
  return 3;
}
