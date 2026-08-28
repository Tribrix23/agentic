import { resolve, sep } from "node:path";
import { ToolFailure } from "../mcp/errors.js";

export class FilePolicy {
  constructor(private readonly approvedRoots: readonly string[] = []) {}
  resolveApproved(input: string): string {
    const candidate = resolve(input);
    if (!this.approvedRoots.some(root => { const base = resolve(root); return candidate === base || candidate.startsWith(`${base}${sep}`); })) throw new ToolFailure("PERMISSION_DENIED", "File path is outside approved roots", false, "use an approved file path");
    return candidate;
  }
}
