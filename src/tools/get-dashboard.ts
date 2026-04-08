import Database from "better-sqlite3";
import { getWatchlist, getTradeHistory, getTradeStats } from "../db/queries.js";
import { BudgetManager } from "../services/budget-manager.js";
import { WalletMonitor } from "../services/wallet-monitor.js";
import { getRecentLogs } from "../utils/logger.js";
import { checkLicense } from "../utils/license.js";

export async function handleGetDashboard(
  db: Database.Database,
  budgetManager: BudgetManager,
  monitor: WalletMonitor,
  mode: string
): Promise<string> {
  const isPro = await checkLicense();
  const stats = getTradeStats(db);
  const remaining = budgetManager.getRemainingBudget();
  const dailyLimit = budgetManager.getDailyLimit();
  const spent = dailyLimit - remaining;
  const watchlist = getWatchlist(db);
  const monitorStatus = monitor.getStatus();

  const modeLabel = mode === "live" ? "LIVE MODE" : "PREVIEW MODE";
  const tierLabel = isPro ? "PRO" : "FREE";

  let output = "";

  output += `## POLYMARKET COPY TRADER — ${modeLabel} [${tierLabel}]\n\n`;
  output += `| Metric | Value |\n|--------|-------|\n`;
  output += `| Budget | $${spent.toFixed(2)} / $${dailyLimit.toFixed(2)} (Remaining: $${remaining.toFixed(2)}) |\n`;
  output += `| Win Rate | ${stats.winRate.toFixed(1)}% |\n`;
  output += `| Total P&L | $${stats.totalPnl.toFixed(2)} |\n`;
  output += `| Trades | ${stats.total} (W:${stats.wins} / L:${stats.losses}) |\n`;
  output += `| Monitor | ${monitorStatus.running ? "Active" : "Stopped"} |\n\n`;

  if (isPro) {
    const recentTrades = getTradeHistory(db, { limit: 10 });
    if (recentTrades.length > 0) {
      output += `### Recent Trades\n\n`;
      output += `| Time | Trader | Market | Price | Amount | Status |\n|------|--------|--------|-------|--------|--------|\n`;
      for (const t of recentTrades) {
        const time = t.created_at?.split("T")[1]?.slice(0, 5) ?? "-";
        const addr = t.trader_address.slice(0, 6) + "..";
        output += `| ${time} | ${addr} | ${t.market_slug ?? "-"} | $${t.price.toFixed(2)} | $${t.amount.toFixed(2)} | ${t.status} |\n`;
      }
      output += "\n";
    }

    const logs = getRecentLogs(5);
    if (logs.length > 0) {
      output += `### Recent Logs\n\n`;
      for (const l of logs) {
        const time = l.timestamp.split("T")[1]?.slice(0, 8) ?? "";
        output += `- \`[${time}]\` **${l.level}**: ${l.message}\n`;
      }
    }
  } else {
    output += `_Upgrade to Pro for detailed trade history and logs._\n`;
  }

  if (watchlist.length > 0) {
    output += `\n### Watchlist (${watchlist.length})\n\n`;
    output += `| Alias | Address | Volume | PnL | Last Check |\n|-------|---------|--------|-----|------------|\n`;
    for (const w of watchlist) {
      const addr = w.address.slice(0, 6) + "..";
      const lastCheck = w.last_checked?.split("T")[1]?.slice(0, 5) ?? "never";
      output += `| ${w.alias ?? "-"} | ${addr} | $${w.volume?.toLocaleString() ?? "?"} | $${w.pnl?.toLocaleString() ?? "?"} | ${lastCheck} |\n`;
    }
  }

  return output;
}
