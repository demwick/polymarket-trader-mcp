import Database from "better-sqlite3";
import { getWatchlist, updateLastChecked, hasExistingPosition } from "../db/queries.js";
import { BudgetManager } from "./budget-manager.js";
import { TradeExecutor, type TradeOrder } from "./trade-executor.js";
import { resolveMarketByConditionId } from "./market-resolver.js";
import { checkMarketQuality } from "./market-filter.js";
import { PositionTracker } from "./position-tracker.js";
import { log } from "../utils/logger.js";
import { fetchWithRetry } from "../utils/fetch.js";

const DATA_API_BASE = "https://data-api.polymarket.com";

export interface RawActivity {
  type: string;
  side: string;
  size: number | string;
  price: number | string;
  usdcSize?: number | string;
  asset: string;
  timestamp: number | string;
  conditionId: string;
  title: string;
  slug?: string;
  outcome: string;
  transactionHash: string;
}

export interface FilteredTrade {
  side: string;
  size: number;
  price: number;
  asset: string;
  conditionId: string;
  title: string;
  slug: string;
  outcome: string;
  timestamp: string;
  investedAmount: number;
}

export function filterNewTrades(
  activities: RawActivity[],
  minConviction: number,
  maxAgeSeconds: number
): FilteredTrade[] {
  const now = Date.now();

  return activities
    .filter((a) => {
      if (a.type !== "TRADE" || a.side !== "BUY") return false;
      // timestamp can be Unix epoch (seconds) or ISO string
      const ts = typeof a.timestamp === "number"
        ? a.timestamp * 1000
        : new Date(a.timestamp).getTime();
      const age = (now - ts) / 1000;
      if (age > maxAgeSeconds) return false;
      const usdcSize = a.usdcSize
        ? (typeof a.usdcSize === "number" ? a.usdcSize : parseFloat(a.usdcSize))
        : null;
      const size = typeof a.size === "number" ? a.size : parseFloat(a.size);
      const price = typeof a.price === "number" ? a.price : parseFloat(a.price);
      const invested = usdcSize ?? (size * price);
      if (invested < minConviction) return false;
      return true;
    })
    .map((a) => {
      const size = typeof a.size === "number" ? a.size : parseFloat(a.size);
      const price = typeof a.price === "number" ? a.price : parseFloat(a.price);
      const usdcSize = a.usdcSize
        ? (typeof a.usdcSize === "number" ? a.usdcSize : parseFloat(a.usdcSize))
        : null;
      const ts = typeof a.timestamp === "number"
        ? new Date(a.timestamp * 1000).toISOString()
        : a.timestamp;
      return {
        side: a.side,
        size,
        price,
        asset: a.asset,
        conditionId: a.conditionId,
        title: a.title,
        slug: a.slug ?? "",
        outcome: a.outcome,
        timestamp: ts,
        investedAmount: usdcSize ?? (size * price),
      };
    });
}

async function fetchWalletActivity(address: string): Promise<RawActivity[]> {
  const url = `${DATA_API_BASE}/activity?user=${address}&type=TRADE&side=BUY&limit=20`;
  const response = await fetchWithRetry(url);
  if (!response.ok) {
    throw new Error(`Activity API error: ${response.status}`);
  }
  return (await response.json()) as RawActivity[];
}

export class WalletMonitor {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private tickInProgress = false;

  constructor(
    private db: Database.Database,
    private budgetManager: BudgetManager,
    private tradeExecutor: TradeExecutor,
    private minConviction: number,
    private maxAgeSeconds: number = 300,
    private positionTracker?: PositionTracker
  ) {}

  start(intervalMs: number = 30_000): void {
    if (this.isRunning) {
      log("warn", "Monitor is already running");
      return;
    }
    this.isRunning = true;
    log("monitor", `Wallet monitor started (interval: ${intervalMs / 1000}s)`);

    this.tick();
    this.intervalId = setInterval(() => this.tick(), intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    log("monitor", "Wallet monitor stopped");
  }

  getStatus(): { running: boolean } {
    return { running: this.isRunning };
  }

  private async tick(): Promise<void> {
    if (this.tickInProgress) {
      log("warn", "Skipping tick — previous tick still in progress");
      return;
    }
    this.tickInProgress = true;

    try {
      await this.executeTick();
    } finally {
      this.tickInProgress = false;
    }
  }

  private async executeTick(): Promise<void> {
    // Check exits first
    if (this.positionTracker) {
      try {
        const closed = await this.positionTracker.checkExits();
        if (closed > 0) {
          log("monitor", `Closed ${closed} positions (trader exit or market resolve)`);
        }
      } catch (err) {
        log("error", `Position tracking error: ${err}`);
      }
    }

    const watchlist = getWatchlist(this.db);
    if (watchlist.length === 0) {
      log("monitor", "Watchlist empty, skipping tick");
      return;
    }

    log("monitor", `Checking ${watchlist.length} wallets...`);

    for (const wallet of watchlist) {
      try {
        const activities = await fetchWalletActivity(wallet.address);
        const trades = filterNewTrades(activities, this.minConviction, this.maxAgeSeconds);

        for (const trade of trades) {
          if (hasExistingPosition(this.db, trade.conditionId)) {
            log("monitor", `Skipping ${trade.title} — already have position`);
            continue;
          }

          const copyAmount = this.budgetManager.calculateCopyAmount({
            originalAmount: trade.investedAmount,
            activeTraderCount: watchlist.length,
          });

          if (copyAmount <= 0) {
            log("monitor", `Skipping ${trade.title} — budget exhausted`);
            continue;
          }

          const marketInfo = trade.slug
            ? null
            : await resolveMarketByConditionId(trade.conditionId);

          // Market quality check — skip illiquid or wide-spread markets
          const tokenId = marketInfo?.tokenId ?? trade.asset;
          const quality = await checkMarketQuality(tokenId);
          if (!quality.pass) {
            log("monitor", `Skipping ${trade.title} — market quality check failed: ${quality.reasons[0]}`);
            continue;
          }

          const today = new Date().toISOString().split("T")[0];

          const order: TradeOrder = {
            traderAddress: wallet.address,
            marketSlug: trade.slug || marketInfo?.slug || trade.title,
            conditionId: trade.conditionId,
            tokenId: marketInfo?.tokenId ?? trade.asset,
            price: trade.price,
            amount: copyAmount,
            originalAmount: trade.investedAmount,
            tickSize: marketInfo?.tickSize ?? "0.01",
            negRisk: marketInfo?.negRisk ?? false,
            budget: { date: today, spendAmount: copyAmount, dailyLimit: this.budgetManager.getDailyLimit() },
          };

          const result = await this.tradeExecutor.execute(order);

          // In live mode, budget recording happens separately (not in atomic transaction)
          if (result.status !== "failed" && result.mode === "live") {
            this.budgetManager.recordSpending(today, copyAmount);
          }

          log("trade", `Copy trade: ${result.message}`, {
            trader: wallet.address,
            market: order.marketSlug,
            copyAmount,
            originalAmount: trade.investedAmount,
          });
        }

        updateLastChecked(this.db, wallet.address);
      } catch (err) {
        log("error", `Error checking wallet ${wallet.address}: ${err}`);
      }
    }
  }
}
