import { z } from "zod";
import Database from "better-sqlite3";
import { addMarketWatch, removeMarketWatch, getMarketWatchlist } from "../db/queries.js";
import { getMarketPriceByCondition } from "../services/price-service.js";

export const watchMarketSchema = z.object({
  action: z.enum(["add", "remove", "list"]).default("list"),
  condition_id: z.string().optional(),
  title: z.string().optional(),
  alert_below: z.number().min(0).max(1).optional().describe("Alert when price drops below this level"),
  alert_above: z.number().min(0).max(1).optional().describe("Alert when price rises above this level"),
});

export async function handleWatchMarket(db: Database.Database, input: z.infer<typeof watchMarketSchema>): Promise<string> {
  if (input.action === "list") {
    return renderWatchlist(db);
  }

  if (!input.condition_id) {
    return "Please provide a `condition_id` to add or remove a market.";
  }

  if (input.action === "remove") {
    removeMarketWatch(db, input.condition_id);
    return `Removed market ${input.condition_id.slice(0, 12)}... from watchlist.`;
  }

  // Add — fetch current price
  const priceInfo = await getMarketPriceByCondition(input.condition_id);
  const currentPrice = priceInfo?.price ?? 0;

  addMarketWatch(db, {
    condition_id: input.condition_id,
    token_id: priceInfo?.tokenId ?? null,
    title: input.title ?? null,
    slug: null,
    alert_below: input.alert_below ?? null,
    alert_above: input.alert_above ?? null,
    last_price: currentPrice,
  });

  let msg = `Market added to watchlist: ${input.title ?? input.condition_id.slice(0, 12)}...\nCurrent price: $${currentPrice.toFixed(4)}`;
  if (input.alert_below) msg += `\nAlert below: $${input.alert_below}`;
  if (input.alert_above) msg += `\nAlert above: $${input.alert_above}`;

  return msg;
}

async function renderWatchlist(db: Database.Database): Promise<string> {
  const markets = getMarketWatchlist(db);
  if (markets.length === 0) {
    return "Market watchlist is empty. Use `watch_market` with action `add` and a `condition_id` to start watching.";
  }

  // Fetch current prices
  let output = "## Market Watchlist\n\n";
  output += "| # | Market | Last Price | Alert Below | Alert Above | Status |\n";
  output += "|---|--------|------------|-------------|-------------|--------|\n";

  for (let i = 0; i < markets.length; i++) {
    const m = markets[i];
    const priceInfo = await getMarketPriceByCondition(m.condition_id);
    const current = priceInfo?.price ?? m.last_price ?? 0;

    let status = "OK";
    if (m.alert_below && current <= m.alert_below) status = "BELOW ALERT";
    if (m.alert_above && current >= m.alert_above) status = "ABOVE ALERT";

    const name = (m.title ?? m.condition_id.slice(0, 16) + "...").slice(0, 30);
    output += `| ${i + 1} | ${name} | $${current.toFixed(4)} | ${m.alert_below ? "$" + m.alert_below : "-"} | ${m.alert_above ? "$" + m.alert_above : "-"} | ${status} |\n`;
  }

  return output;
}
