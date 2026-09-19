"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolFailure = exports.ERROR_CODES = void 0;
exports.normalizeError = normalizeError;
exports.ERROR_CODES = ["INVALID_ARGUMENT", "NOT_FOUND", "AMBIGUOUS_TARGET", "STALE_TARGET", "NOT_VISIBLE", "OBSTRUCTED", "TIMEOUT", "NAVIGATION_BLOCKED", "NAVIGATION_FAILED", "REDIRECT_BLOCKED", "BROWSER_DISCONNECTED", "SESSION_CLOSED", "DOWNLOAD_BLOCKED", "EVALUATION_DISABLED", "OUTPUT_LIMIT", "PERMISSION_DENIED", "INTERNAL_ERROR"];
class ToolFailure extends Error {
    code;
    retryable;
    action;
    details;
    constructor(code, message, retryable = false, action = "retry", details) {
        super(message);
        this.code = code;
        this.retryable = retryable;
        this.action = action;
        this.details = details;
        this.name = "ToolFailure";
    }
}
exports.ToolFailure = ToolFailure;
function normalizeError(error) {
    if (error instanceof ToolFailure)
        return error;
    if (error instanceof Error)
        return new ToolFailure("INTERNAL_ERROR", error.message, false, "inspect diagnostics");
    return new ToolFailure("INTERNAL_ERROR", "The operation failed", false, "inspect diagnostics");
}
