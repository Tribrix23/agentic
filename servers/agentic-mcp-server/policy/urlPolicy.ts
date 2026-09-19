import { isIP } from "node:net";
import { ToolFailure } from "../mcp/errors.js";

export class UrlPolicy {
  constructor(private readonly allowlist: readonly string[] = [], private readonly denylist: readonly string[] = []) {}
  canonicalize(input: string): URL {
    let url: URL;
    try { url = new URL(input); } catch { throw new ToolFailure("INVALID_ARGUMENT", "URL is invalid", false, "provide an absolute HTTPS URL"); }
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new ToolFailure("NAVIGATION_BLOCKED", "URL scheme is not permitted", false, "use HTTP or HTTPS");
    if (url.username || url.password) throw new ToolFailure("NAVIGATION_BLOCKED", "URLs with credentials are blocked", false, "remove URL credentials");
    const host = url.hostname.toLowerCase();
    if (isPrivateHost(host)) throw new ToolFailure("NAVIGATION_BLOCKED", "Private and local network targets are blocked", false, "use a public approved origin");
    if (this.denylist.some(pattern => host === pattern || host.endsWith(`.${pattern}`))) throw new ToolFailure("NAVIGATION_BLOCKED", "Origin is denied by policy", false, "choose an approved origin");
    if (this.allowlist.length && !this.allowlist.some(pattern => host === pattern || host.endsWith(`.${pattern}`))) throw new ToolFailure("NAVIGATION_BLOCKED", "Origin is not allowlisted", false, "choose an approved origin");
    url.hash = "";
    return url;
  }
}

function isPrivateHost(host: string): boolean {
  if (["localhost", "localhost.localdomain"].includes(host) || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (isIP(host) === 4) { const [a, b] = host.split(".").map(Number); return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 169 && b === 254; }
  return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
}
