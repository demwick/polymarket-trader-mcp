import { z } from "zod";
import { fetchWithRetry } from "../utils/fetch.js";
import { log } from "../utils/logger.js";

const GAMMA_API_BASE = "https://gamma-api.polymarket.com";

export const getMarketEventsSchema = z.object({
  slug: z.string().optional().describe("Event slug to look up (e.g. 'us-presidential-election-2026')"),
  query: z.string().optional().describe("Search events by keyword"),
  limit: z.number().int().min(1).max(30).optional().default(10),
});

export async function handleGetMarketEvents(input: z.infer<typeof getMarketEventsSchema>): Promise<string> {
  if (!input.slug && !input.query) {
    return "Provide an event `slug` or `query` to find events. Example: `query=\"election\"`.";
  }

  log("info", `Fetching market events: slug=${input.slug ?? "-"}, query=${input.query ?? "-"}`);

  try {
    let url: string;
    if (input.slug) {
      url = `${GAMMA_API_BASE}/events?slug=${encodeURIComponent(input.slug)}`;
    } else {
      url = `${GAMMA_API_BASE}/events?_q=${encodeURIComponent(input.query!)}&limit=${input.limit}&closed=false`;
    }

    const res = await fetchWithRetry(url);
    if (!res.ok) return "Could not fetch events. Try again in a moment.";

    const events = await res.json();
    if (!Array.isArray(events) || events.length === 0) {
      return `No events found for "${input.slug ?? input.query}".`;
    }

    let output = `## Events (${events.length})\n\n`;

    for (const event of events) {
      const e = event as any;
      const title = e.title ?? e.slug ?? "-";
      const markets = e.markets ?? [];

      output += `### ${title}\n\n`;

      if (markets.length === 0) {
        output += `_No markets in this event._\n\n`;
        continue;
      }

      output += `| # | Market | Volume | Price | Condition ID |\n`;
      output += `|---|--------|--------|-------|--------------|\n`;

      for (let i = 0; i < markets.length; i++) {
        const m = markets[i] as any;
        const question = (m.question ?? "").slice(0, 40);
        const vol = parseFloat(m.volume ?? "0");
        const condId = (m.conditionId ?? "").slice(0, 12);

        let price = "-";
        try {
          const rawPrices = m.outcomePrices;
          if (rawPrices) {
            const parsed = typeof rawPrices === "string" ? JSON.parse(rawPrices) : rawPrices;
            if (Array.isArray(parsed)) price = "$" + parseFloat(parsed[0]).toFixed(2);
          }
        } catch {}

        output += `| ${i + 1} | ${question} | $${vol.toFixed(0)} | ${price} | ${condId}... |\n`;
      }

      output += `\n`;
    }

    return output;
  } catch (err) {
    log("error", `Get market events failed: ${err}`);
    return "Could not reach the Polymarket API. Try again in a moment.";
  }
}
