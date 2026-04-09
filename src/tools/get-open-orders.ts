import { z } from "zod";
import { TradeExecutor } from "../services/trade-executor.js";
import { log } from "../utils/logger.js";

export async function handleGetOpenOrders(executor: TradeExecutor): Promise<string> {
  if (executor.getMode() !== "live") {
    return "Open orders are only available in live mode. In preview mode, orders are simulated instantly.";
  }

  try {
    const client = await (executor as any).getClobClient();
    const orders = await client.getOpenOrders();

    if (!orders || orders.length === 0) {
      return "No open orders.";
    }

    let output = `## Open Orders (${orders.length})\n\n`;
    output += `| # | Market | Side | Price | Size | Type | Order ID |\n`;
    output += `|---|--------|------|-------|------|------|----------|\n`;

    for (let i = 0; i < orders.length; i++) {
      const o = orders[i] as any;
      const market = (o.market ?? o.asset_id ?? "").slice(0, 25);
      const side = o.side ?? "-";
      const price = parseFloat(o.price ?? "0").toFixed(2);
      const size = parseFloat(o.original_size ?? o.size ?? "0").toFixed(2);
      const type = o.order_type ?? o.type ?? "GTC";
      const id = (o.id ?? "").slice(0, 12);

      output += `| ${i + 1} | ${market} | ${side} | $${price} | $${size} | ${type} | ${id}... |\n`;
    }

    return output;
  } catch (err: any) {
    log("error", `Get open orders failed: ${err}`);
    return "Could not fetch open orders. Verify your trading configuration is correct.";
  }
}
