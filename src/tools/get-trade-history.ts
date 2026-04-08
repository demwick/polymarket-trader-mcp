import { z } from "zod";
import Database from "better-sqlite3";
import { getTradeHistory } from "../db/queries.js";
import { checkLicense, requirePro } from "../utils/license.js";

export const tradeHistorySchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(20),
  trader: z.string().optional(),
  status: z.string().optional(),
});

export type TradeHistoryInput = z.infer<typeof tradeHistorySchema>;

export async function handleGetTradeHistory(db: Database.Database, input: TradeHistoryInput): Promise<string> {
  const isPro = await checkLicense();
  if (!isPro) {
    return requirePro("get_trade_history");
  }

  const trades = getTradeHistory(db, {
    limit: input.limit,
    trader: input.trader,
    status: input.status,
  });

  if (trades.length === 0) {
    return "No trades found.";
  }

  let output = `## Trade History (${trades.length})\n\n`;
  output += `| # | Time | Trader | Market | Price | Amount | Mode | Status |\n|---|------|--------|--------|-------|--------|------|--------|\n`;

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    const time = t.created_at?.split("T")[1]?.slice(0, 5) ?? "-";
    const addr = t.trader_address.slice(0, 6) + "..";
    output += `| ${i + 1} | ${time} | ${addr} | ${t.market_slug ?? "-"} | $${t.price.toFixed(2)} | $${t.amount.toFixed(2)} | ${t.mode} | ${t.status} |\n`;
  }

  return output;
}
