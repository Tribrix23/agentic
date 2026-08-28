import { randomUUID } from "node:crypto";
import { Logger } from "../support/logger.js";
import { redact } from "../support/redaction.js";
import { normalizeError } from "./errors.js";
import { failure, success } from "./response.js";
export class ToolRegistry {
    permissions;
    logger;
    definitions = new Map();
    constructor(permissions, logger = new Logger()) {
        this.permissions = permissions;
        this.logger = logger;
    }
    register(definition) { if (this.definitions.has(definition.name))
        throw new Error(`Duplicate tool: ${definition.name}`); this.definitions.set(definition.name, definition); }
    list() { return [...this.definitions.values()]; }
    async call(name, input, signal = new AbortController().signal) {
        const definition = this.definitions.get(name);
        if (!definition)
            return failure("NOT_FOUND", "use tools/list to select a valid tool");
        const correlationId = randomUUID();
        const context = { correlationId, signal };
        try {
            if (definition.requiredCapability)
                this.permissions.require(definition.requiredCapability);
            const data = await definition.handler(input, context);
            return success(data);
        }
        catch (error) {
            const normalized = normalizeError(error);
            this.logger.error("MCP tool failed", { correlationId, tool: name, error: redact(normalized.message), code: normalized.code });
            return failure(normalized.code, normalized.action, normalized.retryable, normalized.details);
        }
    }
}
