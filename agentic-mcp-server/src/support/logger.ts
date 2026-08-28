import { redact } from "./redaction.js";

export type LogLevel = "debug" | "info" | "warn" | "error";
export class Logger {
  constructor(private readonly output: NodeJS.WritableStream = process.stderr) {}
  log(level: LogLevel, message: string, fields: Record<string, unknown> = {}): void {
    const safeFields = redact(fields);
    this.output.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...(safeFields && typeof safeFields === "object" ? safeFields : {}) })}\n`);
  }
  debug(message: string, fields?: Record<string, unknown>): void { this.log("debug", message, fields); }
  info(message: string, fields?: Record<string, unknown>): void { this.log("info", message, fields); }
  warn(message: string, fields?: Record<string, unknown>): void { this.log("warn", message, fields); }
  error(message: string, fields?: Record<string, unknown>): void { this.log("error", message, fields); }
}
