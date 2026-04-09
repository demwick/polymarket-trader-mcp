import { z } from "zod";
import { TradeExecutor } from "../services/trade-executor.js";
import { checkLicense, requirePro } from "../utils/license.js";
import { log } from "../utils/logger.js";

export const cancelOrdersSchema = z.object({});

export async function handleCancelOrders(executor: TradeExecutor): Promise<string> {
  const isPro = await checkLicense();
  if (!isPro) return requirePro("cancel_orders");

  if (executor.getMode() !== "live") {
    return "Cancel orders only works in live mode. Use `go_live` to switch to live trading first.";
  }

  try {
    const result = await executor.cancelAllOrders();

    if (result.cancelled === 0) {
      return "No open orders to cancel.";
    }

    log("trade", `Cancelled ${result.cancelled} open orders`);
    return `Cancelled ${result.cancelled} open orders.`;
  } catch (err: any) {
    log("error", `Cancel orders failed: ${err}`);
    const hint = err?.message?.includes("credentials") ? " Verify your API credentials are configured correctly." : "";
    return `Failed to cancel orders. The Polymarket API returned an error.${hint} Check the event log for details.`;
  }
}
