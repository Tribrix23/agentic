"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilePolicy = void 0;
const node_path_1 = require("node:path");
const errors_js_1 = require("../mcp/errors.js");
class FilePolicy {
    approvedRoots;
    constructor(approvedRoots = []) {
        this.approvedRoots = approvedRoots;
    }
    resolveApproved(input) {
        const candidate = (0, node_path_1.resolve)(input);
        if (!this.approvedRoots.some(root => { const base = (0, node_path_1.resolve)(root); return candidate === base || candidate.startsWith(`${base}${node_path_1.sep}`); }))
            throw new errors_js_1.ToolFailure("PERMISSION_DENIED", "File path is outside approved roots", false, "use an approved file path");
        return candidate;
    }
}
exports.FilePolicy = FilePolicy;
