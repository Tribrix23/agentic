"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.limitsSchema = void 0;
exports.boundText = boundText;
exports.boundItems = boundItems;
const zod_1 = require("zod");
exports.limitsSchema = zod_1.z.object({
    maxChars: zod_1.z.number().int().positive().max(1_000_000).default(20_000),
    maxItems: zod_1.z.number().int().positive().max(10_000).default(100),
    maxDepth: zod_1.z.number().int().positive().max(32).default(8),
    maxBytes: zod_1.z.number().int().positive().max(100_000_000).default(10_000_000),
    pageSize: zod_1.z.number().int().positive().max(1_000).default(50),
});
function boundText(value, maxChars) {
    if (value.length <= maxChars)
        return { value, truncated: false };
    return { value: value.slice(0, maxChars), truncated: true };
}
function boundItems(items, maxItems) {
    return { items: items.slice(0, maxItems), truncated: items.length > maxItems };
}
