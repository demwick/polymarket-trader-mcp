import { z } from "zod";
import Database from "better-sqlite3";
import { setConfig as setDbConfig } from "../db/queries.js";
import { BudgetManager } from "../services/budget-manager.js";
import { checkLicense, requirePro } from "../utils/license.js";

export const setConfigSchema = z.object({
  key: z.enum(["daily_budget", "min_conviction"]),
  value: z.string(),
});

export type SetConfigInput = z.infer<typeof setConfigSchema>;

export async function handleSetConfig(db: Database.Database, budgetManager: BudgetManager, input: SetConfigInput): Promise<string> {
  const isPro = await checkLicense();
  if (!isPro) {
    return requirePro("set_config");
  }

  setDbConfig(db, input.key, input.value);

  if (input.key === "daily_budget") {
    const newLimit = parseFloat(input.value);
    if (isNaN(newLimit) || newLimit <= 0) {
      return "Invalid budget value. Must be a positive number.";
    }
    budgetManager.setDailyLimit(newLimit);
    return `Daily budget updated to $${newLimit}.`;
  }

  return `Config updated: ${input.key} = ${input.value}`;
}
