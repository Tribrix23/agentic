"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMcpCatalog = buildMcpCatalog;
var identity_1 = require("./identity");
function buildMcpCatalog(servers) {
    var occupied = new Set();
    var entries = [];
    var ready = __spreadArray([], servers, true).filter(function (server) { return server.status === 'ready'; }).sort(function (a, b) { return a.id.localeCompare(b.id); });
    for (var _i = 0, ready_1 = ready; _i < ready_1.length; _i++) {
        var server = ready_1[_i];
        for (var _a = 0, _b = __spreadArray([], server.tools, true).sort(function (a, b) { return a.name.localeCompare(b.name); }); _a < _b.length; _a++) {
            var tool = _b[_a];
            var identity = { serverId: server.id, toolName: tool.name };
            var externalName = (0, identity_1.stableMcpAlias)(identity, occupied);
            occupied.add(externalName);
            var mutating = tool.permissions.some(function (permission) { return permission === 'write' || permission === 'execute'; });
            var network = tool.permissions.includes('network');
            entries.push({
                identity: identity,
                identityKey: (0, identity_1.mcpIdentityKey)(identity),
                externalName: externalName,
                serverName: server.name,
                tool: tool,
                definition: {
                    name: externalName,
                    description: "[MCP ".concat(server.name, "] ").concat(tool.description || tool.name),
                    category: 'system',
                    parameters: tool.inputSchema || { type: 'object', properties: {} },
                    requiresApproval: mutating,
                    dangerLevel: mutating ? 'moderate' : 'safe',
                    timeout: tool.timeoutMs || 60000,
                    icon: 'Plug',
                    capabilities: {
                        sideEffect: mutating ? 'unknown' : 'none',
                        concurrencyKeys: ["mcp:".concat(server.id)],
                        cancellation: 'cooperative',
                        permission: network ? 'network' : mutating ? 'system' : 'none',
                    },
                    metadata: { source: 'mcp', serverId: server.id, toolName: tool.name },
                },
            });
        }
    }
    return entries;
}
