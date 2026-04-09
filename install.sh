#!/bin/bash
set -e

echo "=== Polymarket Trader MCP — Installer ==="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "Node.js not found. Install Node.js 18+ from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "Node.js 18+ required. Found: $(node -v)"
  exit 1
fi

echo "[1/3] Installing polymarket-trader-mcp..."
npm install -g polymarket-trader-mcp@1.5.1

echo "[2/3] Creating config directory..."
mkdir -p ~/.polymarket-trader
if [ ! -f ~/.polymarket-trader/.env ]; then
  cat > ~/.polymarket-trader/.env << 'EOF'
# Bot settings
COPY_MODE=preview
DAILY_BUDGET=20
MIN_CONVICTION=3

# Polymarket CLOB API (required for live trading)
# POLY_PRIVATE_KEY=
# POLY_API_KEY=
# POLY_API_SECRET=
# POLY_API_PASSPHRASE=

# MCP License (optional)
# MCP_LICENSE_KEY=
EOF
  echo "  Created ~/.polymarket-trader/.env"
else
  echo "  Config already exists, skipping"
fi

echo "[3/3] Verifying installation..."
if command -v polymarket-trader-mcp &> /dev/null; then
  echo ""
  echo "=== Installation complete! ==="
  echo ""
  echo "Add to Claude Code config (~/.claude/settings.json):"
  echo ""
  echo '  "mcpServers": {'
  echo '    "polymarket": {'
  echo '      "command": "npx",'
  echo '      "args": ["polymarket-trader-mcp"]'
  echo '    }'
  echo '  }'
  echo ""
  echo "Or run directly: npx polymarket-trader-mcp"
else
  echo "Installation failed. Try: npm install -g polymarket-trader-mcp@1.5.1"
  exit 1
fi
