"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.SubagentManager = void 0;
var SubagentManager = /** @class */ (function () {
    function SubagentManager(runner) {
        this.runner = runner;
        this.children = new Map();
        this.listeners = new Set();
        this.active = new Set();
        this.queued = [];
    }
    SubagentManager.prototype.setRunner = function (runner) { this.runner = runner; };
    SubagentManager.prototype.start = function (request, parentSignal) {
        var _this = this;
        var childId = "subagent:".concat(Date.now(), ":").concat(Math.random().toString(36).slice(2, 9));
        var handle = { childId: childId, childRunId: "run:".concat(childId), status: 'queued', createdAt: Date.now(), taskId: request.taskId, parentConversationId: request.parentConversationId, role: request.role, targetFile: request.targetFile, readOnly: request.readOnly };
        var controller = new AbortController();
        var onParentAbort = function () { return controller.abort(); };
        if (parentSignal === null || parentSignal === void 0 ? void 0 : parentSignal.aborted)
            controller.abort(parentSignal.reason);
        else
            parentSignal === null || parentSignal === void 0 ? void 0 : parentSignal.addEventListener('abort', onParentAbort, { once: true });
        var execute = function () { return __awaiter(_this, void 0, void 0, function () {
            var startedAt, evidence, failed, status_1, error_1, cancelled;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        startedAt = Date.now();
                        Object.assign(handle, { status: 'running', startedAt: startedAt });
                        this.emit();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, 4, 5]);
                        if (controller.signal.aborted)
                            throw abortError();
                        return [4 /*yield*/, this.runner(request, { childId: childId, childRunId: handle.childRunId, signal: controller.signal })];
                    case 2:
                        evidence = _a.sent();
                        failed = evidence.unresolvedItems.length > 0 || evidence.diagnostics.some(function (item) { return item.category !== 'cancelled'; });
                        status_1 = controller.signal.aborted ? 'cancelled' : failed ? 'failed' : 'completed';
                        Object.assign(handle, { status: status_1, completedAt: Date.now() });
                        this.emit();
                        return [2 /*return*/, __assign(__assign(__assign({}, handle), evidence), { status: status_1, startedAt: startedAt, completedAt: Date.now() })];
                    case 3:
                        error_1 = _a.sent();
                        cancelled = controller.signal.aborted || (error_1 === null || error_1 === void 0 ? void 0 : error_1.name) === 'AbortError';
                        Object.assign(handle, { status: cancelled ? 'cancelled' : 'failed', completedAt: Date.now() });
                        this.emit();
                        return [2 /*return*/, __assign(__assign({}, handle), { startedAt: startedAt, completedAt: Date.now(), summary: cancelled ? 'Subagent cancelled.' : 'Subagent failed.', finalAssistantContent: '', changedFiles: [], toolCalls: [], commands: [], tests: [], artifacts: [], unresolvedItems: [(error_1 === null || error_1 === void 0 ? void 0 : error_1.message) || String(error_1)], diagnostics: [{ category: cancelled ? 'cancelled' : 'internal', message: (error_1 === null || error_1 === void 0 ? void 0 : error_1.message) || String(error_1) }] })];
                    case 4:
                        parentSignal === null || parentSignal === void 0 ? void 0 : parentSignal.removeEventListener('abort', onParentAbort);
                        this.active.delete(childId);
                        this.pump();
                        return [7 /*endfinally*/];
                    case 5: return [2 /*return*/];
                }
            });
        }); };
        var begin;
        var gate = new Promise(function (resolve) { begin = resolve; });
        var outcome = gate.then(execute);
        this.children.set(childId, { request: request, handle: handle, controller: controller, outcome: outcome, begin: begin });
        this.queued.push(childId);
        this.emit();
        this.pump();
        // Do not use a bare `finally()` here: its returned rejecting promise would
        // become an unhandled rejection when the runner fails. Keep the handle
        // available briefly for `wait()`, then remove it without changing outcome.
        void outcome.then(function () { return setTimeout(function () { return _this.children.delete(childId); }, 5 * 60 * 1000); }, function () { return setTimeout(function () { return _this.children.delete(childId); }, 5 * 60 * 1000); });
        return { handle: handle, outcome: outcome };
    };
    SubagentManager.prototype.get = function (childId) { var _a; return (_a = this.children.get(childId)) === null || _a === void 0 ? void 0 : _a.handle; };
    SubagentManager.prototype.wait = function (childId) { var _a; return (_a = this.children.get(childId)) === null || _a === void 0 ? void 0 : _a.outcome; };
    SubagentManager.prototype.cancel = function (childId) { var child = this.children.get(childId); if (!child)
        return false; child.controller.abort(); return true; };
    SubagentManager.prototype.cancelAll = function () { for (var _i = 0, _a = this.children.values(); _i < _a.length; _i++) {
        var child = _a[_i];
        child.controller.abort();
    } };
    SubagentManager.prototype.snapshot = function (conversationId) {
        return Array.from(this.children.values())
            .map(function (child) { return (__assign({}, child.handle)); })
            .filter(function (handle) { return !conversationId || handle.parentConversationId === conversationId; });
    };
    SubagentManager.prototype.subscribe = function (listener) {
        var _this = this;
        this.listeners.add(listener);
        listener(this.snapshot());
        return function () { return _this.listeners.delete(listener); };
    };
    SubagentManager.prototype.emit = function () {
        var snapshots = this.snapshot();
        this.listeners.forEach(function (listener) { return listener(snapshots); });
        if (typeof window !== 'undefined')
            window.dispatchEvent(new CustomEvent('subagent-snapshots', { detail: snapshots }));
    };
    SubagentManager.prototype.pump = function () {
        for (var index = 0; index < this.queued.length;) {
            var childId = this.queued[index];
            var child = this.children.get(childId);
            if (!child) {
                this.queued.splice(index, 1);
                continue;
            }
            if (this.conflicts(child.request)) {
                index++;
                continue;
            }
            this.queued.splice(index, 1);
            this.active.add(childId);
            child.begin();
        }
    };
    SubagentManager.prototype.conflicts = function (request) {
        var _a;
        for (var _i = 0, _b = this.active; _i < _b.length; _i++) {
            var childId = _b[_i];
            var active = (_a = this.children.get(childId)) === null || _a === void 0 ? void 0 : _a.request;
            if (!active)
                continue;
            if (request.readOnly && active.readOnly)
                continue;
            if (!request.readOnly && !active.readOnly && request.targetFile && active.targetFile && request.targetFile !== active.targetFile)
                continue;
            return true;
        }
        return false;
    };
    return SubagentManager;
}());
exports.SubagentManager = SubagentManager;
function abortError() { var error = new Error('Subagent cancelled.'); error.name = 'AbortError'; return error; }
