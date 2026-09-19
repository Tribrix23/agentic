import { z } from "zod";
import { limitsSchema, type Limits } from "./support/limits.js";
import type { Capability } from "./mcp/types.js";

const capabilityValues = ["browser.read", "browser.navigate", "browser.interact", "browser.state.read", "browser.state.write", "browser.download", "browser.evaluate", "browser.diagnostics", "browser.shutdown"] as const;
const capabilities = z.array(z.enum(capabilityValues));
export const configSchema = z.object({
  browser: z.object({ executablePath: z.string().min(1).optional(), headless: z.boolean().default(true), maxContexts: z.number().int().positive().max(100).default(4), maxPages: z.number().int().positive().max(500).default(20) }).default(() => ({ headless: true, maxContexts: 4, maxPages: 20 })),
  policy: z.object({ capabilities: capabilities.default(["browser.read", "browser.navigate"]), allowOrigins: z.array(z.string()).default([]), denyOrigins: z.array(z.string()).default([]), approvedFileRoots: z.array(z.string()).default([]) }).default(() => ({ capabilities: ["browser.read", "browser.navigate"] as Capability[], allowOrigins: [], denyOrigins: [], approvedFileRoots: [] })),
  limits: limitsSchema.default(() => ({ maxChars: 20_000, maxItems: 100, maxDepth: 8, maxBytes: 10_000_000, pageSize: 50 })),
});
export type AppConfig = z.infer<typeof configSchema>;
export function loadConfig(input: unknown = {}): AppConfig { return configSchema.parse(input); }
export function capabilitiesOf(config: AppConfig): ReadonlySet<Capability> { return new Set(config.policy.capabilities); }
