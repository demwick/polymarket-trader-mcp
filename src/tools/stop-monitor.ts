import { WalletMonitor } from "../services/wallet-monitor.js";
import { checkLicense, requirePro } from "../utils/license.js";

export async function handleStopMonitor(monitor: WalletMonitor): Promise<string> {
  const isPro = await checkLicense();
  if (!isPro) {
    return requirePro("stop_monitor");
  }

  const status = monitor.getStatus();
  if (!status.running) {
    return "Monitor is not running.";
  }
  monitor.stop();
  return "Monitor stopped.";
}
