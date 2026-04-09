import { z } from "zod";
import { TradeExecutor } from "../services/trade-executor.js";
import { log } from "../utils/logger.js";

export const getOrderStatusSchema = z.object({
  order_id: z.string().describe("The order ID to check status for"),
});

export async function handleGetOrderStatus(executor: TradeExecutor, input: z.infer<typeof getOrderStatusSchema>): Promise<string> {
  if (executor.getMode() !== "live") {
    return "Order status is only available in live mode.";
  }

  try {
    const client = await (executor as any).getClobClient();
    const order = await client.getOrder(input.order_id);

    if (!order) {
      return `Order ${input.order_id} not found.`;
    }

    const o = order as any;
    let output = `## Order Status\n\n`;
    output += `| Field | Value |\n|-------|-------|\n`;
    output += `| Order ID | ${o.id ?? input.order_id} |\n`;
    output += `| Status | ${o.status ?? o.order_status ?? "-"} |\n`;
    output += `| Side | ${o.side ?? "-"} |\n`;
    output += `| Price | $${parseFloat(o.price ?? "0").toFixed(4)} |\n`;
    output += `| Size | $${parseFloat(o.original_size ?? o.size ?? "0").toFixed(2)} |\n`;
    output += `| Filled | $${parseFloat(o.size_matched ?? "0").toFixed(2)} |\n`;
    output += `| Type | ${o.order_type ?? o.type ?? "-"} |\n`;
    output += `| Created | ${o.created_at ?? o.timestamp ?? "-"} |\n`;

    return output;
  } catch (err: any) {
    log("error", `Get order status failed: ${err}`);
    return "Could not fetch order status. Check the order ID and verify your trading configuration.";
  }
}
