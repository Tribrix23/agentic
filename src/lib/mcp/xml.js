"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseMcpToolCalls = parseMcpToolCalls;
exports.formatMcpToolCallResult = formatMcpToolCallResult;
exports.formatMcpToolsAsXml = formatMcpToolsAsXml;
var xmlCodec_1 = require("../agent/xmlCodec");
function parseValue(value) {
    var trimmed = (0, xmlCodec_1.decodeXmlEntities)(value).trim();
    var unquoted = trimmed.replace(/^(['"])(.*)\1$/, '$2');
    if ((unquoted.startsWith('{') && unquoted.endsWith('}')) || (unquoted.startsWith('[') && unquoted.endsWith(']'))) {
        try {
            return JSON.parse(unquoted);
        }
        catch ( /* Preserve opaque strings. */_a) { /* Preserve opaque strings. */ }
    }
    if (/^true$/i.test(unquoted))
        return true;
    if (/^false$/i.test(unquoted))
        return false;
    if (unquoted !== '' && !Number.isNaN(Number(unquoted)))
        return Number(unquoted);
    return trimmed;
}
function parseMcpToolCalls(xml) {
    var _a, _b, _c;
    var calls = [];
    var callRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
    var match;
    while ((match = callRegex.exec(xml))) {
        var body = match[1];
        var server = (_a = body.match(/<server>([\s\S]*?)<\/server>/i)) === null || _a === void 0 ? void 0 : _a[1];
        var tool = (_b = body.match(/<tool>([\s\S]*?)<\/tool>/i)) === null || _b === void 0 ? void 0 : _b[1];
        var argsBody = ((_c = body.match(/<arguments>([\s\S]*?)<\/arguments>/i)) === null || _c === void 0 ? void 0 : _c[1]) || '';
        if (!server || !tool)
            continue;
        var args = {};
        var argRegex = /<([a-zA-Z_][a-zA-Z0-9_.-]*)>([\s\S]*?)<\/\1>/g;
        var arg = void 0;
        while ((arg = argRegex.exec(argsBody)))
            args[arg[1]] = parseValue(arg[2]);
        calls.push({ server: (0, xmlCodec_1.decodeXmlEntities)(server.trim()), tool: (0, xmlCodec_1.decodeXmlEntities)(tool.trim()), arguments: args });
    }
    return calls;
}
function formatMcpToolCallResult(server, tool, result) {
    var status = result.success ? 'success' : 'error';
    var field = result.success ? "<result><content>".concat((0, xmlCodec_1.escapeXmlText)(result.output), "</content></result>") : "<error>".concat((0, xmlCodec_1.escapeXmlText)(result.output), "</error>");
    return "<tool_result><server>".concat((0, xmlCodec_1.escapeXmlText)(server), "</server><tool>").concat((0, xmlCodec_1.escapeXmlText)(tool), "</tool><status>").concat(status, "</status>").concat(field, "</tool_result>");
}
function formatMcpToolsAsXml(tools) {
    return tools.map(function (tool) { return "<mcp_tool><server>".concat((0, xmlCodec_1.escapeXmlText)(tool.qualifiedName.split(':')[0]), "</server><name>").concat((0, xmlCodec_1.escapeXmlText)(tool.name), "</name><description>").concat((0, xmlCodec_1.escapeXmlText)(tool.description || ''), "</description><parameters>").concat((0, xmlCodec_1.escapeXmlText)(JSON.stringify(tool.inputSchema || {})), "</parameters></mcp_tool>"); }).join('\n');
}
