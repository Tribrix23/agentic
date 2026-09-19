"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createId = createId;
exports.isOpaqueId = isOpaqueId;
const node_crypto_1 = require("node:crypto");
function createId(prefix) {
    return `${prefix}_${(0, node_crypto_1.randomBytes)(12).toString("base64url")}`;
}
function isOpaqueId(value, prefix) {
    if (typeof value !== "string")
        return false;
    const expected = prefix ? `${prefix}_` : "(?:rt|bs|pg|el|rs|ev|art)_";
    return new RegExp(`^${expected}[A-Za-z0-9_-]{16}$`).test(value);
}
