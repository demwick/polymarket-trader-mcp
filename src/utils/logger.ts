export type LogLevel = "info" | "warn" | "error" | "trade" | "monitor";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
}

const logs: LogEntry[] = [];
const MAX_LOGS = 500;

export function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    data,
  };
  logs.push(entry);
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }
  const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]`;
  if (level === "error") {
    console.error(`${prefix} ${message}`, data ?? "");
  } else {
    console.log(`${prefix} ${message}`, data ?? "");
  }
}

export function getRecentLogs(count = 50): LogEntry[] {
  return logs.slice(-count);
}
