import { z } from "zod";
import Database from "better-sqlite3";
import { getPositionsByStatus } from "../db/queries.js";
import { checkLicense } from "../utils/license.js";

export const getPositionsSchema = z.object({
  status: z.enum(["open", "closed", "all"]).optional().default("open"),
});

export async function handleGetPositions(db: Database.Database, input: z.infer<typeof getPositionsSchema>): Promise<string> {
  const isPro = await checkLicense();
  const positions = getPositionsByStatus(db, input.status);

  if (positions.length === 0) {
    return `No ${input.status} positions found.`;
  }

  let output = `## Positions (${positions.length}) — ${input.status}\n\n`;

  if (isPro) {
    output += `| # | Market | Entry | Current | Amount | P&L | Status | Exit |\n|---|--------|-------|---------|--------|-----|--------|------|\n`;
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const current = p.current_price?.toFixed(2) ?? "-";
      const pnl = p.pnl?.toFixed(2) ?? "0.00";
      const exit = p.exit_reason ?? "-";
      output += `| ${i + 1} | ${(p.market_slug ?? "-").slice(0, 25)} | $${p.price.toFixed(2)} | $${current} | $${p.amount.toFixed(2)} | $${pnl} | ${p.status} | ${exit} |\n`;
    }
  } else {
    output += `| # | Market | Amount | Status |\n|---|--------|--------|--------|\n`;
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      output += `| ${i + 1} | ${(p.market_slug ?? "-").slice(0, 25)} | $${p.amount.toFixed(2)} | ${p.status} |\n`;
    }
    output += `\n_Upgrade to Pro for P&L and exit details._\n`;
  }

  return output;
}
