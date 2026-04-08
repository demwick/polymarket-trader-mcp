import { z } from "zod";
import { scoreTrader } from "../services/conviction-scorer.js";

export const scoreTraderSchema = z.object({
  address: z.string(),
});

export async function handleScoreTrader(input: z.infer<typeof scoreTraderSchema>): Promise<string> {
  const result = await scoreTrader(input.address);

  const bar = (val: number, max: number) => {
    const filled = Math.round((val / max) * 10);
    return "█".repeat(filled) + "░".repeat(10 - filled) + ` ${val}/${max}`;
  };

  let output = `## Conviction Score: ${input.address.slice(0, 8)}..${input.address.slice(-4)}\n\n`;
  output += `### Score: ${result.score}/100 — **${result.level.toUpperCase()}**\n\n`;
  output += `${result.recommendation}\n\n`;

  output += `### Breakdown\n\n`;
  output += `| Factor | Score | Bar |\n|--------|-------|-----|\n`;
  output += `| Win Rate | ${result.breakdown.winRate}/30 | ${bar(result.breakdown.winRate, 30)} |\n`;
  output += `| Trade Volume | ${result.breakdown.tradeVolume}/20 | ${bar(result.breakdown.tradeVolume, 20)} |\n`;
  output += `| Consistency | ${result.breakdown.consistency}/20 | ${bar(result.breakdown.consistency, 20)} |\n`;
  output += `| Experience | ${result.breakdown.experience}/15 | ${bar(result.breakdown.experience, 15)} |\n`;
  output += `| Diversity | ${result.breakdown.diversity}/15 | ${bar(result.breakdown.diversity, 15)} |\n`;

  return output;
}
