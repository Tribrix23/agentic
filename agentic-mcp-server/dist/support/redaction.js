const SECRET_KEY = /(password|passwd|secret|token|authorization|cookie|api[-_]?key|private[-_]?key|credential|value)/i;
const SECRET_VALUE = /\b(?:bearer\s+)?[A-Za-z0-9_-]{24,}\b/i;
export function redact(value, seen = new WeakSet()) {
    if (typeof value === "string")
        return SECRET_VALUE.test(value) ? "[REDACTED]" : redactUrl(value);
    if (Array.isArray(value))
        return value.map(item => redact(item, seen));
    if (!value || typeof value !== "object")
        return value;
    if (seen.has(value))
        return "[CIRCULAR]";
    seen.add(value);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SECRET_KEY.test(key) ? "[REDACTED]" : redact(item, seen)]));
}
function redactUrl(value) {
    try {
        const url = new URL(value);
        if (url.search || url.hash)
            return `${url.origin}${url.pathname}[REDACTED]`;
        return value;
    }
    catch {
        return value;
    }
}
