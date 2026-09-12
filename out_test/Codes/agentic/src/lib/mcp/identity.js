"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mcpIdentityKey = mcpIdentityKey;
exports.mcpDisplayAlias = mcpDisplayAlias;
exports.stableMcpAlias = stableMcpAlias;
function mcpIdentityKey(identity) {
    return "".concat(identity.serverId.length, ":").concat(identity.serverId).concat(identity.toolName);
}
function mcpDisplayAlias(identity) {
    var clean = function (value) { return value.replace(/[^a-zA-Z0-9_]/g, '_'); };
    return "mcp__".concat(clean(identity.serverId), "__").concat(clean(identity.toolName));
}
function stableMcpAlias(identity, occupied) {
    var base = mcpDisplayAlias(identity);
    if (!occupied.has(base))
        return base;
    var hash = 2166136261;
    for (var _i = 0, _a = mcpIdentityKey(identity); _i < _a.length; _i++) {
        var char = _a[_i];
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    var suffix = (hash >>> 0).toString(36);
    var alias = "".concat(base, "__").concat(suffix);
    var counter = 2;
    while (occupied.has(alias))
        alias = "".concat(base, "__").concat(suffix, "_").concat(counter++);
    return alias;
}
