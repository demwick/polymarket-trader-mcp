import { log } from "./logger.js";

let _isLicensed: boolean | null = null;

export async function checkLicense(): Promise<boolean> {
  if (_isLicensed !== null) return _isLicensed;

  const key = process.env.MCP_LICENSE_KEY;
  if (!key) {
    _isLicensed = false;
    return false;
  }

  try {
    const response = await fetch("https://mcp-marketplace.io/api/v1/verify-license", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, slug: "polymarket-copy-trader" }),
    });
    const data = await response.json();
    _isLicensed = data.valid === true;
  } catch {
    // Graceful fallback: if API unreachable, check if key format is valid
    _isLicensed = key.startsWith("mcp_live_");
    log("warn", "License API unreachable, using format-based fallback");
  }

  return _isLicensed;
}

export function requirePro(toolName: string): string {
  return `"${toolName}" is a Pro feature. Get a license at https://mcp-marketplace.io/server/polymarket-copy-trader\n\nSet MCP_LICENSE_KEY in your environment to unlock Pro features.`;
}

export function resetLicenseCache(): void {
  _isLicensed = null;
}
