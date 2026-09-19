"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configSchema = void 0;
exports.loadConfig = loadConfig;
exports.capabilitiesOf = capabilitiesOf;
const zod_1 = require("zod");
const limits_js_1 = require("./support/limits.js");
const capabilityValues = ["browser.read", "browser.navigate", "browser.interact", "browser.state.read", "browser.state.write", "browser.download", "browser.evaluate", "browser.diagnostics", "browser.shutdown"];
const capabilities = zod_1.z.array(zod_1.z.enum(capabilityValues));
exports.configSchema = zod_1.z.object({
    browser: zod_1.z.object({ executablePath: zod_1.z.string().min(1).optional(), headless: zod_1.z.boolean().default(true), maxContexts: zod_1.z.number().int().positive().max(100).default(4), maxPages: zod_1.z.number().int().positive().max(500).default(20) }).default(() => ({ headless: true, maxContexts: 4, maxPages: 20 })),
    policy: zod_1.z.object({ capabilities: capabilities.default(["browser.read", "browser.navigate"]), allowOrigins: zod_1.z.array(zod_1.z.string()).default([]), denyOrigins: zod_1.z.array(zod_1.z.string()).default([]), approvedFileRoots: zod_1.z.array(zod_1.z.string()).default([]) }).default(() => ({ capabilities: ["browser.read", "browser.navigate"], allowOrigins: [], denyOrigins: [], approvedFileRoots: [] })),
    limits: limits_js_1.limitsSchema.default(() => ({ maxChars: 20_000, maxItems: 100, maxDepth: 8, maxBytes: 10_000_000, pageSize: 50 })),
});
function loadConfig(input = {}) { return exports.configSchema.parse(input); }
function capabilitiesOf(config) { return new Set(config.policy.capabilities); }
