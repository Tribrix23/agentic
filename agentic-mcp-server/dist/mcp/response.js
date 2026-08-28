import { boundText } from "../support/limits.js";
export function success(data, options = {}) {
    return { ok: true, data, diagnostics: [], ...options };
}
export function failure(code, action, retryable = false, details) {
    return { ok: false, diagnostics: [{ code, action, retryable, details }] };
}
export function boundResponse(response, limits) {
    const json = JSON.stringify(response.data ?? null);
    const bounded = boundText(json, limits.maxChars);
    if (!bounded.truncated)
        return response;
    return { ...response, data: { summary: bounded.value }, observation: { source: "page", untrusted: true, truncated: true } };
}
