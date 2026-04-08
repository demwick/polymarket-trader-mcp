#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

import { initializeDb } from "./db/schema.js";
import { getConfig } from "./utils/config.js";
import { log } from "./utils/logger.js";

import { BudgetManager } from "./services/budget-manager.js";
import { TradeExecutor } from "./services/trade-executor.js";
import { WalletMonitor } from "./services/wallet-monitor.js";

import { discoverTradersSchema, handleDiscoverTraders } from "./tools/discover-traders.js";
import { watchWalletSchema, handleWatchWallet } from "./tools/watch-wallet.js";
import { handleListWatchlist } from "./tools/list-watchlist.js";
import { startMonitorSchema, handleStartMonitor } from "./tools/start-monitor.js";
import { handleStopMonitor } from "./tools/stop-monitor.js";
import { handleGetDashboard } from "./tools/get-dashboard.js";
import { tradeHistorySchema, handleGetTradeHistory } from "./tools/get-trade-history.js";
import { setConfigSchema, handleSetConfig } from "./tools/set-config.js";
import { goLiveSchema, handleGoLive } from "./tools/go-live.js";

import { startWebDashboard } from "./web/server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "copytrader.db");

const config = getConfig();
const db = new Database(DB_PATH);
initializeDb(db);

const budgetManager = new BudgetManager(db, config.DAILY_BUDGET);
const tradeExecutor = new TradeExecutor(db, config.COPY_MODE);
const walletMonitor = new WalletMonitor(db, budgetManager, tradeExecutor, config.MIN_CONVICTION);

const server = new McpServer({
  name: "polymarket-copy-trader",
  version: "1.0.0",
});

server.tool(
  "discover_traders",
  "Discover top traders from Polymarket leaderboard by PnL, volume, and ROI",
  discoverTradersSchema.shape,
  async (input) => ({ content: [{ type: "text" as const, text: await handleDiscoverTraders(db, discoverTradersSchema.parse(input)) }] })
);

server.tool(
  "watch_wallet",
  "Add or remove a wallet address from the watchlist",
  watchWalletSchema.shape,
  async (input) => ({ content: [{ type: "text" as const, text: await handleWatchWallet(db, watchWalletSchema.parse(input)) }] })
);

server.tool(
  "list_watchlist",
  "Show all watched wallet addresses",
  {},
  async () => ({ content: [{ type: "text" as const, text: handleListWatchlist(db) }] })
);

server.tool(
  "start_monitor",
  "Start the wallet monitoring loop to detect and copy new trades (Pro)",
  startMonitorSchema.shape,
  async (input) => ({ content: [{ type: "text" as const, text: await handleStartMonitor(walletMonitor, startMonitorSchema.parse(input)) }] })
);

server.tool(
  "stop_monitor",
  "Stop the wallet monitoring loop (Pro)",
  {},
  async () => ({ content: [{ type: "text" as const, text: await handleStopMonitor(walletMonitor) }] })
);

server.tool(
  "get_dashboard",
  "Get a terminal-formatted dashboard with budget, P&L, trades, and watchlist status",
  {},
  async () => ({ content: [{ type: "text" as const, text: await handleGetDashboard(db, budgetManager, walletMonitor, tradeExecutor.getMode()) }] })
);

server.tool(
  "get_trade_history",
  "Get trade history with optional filters (Pro)",
  tradeHistorySchema.shape,
  async (input) => ({ content: [{ type: "text" as const, text: await handleGetTradeHistory(db, tradeHistorySchema.parse(input)) }] })
);

server.tool(
  "set_config",
  "Update bot configuration like daily_budget or min_conviction (Pro)",
  setConfigSchema.shape,
  async (input) => ({ content: [{ type: "text" as const, text: await handleSetConfig(db, budgetManager, setConfigSchema.parse(input)) }] })
);

server.tool(
  "go_live",
  "Switch from preview to live mode — requires API credentials in .env (Pro)",
  goLiveSchema.shape,
  async (input) => ({ content: [{ type: "text" as const, text: await handleGoLive(tradeExecutor, goLiveSchema.parse(input)) }] })
);

// Start web dashboard
startWebDashboard(db, budgetManager, walletMonitor, tradeExecutor, config.DASHBOARD_PORT);

// Start MCP server
async function main() {
  log("info", "Starting Polymarket Copy Trader MCP Server");
  log("info", `Mode: ${config.COPY_MODE} | Budget: $${config.DAILY_BUDGET}/day | Port: ${config.DASHBOARD_PORT}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
