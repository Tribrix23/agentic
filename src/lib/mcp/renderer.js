"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toMcpAlias = toMcpAlias;
exports.getMcpToolDefinitions = getMcpToolDefinitions;
exports.hasReadyPlaywrightBrowser = hasReadyPlaywrightBrowser;
exports.executeMcpTool = executeMcpTool;
exports.getMcpCatalogDefinitions = getMcpCatalogDefinitions;
var identity_1 = require("./identity");
var catalog_1 = require("./catalog");
function toMcpAlias(serverId, toolName) {
    return (0, identity_1.mcpDisplayAlias)({ serverId: serverId, toolName: toolName });
}
function getMcpToolDefinitions(servers, requireApproval) {
    if (requireApproval === void 0) { requireApproval = true; }
    return getMcpCatalogDefinitions((0, catalog_1.buildMcpCatalog)(servers), requireApproval);
}
function hasReadyPlaywrightBrowser(servers) {
    var server = servers.find(function (item) { return item.id === 'playwright' && item.status === 'ready'; });
    if (!server)
        return false;
    var toolNames = new Set(server.tools.map(function (tool) { return tool.name; }));
    return toolNames.has('browser_navigate') && toolNames.has('browser_snapshot');
}
function executeMcpTool(toolCall, servers, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var entry, _a, serverId, toolName, cancel, error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    entry = (0, catalog_1.buildMcpCatalog)(servers).find(function (item) { return item.externalName === toolCall.name; });
                    if (!entry)
                        return [2 /*return*/, null];
                    _a = entry.identity, serverId = _a.serverId, toolName = _a.toolName;
                    if (signal === null || signal === void 0 ? void 0 : signal.aborted) {
                        return [2 /*return*/, { success: false, output: 'MCP tool call cancelled.', diagnostics: [{ category: 'cancelled', message: 'MCP tool call cancelled.' }] }];
                    }
                    cancel = function () { void window.electron.mcp.cancelCall(toolCall.id); };
                    signal === null || signal === void 0 ? void 0 : signal.addEventListener('abort', cancel, { once: true });
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, 4, 5]);
                    return [4 /*yield*/, window.electron.mcp.callTool(serverId, toolName, toolCall.arguments || {}, {
                            callId: toolCall.id,
                            timeoutMs: entry.definition.timeout,
                        })];
                case 2: return [2 /*return*/, _b.sent()];
                case 3:
                    error_1 = _b.sent();
                    return [2 /*return*/, { success: false, output: (error_1 === null || error_1 === void 0 ? void 0 : error_1.message) || String(error_1), diagnostics: [{ category: 'transport', message: (error_1 === null || error_1 === void 0 ? void 0 : error_1.message) || String(error_1) }] }];
                case 4:
                    signal === null || signal === void 0 ? void 0 : signal.removeEventListener('abort', cancel);
                    return [7 /*endfinally*/];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function getMcpCatalogDefinitions(entries, requireApproval) {
    if (requireApproval === void 0) { requireApproval = true; }
    return entries.map(function (entry) { return ({
        type: 'function',
        function: { name: entry.externalName, description: entry.definition.description, parameters: entry.definition.parameters },
        requiresApproval: requireApproval && entry.definition.requiresApproval,
        capabilities: entry.definition.capabilities,
        mcp: entry.identity,
    }); });
}
