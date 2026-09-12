"use strict";
// ============================================================================
// Message Types — Extended message model for agentic conversations
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatMessageToAgenticMessage = chatMessageToAgenticMessage;
exports.agenticMessageToChatMessage = agenticMessageToChatMessage;
exports.createUserMessage = createUserMessage;
exports.createAssistantMessage = createAssistantMessage;
exports.createSystemMessage = createSystemMessage;
exports.createToolMessage = createToolMessage;
exports.createToolCall = createToolCall;
exports.getConversationStats = getConversationStats;
/** Convert a ChatMessage to an AgenticMessage */
function chatMessageToAgenticMessage(msg, index) {
    return {
        id: "legacy_".concat(index, "_").concat(Date.now()),
        role: msg.role,
        content: msg.content,
        timestamp: Date.now(),
    };
}
function agenticMessageToChatMessage(msg, toolProtocol) {
    if (toolProtocol === void 0) { toolProtocol = 'native'; }
    var chatMsg = {
        role: msg.role,
        content: msg.content || '',
    };
    if (toolProtocol !== 'xml' && msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        chatMsg.tool_calls = msg.toolCalls.map(function (tc) { return ({
            id: tc.id,
            type: 'function',
            function: {
                name: tc.name,
                arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments),
            }
        }); });
    }
    if (msg.role === 'tool') {
        chatMsg.tool_call_id = msg.toolCallId;
        chatMsg.name = msg.toolName;
    }
    if (msg.attachments && msg.attachments.length > 0) {
        chatMsg.attachments = msg.attachments
            .filter(function (att) { return att.content && att.content.startsWith('data:'); })
            .map(function (att) { return ({ content: att.content }); });
    }
    return chatMsg;
}
/** Create a new user message */
function createUserMessage(content, options) {
    return {
        id: generateId(),
        role: 'user',
        content: content,
        timestamp: Date.now(),
        attachments: options === null || options === void 0 ? void 0 : options.attachments,
        mentionedFiles: options === null || options === void 0 ? void 0 : options.mentionedFiles,
    };
}
/** Create a new assistant message (initially empty, filled by streaming) */
function createAssistantMessage(model) {
    return {
        id: generateId(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
        toolCalls: [],
        model: model,
    };
}
/** Create a new system message */
function createSystemMessage(content) {
    return {
        id: generateId(),
        role: 'system',
        content: content,
        timestamp: Date.now(),
    };
}
/** Create a tool result message */
function createToolMessage(toolCallId, toolName, result) {
    // Sanitize specific known patterns that trip Zhipu GLM's aggressive language/content filters
    var safeOutput = result.output;
    if (typeof safeOutput === 'string') {
        // 0. Remove all non-ASCII characters to comply with language filter (only CN/EN/FR/DE/RU allowed)
        safeOutput = safeOutput.replace(/[^\x00-\x7F]/g, '');
        // 1. Strip raw unix permissions from `ls -l` (e.g. "-rw-rw-r--", "drwxrwxr-x")
        safeOutput = safeOutput.replace(/^[d\-l][rwx\-]{9,10}\+?\s+/gm, function (match) {
            if (match.startsWith('d'))
                return '[DIR]  ';
            if (match.startsWith('l'))
                return '[LINK] ';
            return '[FILE] ';
        });
        // 2. Strip the "total" summary line from ls output
        safeOutput = safeOutput.replace(/^total\s+\d+\s*$/gm, '');
        // 3. Strip usernames, groups, file sizes, and dates from ls -l output in one pass
        // Pattern: [DIR/FILE] followed by number, username, group, size, date/time - strip all but type and filename
        safeOutput = safeOutput.replace(/^(\[DIR\]  |\[FILE\] |\[LINK] )\s*\d+\s+[A-Za-z0-9_\-]+\s+[A-Za-z0-9_\-]+\s+\d+\s+[A-Za-z]{3}\s+\d+\s+[\d:]+\s+/gm, '$1');
        // 4. Strip long numeric sequences from filenames (e.g., screenshot_1788729987988.png -> screenshot_[NUM].png)
        safeOutput = safeOutput.replace(/_\d{8,}/g, '_[NUM]');
        // 5. Strip large contiguous hex/base64 strings if they are ridiculously long to prevent similar filter issues
        safeOutput = safeOutput.replace(/[A-Za-z0-9+/=]{1000,}/g, '[BASE64_DATA_REMOVED]');
        // 6. Playwright DOM snapshots generate huge amounts of YAML structural noise that triggers language filters
        if (toolName && toolName.includes('snapshot')) {
            safeOutput = safeOutput
                .replace(/\s*\[cursor=pointer\]/g, '') // Remove cursor pointers
                .replace(/- generic /g, '- ') // Remove generic tags
                .replace(/^\s*- generic:\s*\n/gm, '') // Remove empty generic parents
                .replace(/\[ref=([^\]]+)\]/g, '($1)') // Convert [ref=x] to (x) for smoother prose parsing
                .replace(/\/url: https:\/\/www\.google\.com\/url\?q=([^&\s]+)[^\n]*/g, '/url: $1') // Clean google redirect URLs
                .replace(/\/url: \/goto\?url=([^&\s]+)[^\n]*/g, '/url: [REDIRECT]') // Clean google redirect URLs
                .replace(/(https?:\/\/[^\s]{60})[^\s]+/g, '$1...'); // Truncate very long URLs to 60 chars
            // Hard limit snapshot size to prevent Zhipu length/density blocks
            if (safeOutput.length > 8000) {
                safeOutput = safeOutput.substring(0, 8000) + '\n... [SNAPSHOT TRUNCATED DUE TO SIZE]';
            }
        }
    }
    return {
        id: generateId(),
        role: 'tool',
        content: safeOutput,
        timestamp: Date.now(),
        toolCallId: toolCallId,
        toolName: toolName,
        attachments: result.attachments,
    };
}
/** Create a pending tool call */
function createToolCall(name, args, id) {
    return {
        id: id || generateId(),
        name: name,
        arguments: args,
        status: 'running',
        timestamp: Date.now(),
    };
}
/** Get conversation statistics from a message array */
function getConversationStats(messages) {
    var _a;
    var totalTokens = 0;
    var toolCalls = 0;
    var filesChanged = new Set();
    for (var _i = 0, messages_1 = messages; _i < messages_1.length; _i++) {
        var msg = messages_1[_i];
        if (msg.tokensUsed)
            totalTokens += msg.tokensUsed;
        if (msg.toolCalls) {
            toolCalls += msg.toolCalls.length;
            for (var _b = 0, _c = msg.toolCalls; _b < _c.length; _b++) {
                var tc = _c[_b];
                if ((_a = tc.result) === null || _a === void 0 ? void 0 : _a.artifacts) {
                    for (var _d = 0, _e = tc.result.artifacts; _d < _e.length; _d++) {
                        var a = _e[_d];
                        if (a.path)
                            filesChanged.add(a.path);
                    }
                }
            }
        }
    }
    return {
        totalTokens: totalTokens,
        toolCalls: toolCalls,
        filesChanged: Array.from(filesChanged),
    };
}
// ── Utilities ──────────────────────────────────────────────────────────────
function generateId() {
    return "".concat(Date.now(), "_").concat(Math.random().toString(36).slice(2, 11));
}
