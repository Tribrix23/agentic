"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionManager = void 0;
class PermissionManager {
    granted;
    constructor(granted = new Set()) {
        this.granted = granted;
    }
    has(capability) { return this.granted.has(capability); }
    require(capability) { if (!this.has(capability))
        throw new Error(`Permission denied: ${capability}`); }
    list() { return [...this.granted]; }
}
exports.PermissionManager = PermissionManager;
