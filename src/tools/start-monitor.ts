import { z } from "zod";
import { WalletMonitor } from "../services/wallet-monitor.js";
import { checkLicense, requirePro } from "../utils/license.js";

export const startMonitorSchema = z.object({
  interval_seconds: z.number().int().min(10).max(300).optional().default(30),
});

export type StartMonitorInput = z.infer<typeof startMonitorSchema>;

export async function handleStartMonitor(monitor: WalletMonitor, input: StartMonitorInput): Promise<string> {
  const isPro = await checkLicense();
  if (!isPro) {
    return requirePro("start_monitor");
  }

  const status = monitor.getStatus();
  if (status.running) {
    return "Monitor is already running.";
  }
  monitor.start(input.interval_seconds * 1000);
  return `Monitor started. Checking wallets every ${input.interval_seconds} seconds.`;
}
