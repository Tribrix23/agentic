import type { z } from "zod";

export type Capability = "browser.read" | "browser.navigate" | "browser.interact" | "browser.state.read" | "browser.state.write" | "browser.download" | "browser.evaluate" | "browser.diagnostics" | "browser.shutdown";
export type TimeoutClass = "short" | "standard" | "long";
export type ToolSchema = z.ZodType;

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolSchema;
  annotations: ToolAnnotations;
  requiredCapability?: Capability;
  timeoutClass: TimeoutClass;
  handler: (input: unknown, context: ToolContext) => Promise<unknown>;
}

export interface ToolContext { correlationId: string; signal: AbortSignal; }
