import { randomBytes } from "node:crypto";
export function createId(prefix) {
    return `${prefix}_${randomBytes(12).toString("base64url")}`;
}
export function isOpaqueId(value, prefix) {
    if (typeof value !== "string")
        return false;
    const expected = prefix ? `${prefix}_` : "(?:rt|bs|pg|el|rs|ev|art)_";
    return new RegExp(`^${expected}[A-Za-z0-9_-]{16}$`).test(value);
}
