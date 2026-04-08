import Database from "better-sqlite3";
import { getPortfolioByWallet, getTradeStats, getOpenPositions } from "../db/queries.js";
import { checkLicense, requirePro } from "../utils/license.js";

export async function handleGetPortfolio(db: Database.Database): Promise<string> {
  const isPro = await checkLicense();
  if (!isPro) return requirePro("get_portfolio");
  const wallets = getPortfolioByWallet(db);
  const globalStats = getTradeStats(db);
  const openPositions = getOpenPositions(db);

  if (wallets.length === 0 && openPositions.length === 0) {
    return "No portfolio data yet. Use `watch_wallet` to add traders, then `start_monitor` to begin copying.";
  }

  let output = "## Portfolio Overview\n\n";

  // Global summary
  const totalInvested = wallets.reduce((sum, w) => sum + w.totalInvested, 0);
  output += `**Total P&L:** $${globalStats.totalPnl.toFixed(2)} | `;
  output += `**Win Rate:** ${globalStats.winRate.toFixed(1)}% | `;
  output += `**Open:** ${openPositions.length} | `;
  output += `**Invested:** $${totalInvested.toFixed(2)}\n\n`;

  // Per-wallet breakdown
  if (wallets.length > 0) {
    output += "### By Wallet\n\n";
    output += "| Wallet | Open | Closed | Invested | P&L | Win Rate |\n";
    output += "|--------|------|--------|----------|-----|----------|\n";

    for (const w of wallets) {
      const name = w.alias || w.address.slice(0, 6) + ".." + w.address.slice(-4);
      output += `| ${name} | ${w.openPositions} | ${w.closedPositions} | $${w.totalInvested.toFixed(2)} | $${w.realizedPnl.toFixed(2)} | ${w.winRate.toFixed(1)}% |\n`;
    }
  }

  // Open positions grouped by wallet
  if (openPositions.length > 0) {
    output += "\n### Open Positions\n\n";
    output += "| # | Market | Side | Entry | Amount | SL | TP | Trader |\n";
    output += "|---|--------|------|-------|--------|----|----|--------|\n";

    for (let i = 0; i < openPositions.length; i++) {
      const p = openPositions[i];
      const trader = p.trader_address.slice(0, 6) + "..";
      const sl = p.sl_price ? `$${p.sl_price.toFixed(2)}` : "-";
      const tp = p.tp_price ? `$${p.tp_price.toFixed(2)}` : "-";
      output += `| ${i + 1} | ${(p.market_slug ?? "-").slice(0, 25)} | ${p.side} | $${p.price.toFixed(2)} | $${p.amount.toFixed(2)} | ${sl} | ${tp} | ${trader} |\n`;
    }
  }

  return output;
}
