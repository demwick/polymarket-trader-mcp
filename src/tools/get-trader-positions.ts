import { z } from "zod";
import { getTraderOpenPositions } from "../services/trader-analyzer.js";
import { checkLicense, requirePro } from "../utils/license.js";

export const getTraderPositionsSchema = z.object({
  address: z.string(),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export async function handleGetTraderPositions(input: z.infer<typeof getTraderPositionsSchema>): Promise<string> {
  const isPro = await checkLicense();
  if (!isPro) return requirePro("get_trader_positions");

  const positions = await getTraderOpenPositions(input.address, input.limit);

  if (positions.length === 0) {
    return `No open positions found for ${input.address.slice(0, 6)}...${input.address.slice(-4)}`;
  }

  let output = `## Positions for ${input.address.slice(0, 6)}...${input.address.slice(-4)} (${positions.length})\n\n`;
  output += `| Market | Size | Avg Price | Current Value |\n|--------|------|-----------|---------------|\n`;

  for (const p of positions) {
    const title = (p.title ?? p.slug ?? "-").slice(0, 35);
    const size = parseFloat(p.size ?? "0").toFixed(2);
    const avg = parseFloat(p.avgPrice ?? "0").toFixed(2);
    const value = parseFloat(p.currentValue ?? "0").toFixed(2);
    output += `| ${title} | ${size} | $${avg} | $${value} |\n`;
  }

  return output;
}
