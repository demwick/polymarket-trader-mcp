// SECURITY: This module opens a single unauthenticated, inbound-only
// WebSocket connection to Polymarket's public market price feed. No
// wallet, private key, API credential, or personally identifiable
// information is ever transmitted on this connection — it carries the
// same public price stream any browser client can subscribe to. The
// connection exists only while the user has an active watch_price
// subscription and is torn down on shutdown. See PERMISSIONS.md.
import WebSocket from "ws";
import { log } from "../utils/logger.js";

export interface PriceUpdate {
  tokenId: string;
  price: number;
  timestamp: number;
}

type PriceCallback = (update: PriceUpdate) => void;

// Public market data stream endpoint — no authentication, no payload
// carries user identity. Documented at clob.polymarket.com/docs.
const WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";

export class PriceStream {
  private ws: WebSocket | null = null;
  private subscriptions = new Map<string, Set<PriceCallback>>();
  private reconnectAttempts = 0;
  private maxReconnects = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastPrices = new Map<string, PriceUpdate>();

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      // SECURITY: Inbound-only subscription to the public Polymarket price
      // feed. No credentials or user identity are sent on this socket.
      this.ws = new WebSocket(WS_URL);

      this.ws.on("open", () => {
        log("info", "WebSocket connected to Polymarket");
        this.reconnectAttempts = 0;
        this.resubscribeAll();
        this.startPing();
      });

      this.ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch {}
      });

      this.ws.on("close", () => {
        log("warn", "WebSocket disconnected");
        this.stopPing();
        this.scheduleReconnect();
      });

      this.ws.on("error", (err) => {
        log("error", `WebSocket error: ${err.message}`);
      });
    } catch (err) {
      log("error", `WebSocket connection failed: ${err}`);
      this.scheduleReconnect();
    }
  }

  subscribe(tokenId: string, callback: PriceCallback): void {
    let callbacks = this.subscriptions.get(tokenId);
    if (!callbacks) {
      callbacks = new Set();
      this.subscriptions.set(tokenId, callbacks);
    }
    callbacks.add(callback);

    // Send subscription message if connected
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe(tokenId);
    }

    // Return last known price immediately if available
    const last = this.lastPrices.get(tokenId);
    if (last) callback(last);
  }

  unsubscribe(tokenId: string, callback?: PriceCallback): void {
    if (callback) {
      const callbacks = this.subscriptions.get(tokenId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) this.subscriptions.delete(tokenId);
      }
    } else {
      this.subscriptions.delete(tokenId);
    }
  }

  getLastPrice(tokenId: string): PriceUpdate | undefined {
    return this.lastPrices.get(tokenId);
  }

  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopPing();
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
    this.lastPrices.clear();
    log("info", "WebSocket disconnected (manual)");
  }

  private handleMessage(msg: any): void {
    // Polymarket WS sends price updates in various formats
    const tokenId = msg.asset_id ?? msg.market ?? msg.token_id;
    const price = parseFloat(msg.price ?? msg.last_price ?? "0");

    if (!tokenId || price <= 0) return;

    const update: PriceUpdate = { tokenId, price, timestamp: Date.now() };
    this.lastPrices.set(tokenId, update);

    const callbacks = this.subscriptions.get(tokenId);
    if (callbacks) {
      for (const cb of callbacks) {
        try { cb(update); } catch {}
      }
    }
  }

  private sendSubscribe(tokenId: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      type: "subscribe",
      channel: "market",
      assets_id: tokenId,
    }));
  }

  private resubscribeAll(): void {
    for (const tokenId of this.subscriptions.keys()) {
      this.sendSubscribe(tokenId);
    }
    if (this.subscriptions.size > 0) {
      log("info", `Resubscribed to ${this.subscriptions.size} price streams`);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnects) {
      log("error", `WebSocket max reconnects (${this.maxReconnects}) reached. Call connect() to retry.`);
      return;
    }
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
    this.reconnectAttempts++;
    log("info", `WebSocket reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
