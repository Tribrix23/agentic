"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTextToolProtocol = parseTextToolProtocol;
var xml_1 = require("../mcp/xml");
var renderer_1 = require("../mcp/renderer");
var xmlCodec_1 = require("./xmlCodec");
// Module-level counter — guarantees every parsed tool call gets a globally
// unique callId regardless of where in the source text the match occurs.
var _callIdCounter = 0;
function nextCallId(prefix) {
    return "".concat(prefix, ":").concat(++_callIdCounter);
}
function scalar(value) {
    var trimmed = value.trim();
    if (trimmed === 'true')
        return true;
    if (trimmed === 'false')
        return false;
    if (trimmed !== '' && !Number.isNaN(Number(trimmed)))
        return Number(trimmed);
    return trimmed;
}
function validName(name, known) {
    return /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(name) && (!(known === null || known === void 0 ? void 0 : known.size) || known.has(name));
}
function normalizeToolName(raw) {
    var name = raw.trim();
    if (name === 'write_file')
        return 'writeFile';
    if (name === 'edit_file')
        return 'editFile';
    if (name === 'read_file')
        return 'readFile';
    if (name === 'run_command')
        return 'runCommand';
    if (name === 'read_skill')
        return 'readSkill';
    if (name === 'deep_research')
        return 'deepResearch';
    return name;
}
var PHANTOM_TAGS_REGEX = /<\/?(?:arg_value|arg_key|parameters|arguments|args)>/gi;
function parseParametersFromBody(body) {
    var _a, _b;
    var args = {};
    var consumed = [];
    // Strip phantom wrapper tags first
    var cleanBody = body.replace(PHANTOM_TAGS_REGEX, '');
    // 1. <parameter=argName>value</parameter> or <parameter name="argName">value</parameter>
    var paramRegex = /<parameter(?:=|\s+name=["']?)([a-zA-Z0-9_-]+)["']?>([\s\S]*?)(?:<\/parameter>|(?=<parameter|<\/function>|<\/tool_call>|$))/gi;
    var paramMatch;
    while ((paramMatch = paramRegex.exec(cleanBody)) !== null) {
        var key = paramMatch[1].trim();
        if (key.toLowerCase() !== 'null') {
            args[key] = parseParameterValue(key, paramMatch[2]);
        }
        consumed.push([paramMatch.index, paramMatch.index + paramMatch[0].length]);
    }
    // 2. <parameter>key>value</parameter>
    var hallucinatedNamed = /<parameter>\s*([a-zA-Z0-9_-]+)\s*>([\s\S]*?)(?:<\/parameter>|(?=<parameter|<\/function>|<\/tool_call>|$))/gi;
    var hallucinatedMatch;
    while ((hallucinatedMatch = hallucinatedNamed.exec(cleanBody)) !== null) {
        if (!consumed.some(function (_a) {
            var start = _a[0], end = _a[1];
            return hallucinatedMatch.index >= start && hallucinatedMatch.index < end;
        })) {
            var key = hallucinatedMatch[1].trim();
            if (key.toLowerCase() !== 'null') {
                args[key] = parseParameterValue(key, hallucinatedMatch[2]);
            }
            consumed.push([hallucinatedMatch.index, hallucinatedMatch.index + hallucinatedMatch[0].length]);
        }
    }
    // 3. Naked parameter: <parameter>content</parameter>
    var nakedParameter = /<parameter>(?!\s*[a-zA-Z0-9_-]+>)([\s\S]*?)(?:<\/parameter>|(?=<parameter|<\/function>|<\/tool_call>|$))/gi;
    var nakedMatch;
    while ((nakedMatch = nakedParameter.exec(cleanBody)) !== null) {
        if (!consumed.some(function (_a) {
            var start = _a[0], end = _a[1];
            return nakedMatch.index >= start && nakedMatch.index < end;
        })) {
            var contentName = Object.keys(args).includes('content') ? 'file_content' : 'content';
            args[contentName] = parseParameterValue(contentName, nakedMatch[1]);
            consumed.push([nakedMatch.index, nakedMatch.index + nakedMatch[0].length]);
        }
    }
    // 4. Fallback: <argName>value</argName> (e.g. <skillName>v2-stop-slop</skillName>, <path>globe.html</path>)
    if (Object.keys(args).length === 0) {
        var standardXml = /<([a-zA-Z0-9_-]+)>([\s\S]*?)(?:<\/\1>|(?=<[a-zA-Z0-9_-]+>|<\/function>|<\/tool_call>|$))/gi;
        var standardMatch = void 0;
        while ((standardMatch = standardXml.exec(cleanBody)) !== null) {
            var key = standardMatch[1].trim();
            var lower = key.toLowerCase();
            if (!['function', 'invoke', 'tool_call', 'parameter', 'arg_value', 'arg_key', 'parameters', 'arguments', 'args', 'null'].includes(lower)) {
                args[key] = parseParameterValue(key, standardMatch[2]);
                consumed.push([standardMatch.index, standardMatch.index + standardMatch[0].length]);
            }
        }
    }
    // 5. Fallback: Function-call / Python style e.g. (skillName="v2-stop-slop") or ("v2-stop-slop")
    if (Object.keys(args).length === 0) {
        var callMatch = /^\s*\(([\s\S]*?)\)\s*$/.exec(cleanBody.trim());
        if (callMatch) {
            var inside = callMatch[1].trim();
            var kvRegex = /([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^,\s)]+))/g;
            var kvMatch = void 0;
            while ((kvMatch = kvRegex.exec(inside)) !== null) {
                var key = kvMatch[1];
                var val = (_b = (_a = kvMatch[2]) !== null && _a !== void 0 ? _a : kvMatch[3]) !== null && _b !== void 0 ? _b : kvMatch[4];
                args[key] = parseParameterValue(key, val);
            }
            if (Object.keys(args).length === 0 && inside) {
                var singleStrMatch = /^["']([^"']*)["']$/.exec(inside);
                if (singleStrMatch) {
                    args['defaultArg'] = singleStrMatch[1];
                }
            }
        }
    }
    return args;
}
function extractToolInvocationsFromSegment(toolCallBody, knownToolNames) {
    var results = [];
    // 1. Primary format: <function=name>...</function> or <invoke name="...">...</invoke>
    var functionRegex = /<(?:function|invoke)(?:=|\s+name=["']?)([a-zA-Z0-9_-]+)["']?>([\s\S]*?)(?:<\/(?:function|invoke)>|$)/gi;
    var functionMatch;
    while ((functionMatch = functionRegex.exec(toolCallBody)) !== null) {
        var name_1 = normalizeToolName(functionMatch[1]);
        if (/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(name_1)) {
            var args = parseParametersFromBody(functionMatch[2]);
            results.push({ name: name_1, args: args, startOffset: functionMatch.index, length: functionMatch[0].length });
        }
    }
    if (results.length > 0)
        return results;
    // 2. Format: <function>toolName</function>...params...
    var tagFunctionRegex = /<function>\s*([a-zA-Z0-9_-]+)\s*<\/function>([\s\S]*?)(?=<function>|$)/gi;
    var tagFunctionMatch;
    while ((tagFunctionMatch = tagFunctionRegex.exec(toolCallBody)) !== null) {
        var name_2 = normalizeToolName(tagFunctionMatch[1]);
        if (/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(name_2)) {
            var args = parseParametersFromBody(tagFunctionMatch[2]);
            results.push({ name: name_2, args: args, startOffset: tagFunctionMatch.index, length: tagFunctionMatch[0].length });
        }
    }
    if (results.length > 0)
        return results;
    // 3. Format: JSON object inside <tool_call> e.g. {"name": "readSkill", "arguments": {...}}
    var trimmed = toolCallBody.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
            var parsed = JSON.parse(trimmed);
            var rawName = parsed.name || parsed.function || parsed.tool || '';
            var name_3 = normalizeToolName(rawName);
            if (name_3 && /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(name_3)) {
                var rawArgs = parsed.arguments || parsed.parameters || parsed.params || parsed.args || {};
                results.push({
                    name: name_3,
                    args: typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {},
                    startOffset: 0,
                    length: toolCallBody.length,
                });
                return results;
            }
        }
        catch (_a) {
            // not valid JSON, proceed to other fallbacks
        }
    }
    // 4. Format: Outer tag is tool name e.g. <readSkill><skillName>v2-stop-slop</skillName></readSkill>
    var outerTagMatch = /^\s*<([a-zA-Z_][a-zA-Z0-9_-]*)\b[^>]*>([\s\S]*?)<\/\1>\s*$/i.exec(trimmed);
    if (outerTagMatch) {
        var candidateName = normalizeToolName(outerTagMatch[1]);
        if (validName(candidateName, knownToolNames)) {
            var args = parseParametersFromBody(outerTagMatch[2]);
            results.push({ name: candidateName, args: args, startOffset: 0, length: toolCallBody.length });
            return results;
        }
    }
    // 5. Format: Bare tool name at start of <tool_call>
    // e.g. <tool_call>readSkill<skillName>v2-stop-slop</skillName>\n</arg_value></tool_call>
    // or <tool_call>\nreadSkill\n<skillName>v2-stop-slop</skillName>\n</tool_call>
    var cleanBody = toolCallBody.replace(PHANTOM_TAGS_REGEX, '').trim();
    var bareMatch = /^([a-zA-Z_][a-zA-Z0-9_-]*)([\s\S]*)$/.exec(cleanBody);
    if (bareMatch) {
        var candidateName = normalizeToolName(bareMatch[1]);
        if (validName(candidateName, knownToolNames)) {
            var args = parseParametersFromBody(bareMatch[2]);
            results.push({ name: candidateName, args: args, startOffset: 0, length: toolCallBody.length });
            return results;
        }
    }
    return results;
}
function parseTextToolProtocol(source, knownToolNames, mode) {
    var _a, _b, _c;
    if (mode === void 0) { mode = 'permissive'; }
    var actions = [];
    var ranges = [];
    var diagnostics = [];
    var isOverlapping = function (start, end) {
        return ranges.some(function (_a) {
            var rStart = _a[0], rEnd = _a[1];
            return Math.max(start, rStart) < Math.min(end, rEnd);
        });
    };
    var recordAction = function (name, args, start, end) {
        if (!validName(name, knownToolNames)) {
            diagnostics.push("Invalid or unknown tool: ".concat(name));
            return;
        }
        actions.push({
            kind: 'tool',
            callId: nextCallId('text'),
            name: name,
            arguments: args,
            source: 'text',
            sourceStart: start,
            sourceEnd: end,
        });
        ranges.push([start, end]);
    };
    // ── Pass 1: MCP tool calls (permissive mode) ──────────────────────────────
    for (var _i = 0, _d = mode === 'permissive' ? (0, xml_1.parseMcpToolCalls)(source) : []; _i < _d.length; _i++) {
        var call = _d[_i];
        var name_4 = (0, renderer_1.toMcpAlias)(call.server, call.tool);
        if (validName(name_4, knownToolNames)) {
            actions.push({ kind: 'tool', callId: nextCallId('text:mcp'), name: name_4, arguments: call.arguments, source: 'text' });
        }
    }
    // ── Pass 2: <tool_call> blocks (all formats) ──────────────────────────────
    var xmlRegex = /<tool_call\b[^>]*>\s*([\s\S]*?)(?:<\/tool_call>|$)/gi;
    var match;
    while ((match = xmlRegex.exec(source)) !== null) {
        var toolCallBody = match[1];
        var matchStart = match.index;
        var matchEnd = match.index + match[0].length;
        ranges.push([matchStart, matchEnd]);
        var invocations = extractToolInvocationsFromSegment(toolCallBody, knownToolNames);
        for (var _e = 0, invocations_1 = invocations; _e < invocations_1.length; _e++) {
            var inv = invocations_1[_e];
            if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(inv.name)) {
                diagnostics.push("Invalid tool name format: ".concat(inv.name));
                continue;
            }
            // DO NOT filter by knownToolNames here!
            // If it's explicitly wrapped in <tool_call>, we MUST pass it up to the agentLoop
            // so that it can return an "Unknown tool: X" error to the LLM. 
            // If we drop it here, the engine falsely assumes the XML was malformed.
            actions.push({
                kind: 'tool',
                callId: nextCallId('text'),
                name: inv.name,
                arguments: inv.args,
                source: 'text',
                sourceStart: matchStart + ((_a = inv.startOffset) !== null && _a !== void 0 ? _a : 0),
                sourceEnd: matchStart + ((_b = inv.startOffset) !== null && _b !== void 0 ? _b : 0) + ((_c = inv.length) !== null && _c !== void 0 ? _c : match[0].length),
            });
        }
    }
    // ── Pass 3: Loose <function=...> or <invoke=...> blocks OUTSIDE <tool_call> ──
    // Many models emit <function=name> directly without wrapping in <tool_call>,
    // or close the first tool call early and omit the opening <tool_call> for the second.
    var looseFunctionRegex = /<(?:function|invoke)(?:=|\s+name=["']?)([a-zA-Z0-9_-]+)["']?>([\s\S]*?)(?:<\/(?:function|invoke)>|(?=<\/tool_call>|$))/gi;
    while ((match = looseFunctionRegex.exec(source)) !== null) {
        var matchStart = match.index;
        var matchEnd = match.index + match[0].length;
        // Check if this function call is already inside a consumed <tool_call> range
        if (isOverlapping(matchStart, matchEnd))
            continue;
        // Also consume any hallucinated trailing closing tags like </tool_call> right after
        var trailingSnippet = source.slice(matchEnd, matchEnd + 50);
        var trailingClose = /^(?:\s*<\/tool_call>)+/i.exec(trailingSnippet);
        if (trailingClose) {
            matchEnd += trailingClose[0].length;
        }
        var name_5 = normalizeToolName(match[1]);
        var args = parseParametersFromBody(match[2]);
        recordAction(name_5, args, matchStart, matchEnd);
    }
    // ── Pass 4: Loose <function>name</function> OUTSIDE <tool_call> ───────────
    var looseTagFunctionRegex = /<function>\s*([a-zA-Z0-9_-]+)\s*<\/function>([\s\S]*?)(?:<\/function>|(?=<(?:function|invoke)|<\/tool_call>|$))/gi;
    while ((match = looseTagFunctionRegex.exec(source)) !== null) {
        var matchStart = match.index;
        var matchEnd = match.index + match[0].length;
        if (isOverlapping(matchStart, matchEnd))
            continue;
        var trailingSnippet = source.slice(matchEnd, matchEnd + 50);
        var trailingClose = /^(?:\s*<\/tool_call>)+/i.exec(trailingSnippet);
        if (trailingClose)
            matchEnd += trailingClose[0].length;
        var name_6 = normalizeToolName(match[1]);
        var args = parseParametersFromBody(match[2]);
        recordAction(name_6, args, matchStart, matchEnd);
    }
    // ── Pass 5: Known tools emitted directly as XML tags: <knownTool>...</knownTool>
    if (knownToolNames && knownToolNames.size > 0) {
        for (var _f = 0, knownToolNames_1 = knownToolNames; _f < knownToolNames_1.length; _f++) {
            var toolName = knownToolNames_1[_f];
            var tagRegex = new RegExp("<".concat(toolName, "\\b[^>]*>([\\s\\S]*?)(?:<\\/").concat(toolName, ">|$)"), 'gi');
            var tagMatch = void 0;
            while ((tagMatch = tagRegex.exec(source)) !== null) {
                var start = tagMatch.index;
                var end = tagMatch.index + tagMatch[0].length;
                if (isOverlapping(start, end))
                    continue;
                var args = parseParametersFromBody(tagMatch[1]);
                recordAction(toolName, args, start, end);
            }
        }
    }
    // ── Pass 6: Antigravity native syntax: call:tool_name{json_args} ───────────
    var callSyntax = mode === 'permissive' ? /call:([a-zA-Z_][a-zA-Z0-9_]*)\s*(\{[^\r\n]*\})/g : null;
    if (callSyntax) {
        while ((match = callSyntax.exec(source)) !== null) {
            var start = match.index;
            var end = match.index + match[0].length;
            if (isOverlapping(start, end))
                continue;
            var name_7 = match[1];
            if (!validName(name_7, knownToolNames))
                continue;
            try {
                var args = JSON.parse(match[2]);
                recordAction(name_7, args, start, end);
            }
            catch (_g) {
                diagnostics.push("Malformed JSON arguments for ".concat(name_7, "."));
            }
        }
    }
    // ── Clean extracted tool ranges and stray tags from the remaining text ─────
    var text = ranges
        .sort(function (a, b) { return b[0] - a[0]; })
        .reduce(function (value, _a) {
        var start = _a[0], end = _a[1];
        return value.slice(0, start) + value.slice(end);
    }, source);
    // Clean any remaining orphaned XML tool tags or phantom tags
    text = text
        .replace(/<parameter\b[^>]*>[\s\S]*?<\/parameter>/gi, '')
        .replace(/<\/?(?:tool_call|function|invoke|parameter|arg_value|arg_key|parameters|arguments|args)\b[^>]*>/gi, '')
        .trim();
    return { actions: actions, text: text, diagnostics: diagnostics };
}
var OPAQUE_FIELDS = new Set(['content', 'codecontent', 'replacementcontent', 'file_content', 'replace', 'replacement']);
function parseParameterValue(name, value) {
    var decoded = (0, xmlCodec_1.decodeXmlEntities)(value);
    // LLMs frequently ignore the system prompt and wrap XML tool parameters in CDATA.
    // Strip CDATA tags if present to prevent them from bleeding into file contents.
    decoded = decoded.replace(/<!\[CDATA\[/g, '');
    decoded = decoded.replace(/\]\]>/g, '');
    return OPAQUE_FIELDS.has(name.toLowerCase()) ? decoded : scalar(decoded);
}
