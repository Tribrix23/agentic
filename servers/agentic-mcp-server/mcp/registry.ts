import { randomUUID } from "node:crypto";
import { Logger } from "../support/logger.js";
import { redact } from "../support/redaction.js";
import { ToolFailure, normalizeError } from "./errors.js";
import { failure, success, type ToolResponse } from "./response.js";
import type { ToolDefinition, ToolContext } from "./types.js";
import { PermissionManager } from "../policy/permissionManager.js";

export class ToolRegistry {
  private readonly definitions = new Map<string, ToolDefinition>();
  constructor(private readonly permissions: PermissionManager, private readonly logger = new Logger()) {}
  register(definition: ToolDefinition): void { if (this.definitions.has(definition.name)) throw new Error(`Duplicate tool: ${definition.name}`); this.definitions.set(definition.name, definition); }
  list(): ToolDefinition[] { return [...this.definitions.values()]; }
  async call(name: string, input: unknown, signal = new AbortController().signal): Promise<ToolResponse<unknown>> {
    const definition = this.definitions.get(name); if (!definition) return failure("NOT_FOUND", "use tools/list to select a valid tool");
    const correlationId = randomUUID(); const context: ToolContext = { correlationId, signal };
    try { if (definition.requiredCapability) this.permissions.require(definition.requiredCapability); const data = await definition.handler(input, context); return success(data); }
    catch (error) { const normalized = normalizeError(error); this.logger.error("MCP tool failed", { correlationId, tool: name, error: redact(normalized.message), code: normalized.code }); return failure(normalized.code, normalized.action, normalized.retryable, normalized.details); }
  }
}
