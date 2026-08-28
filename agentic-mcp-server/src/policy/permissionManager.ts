import type { Capability } from "../mcp/types.js";

export class PermissionManager {
  constructor(private readonly granted: ReadonlySet<Capability> = new Set()) {}
  has(capability: Capability): boolean { return this.granted.has(capability); }
  require(capability: Capability): void { if (!this.has(capability)) throw new Error(`Permission denied: ${capability}`); }
  list(): Capability[] { return [...this.granted]; }
}
