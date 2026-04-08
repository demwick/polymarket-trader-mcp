import { z } from "zod";
import Database from "better-sqlite3";
import { addToWatchlist, removeFromWatchlist, getWatchlistCount } from "../db/queries.js";
import { checkLicense, requirePro } from "../utils/license.js";

export const watchWalletSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  alias: z.string().optional(),
  action: z.enum(["add", "remove"]).default("add"),
});

export type WatchWalletInput = z.infer<typeof watchWalletSchema>;

export async function handleWatchWallet(db: Database.Database, input: WatchWalletInput): Promise<string> {
  if (input.action === "remove") {
    removeFromWatchlist(db, input.address);
    return `Removed ${input.address} from watchlist.`;
  }

  const isPro = await checkLicense();
  const currentCount = getWatchlistCount(db);

  if (!isPro && currentCount >= 3) {
    return `Free tier is limited to 3 wallets. You have ${currentCount}. ${requirePro("watch_wallet")}`;
  }

  addToWatchlist(db, {
    address: input.address,
    alias: input.alias ?? null,
    roi: 0,
    volume: 0,
    pnl: 0,
    trade_count: 0,
  });

  const limitInfo = isPro ? "" : ` (${currentCount + 1}/3 free slots used)`;
  return `Added ${input.alias ?? input.address} to watchlist.${limitInfo}`;
}
