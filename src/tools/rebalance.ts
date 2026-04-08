import { z } from "zod";
import Database from "better-sqlite3";
import { getWatchlist, removeFromWatchlist } from "../db/queries.js";
import { analyzeTrader } from "../services/trader-analyzer.js";
import { scoreTrader } from "../services/conviction-scorer.js";
import { checkLicense, requirePro } from "../utils/license.js";
import { log } from "../utils/logger.js";

export const rebalanceSchema = z.object({
  min_score: z.number().min(0).max(100).optional().default(30).describe("Remove traders below this conviction score"),
  min_win_rate: z.number().min(0).max(100).optional().default(20).describe("Remove traders below this win rate %"),
  dry_run: z.boolean().optional().default(true).describe("If true, only report — don't remove. Set false to actually remove."),
});

interface RebalanceResult {
  address: string;
  alias: string | null;
  score: number;
  winRate: number;
  action: "keep" | "remove";
  reason: string;
}

export async function handleRebalance(db: Database.Database, input: z.infer<typeof rebalanceSchema>): Promise<string> {
  const isPro = await checkLicense();
  if (!isPro) return requirePro("rebalance");

  const watchlist = getWatchlist(db);
  if (watchlist.length === 0) {
    return "Watchlist is empty. Nothing to rebalance.";
  }

  log("info", `Rebalancing watchlist: ${watchlist.length} traders (min_score=${input.min_score}, min_win_rate=${input.min_win_rate})`);

  const results: RebalanceResult[] = [];

  for (const w of watchlist) {
    try {
      const conviction = await scoreTrader(w.address);
      const profile = await analyzeTrader(w.address, false);

      let action: "keep" | "remove" = "keep";
      let reason = "Meets criteria";

      if (conviction.score < input.min_score) {
        action = "remove";
        reason = `Score ${conviction.score} < ${input.min_score}`;
      } else if (profile.winRate < input.min_win_rate) {
        action = "remove";
        reason = `Win rate ${profile.winRate.toFixed(1)}% < ${input.min_win_rate}%`;
      }

      results.push({
        address: w.address,
        alias: w.alias,
        score: conviction.score,
        winRate: profile.winRate,
        action,
        reason,
      });
    } catch (err) {
      results.push({
        address: w.address,
        alias: w.alias,
        score: 0,
        winRate: 0,
        action: "keep",
        reason: `Error analyzing: ${err}`,
      });
    }
  }

  const toRemove = results.filter((r) => r.action === "remove");

  // Execute removals if not dry run
  if (!input.dry_run) {
    for (const r of toRemove) {
      removeFromWatchlist(db, r.address);
      log("info", `Rebalance: removed ${r.alias ?? r.address.slice(0, 8)} — ${r.reason}`);
    }
  }

  // Render report
  let output = `## Rebalance Report${input.dry_run ? " (Dry Run)" : ""}\n\n`;
  output += `Analyzed **${results.length}** traders | Removing: **${toRemove.length}** | Keeping: **${results.length - toRemove.length}**\n\n`;

  output += `| Wallet | Score | Win Rate | Action | Reason |\n`;
  output += `|--------|-------|----------|--------|--------|\n`;

  for (const r of results) {
    const name = r.alias ?? r.address.slice(0, 8) + "..";
    const actionStr = r.action === "remove" ? "REMOVE" : "keep";
    output += `| ${name} | ${r.score} | ${r.winRate.toFixed(1)}% | ${actionStr} | ${r.reason} |\n`;
  }

  if (input.dry_run && toRemove.length > 0) {
    output += `\n_This is a dry run. Set \`dry_run=false\` to actually remove ${toRemove.length} traders._\n`;
  }

  return output;
}
