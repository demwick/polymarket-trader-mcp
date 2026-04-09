import { z } from "zod";
import { TradeExecutor } from "../services/trade-executor.js";
import { validateLiveCredentials } from "../utils/config.js";
import { checkLicense, requirePro } from "../utils/license.js";

export const goLiveSchema = z.object({
  confirm: z.boolean().describe("Must be true to confirm switching to live trading mode. This will place real orders with real money"),
});

export type GoLiveInput = z.infer<typeof goLiveSchema>;

export async function handleGoLive(executor: TradeExecutor, input: GoLiveInput): Promise<string> {
  const isPro = await checkLicense();
  if (!isPro) {
    return requirePro("go_live");
  }

  if (!input.confirm) {
    return "Go live cancelled. Pass confirm=true to switch to live mode.";
  }

  const missing = validateLiveCredentials();
  if (missing.length > 0) {
    return `Cannot go live. Missing credentials: ${missing.join(", ")}. Add them to your environment configuration.`;
  }

  executor.setMode("live");
  return "LIVE MODE ACTIVATED. Real orders will be placed on Polymarket. Use set_config or restart to return to preview mode.";
}
