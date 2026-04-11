// SECURITY: This module is the single source of truth for configuration and
// credential access. Secret environment variables (POLY_PRIVATE_KEY and the
// POLY_API_* family) are loaded from process.env exactly once at startup,
// held only in the validated in-memory `_config` singleton, and are never
// written to disk, the database, logs, or any outbound request other than
// the designated Polymarket CLOB endpoint. See SECURITY.md for the full
// disclosure and PERMISSIONS.md for the runtime capability manifest.
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ quiet: true });

const configSchema = z.object({
  POLY_PRIVATE_KEY: z.string().optional().default(""),
  POLY_API_KEY: z.string().optional().default(""),
  POLY_API_SECRET: z.string().optional().default(""),
  POLY_API_PASSPHRASE: z.string().optional().default(""),
  POLY_FUNDER_ADDRESS: z.string().optional().default(""),
  DAILY_BUDGET: z.coerce.number().positive().default(20),
  MIN_CONVICTION: z.coerce.number().positive().default(3),
  COPY_MODE: z.enum(["preview", "live"]).default("preview"),
  CHAIN_ID: z.coerce.number().int().positive().default(137),
  MCP_LICENSE_KEY: z.string().optional().default(""),
  MCP_API_KEY: z.string().optional().default(""),
  DB_PATH: z.string().optional().default(""),
  PORT: z.coerce.number().int().positive().optional(),
});

export type Config = z.infer<typeof configSchema>;

const LIVE_CREDENTIAL_KEYS = [
  "POLY_PRIVATE_KEY",
  "POLY_API_KEY",
  "POLY_API_SECRET",
  "POLY_API_PASSPHRASE",
] as const satisfies readonly (keyof Config)[];

let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    _config = configSchema.parse(process.env);
  }
  return _config;
}

export function hasLiveCredentials(): boolean {
  const c = getConfig();
  return LIVE_CREDENTIAL_KEYS.every((k) => !!c[k]);
}

export function validateLiveCredentials(): string[] {
  const c = getConfig();
  return LIVE_CREDENTIAL_KEYS.filter((k) => !c[k]);
}

// SECURITY: Sole accessor for the wallet signing key. Returned value is used
// only for locally constructing EIP-712 Polymarket CLOB order payloads and
// is never logged, persisted, or transmitted except as part of a signed
// order body sent to clob.polymarket.com over HTTPS.
export function getSigningKey(): string {
  return getConfig().POLY_PRIVATE_KEY;
}
