import { z } from "zod";
import Database from "better-sqlite3";
import { discoverTraders } from "../services/leaderboard.js";
import { addToWatchlist } from "../db/queries.js";
import { checkLicense, requirePro } from "../utils/license.js";

export const discoverTradersSchema = z.object({
  pages: z.number().int().min(1).max(10).optional().default(3),
  period: z.enum(["ALL", "WEEK"]).optional().default("ALL"),
  min_volume: z.number().optional().default(1000),
  min_pnl: z.number().optional().default(0),
  auto_watch: z.boolean().optional().default(false),
});

export type DiscoverTradersInput = z.infer<typeof discoverTradersSchema>;

export async function handleDiscoverTraders(db: Database.Database, input: DiscoverTradersInput): Promise<string> {
  const isPro = await checkLicense();

  // Free tier: limit to 1 page
  const pages = isPro ? input.pages : Math.min(input.pages, 1);

  const traders = await discoverTraders({
    pages,
    period: input.period,
    minVolume: input.min_volume,
    minPnl: input.min_pnl,
  });

  if (traders.length === 0) {
    return "No traders found matching the criteria.";
  }

  // Free tier: show only top 10
  const displayTraders = isPro ? traders : traders.slice(0, 10);

  if (input.auto_watch) {
    for (const t of displayTraders) {
      addToWatchlist(db, {
        address: t.address,
        alias: t.name,
        roi: 0,
        volume: t.volume,
        pnl: t.pnl,
        trade_count: 0,
      });
    }
  }

  const tierLabel = isPro ? "PRO" : "FREE (upgrade for more)";
  const header = `## Discovered Traders (${displayTraders.length}) [${tierLabel}]\n\nPeriod: ${input.period} | Pages: ${pages}\n`;
  const tableHeader = "| # | Name | Address | PnL | Volume | Rank |\n|---|------|---------|-----|--------|------|\n";
  const rows = displayTraders.map((t, i) =>
    `| ${i + 1} | ${t.name} | ${t.address.slice(0, 6)}...${t.address.slice(-4)} | $${t.pnl.toLocaleString()} | $${t.volume.toLocaleString()} | ${t.rank} |`
  ).join("\n");

  let footer = "";
  if (!isPro && traders.length > 10) {
    footer = `\n\n_${traders.length - 10} more traders available with Pro._`;
  }
  footer += input.auto_watch
    ? `\n\n${displayTraders.length} traders added to watchlist.`
    : `\n\nUse \`watch_wallet\` to add traders to your watchlist.`;

  return header + tableHeader + rows + footer;
}
