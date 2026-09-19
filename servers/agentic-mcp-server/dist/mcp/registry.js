"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolRegistry = void 0;
const node_crypto_1 = require("node:crypto");
const logger_js_1 = require("../support/logger.js");
const redaction_js_1 = require("../support/redaction.js");
const errors_js_1 = require("./errors.js");
const response_js_1 = require("./response.js");
class ToolRegistry {
    permissions;
    logger;
    definitions = new Map();
    constructor(permissions, logger = new logger_js_1.Logger()) {
        this.permissions = permissions;
        this.logger = logger;
    }
    register(definition) { if (this.definitions.has(definition.name))
        throw new Error(`Duplicate tool: ${definition.name}`); this.definitions.set(definition.name, definition); }
    list() { return [...this.definitions.values()]; }
    async call(name, input, signal = new AbortController().signal) {
        const definition = this.definitions.get(name);
        if (!definition)
            return (0, response_js_1.failure)("NOT_FOUND", "use tools/list to select a valid tool");
        const correlationId = (0, node_crypto_1.randomUUID)();
        const context = { correlationId, signal };
        try {
            if (definition.requiredCapability)
                this.permissions.require(definition.requiredCapability);
            const data = await definition.handler(input, context);
            return (0, response_js_1.success)(data);
        }
        catch (error) {
            const normalized = (0, errors_js_1.normalizeError)(error);
            this.logger.error("MCP tool failed", { correlationId, tool: name, error: (0, redaction_js_1.redact)(normalized.message), code: normalized.code });
            return (0, response_js_1.failure)(normalized.code, normalized.action, normalized.retryable, normalized.details);
        }
    }
}
exports.ToolRegistry = ToolRegistry;
