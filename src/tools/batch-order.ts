import { z } from "zod";
import Database from "better-sqlite3";
import { TradeExecutor } from "../services/trade-executor.js";
import { resolveMarketByConditionId } from "../services/market-resolver.js";
import { checkSafetyLimits } from "../utils/safety.js";
import { log } from "../utils/logger.js";

const orderSchema = z.object({
  condition_id: z.string().describe("Polymarket market condition ID (hex string)"),
  amount: z.number().min(0.5).describe("Amount in USDC to trade"),
  price: z.number().min(0.01).max(0.99).optional().describe("Limit price (0.01-0.99). Omit for market price"),
  side: z.enum(["BUY", "SELL"]).optional().default("BUY").describe("Order side: BUY to open a position, SELL to close"),
});

export const batchOrderSchema = z.object({
  orders: z.array(orderSchema).min(1).max(10).describe("Array of orders to execute (max 10)"),
});

export async function handleBatchOrder(db: Database.Database, executor: TradeExecutor, input: z.infer<typeof batchOrderSchema>): Promise<string> {
  log("info", `Batch order: ${input.orders.length} orders`);

  const results: { market: string; status: string; message: string }[] = [];

  for (const order of input.orders) {
    try {
      const marketInfo = await resolveMarketByConditionId(order.condition_id);
      if (!marketInfo) {
        results.push({ market: order.condition_id.slice(0, 12) + "...", status: "failed", message: "Could not resolve market" });
        continue;
      }

      if (order.side === "BUY") {
        const safety = checkSafetyLimits(db, { amount: order.amount, conditionId: order.condition_id });
        if (!safety.pass) {
          results.push({ market: marketInfo.slug?.slice(0, 25) ?? order.condition_id.slice(0, 12), status: "failed", message: `Safety: ${safety.reason}` });
          continue;
        }
      }

      const tradeOrder = {
        traderAddress: "direct",
        marketSlug: marketInfo.slug,
        conditionId: order.condition_id,
        tokenId: marketInfo.tokenId,
        price: order.price ?? 0.5,
        amount: order.amount,
        originalAmount: order.amount,
        tickSize: marketInfo.tickSize ?? "0.01",
        negRisk: marketInfo.negRisk ?? false,
        orderSide: order.side as "BUY" | "SELL",
      };

      const result = order.side === "SELL"
        ? await executor.executeSell(tradeOrder)
        : await executor.execute(tradeOrder);

      results.push({
        market: marketInfo.slug?.slice(0, 25) ?? order.condition_id.slice(0, 12),
        status: result.status,
        message: `${order.side} $${order.amount} @ $${(order.price ?? 0.5).toFixed(2)}`,
      });
    } catch (err: any) {
      results.push({
        market: order.condition_id.slice(0, 12) + "...",
        status: "failed",
        message: err?.message ?? "Unknown error",
      });
    }
  }

  const succeeded = results.filter((r) => r.status !== "failed").length;
  const failed = results.length - succeeded;

  let output = `## Batch Order Results\n\n`;
  output += `**${succeeded}** succeeded, **${failed}** failed (${results.length} total)\n\n`;
  output += `| # | Market | Status | Details |\n|---|--------|--------|--------|\n`;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    output += `| ${i + 1} | ${r.market} | ${r.status} | ${r.message} |\n`;
  }

  return output;
}
