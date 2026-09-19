"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.success = success;
exports.failure = failure;
exports.boundResponse = boundResponse;
const limits_js_1 = require("../support/limits.js");
function success(data, options = {}) {
    return { ok: true, data, diagnostics: [], ...options };
}
function failure(code, action, retryable = false, details) {
    return { ok: false, diagnostics: [{ code, action, retryable, details }] };
}
function boundResponse(response, limits) {
    const json = JSON.stringify(response.data ?? null);
    const bounded = (0, limits_js_1.boundText)(json, limits.maxChars);
    if (!bounded.truncated)
        return response;
    return { ...response, data: { summary: bounded.value }, observation: { source: "page", untrusted: true, truncated: true } };
}
