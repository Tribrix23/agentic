export interface McpToolIdentity {
  serverId: string;
  toolName: string;
}

export function mcpIdentityKey(identity: McpToolIdentity): string {
  return `${identity.serverId.length}:${identity.serverId}${identity.toolName}`;
}

export function mcpDisplayAlias(identity: McpToolIdentity): string {
  const clean = (value: string) => value.replace(/[^a-zA-Z0-9_]/g, '_');
  return `mcp__${clean(identity.serverId)}__${clean(identity.toolName)}`;
}

export function stableMcpAlias(identity: McpToolIdentity, occupied: Set<string>): string {
  const base = mcpDisplayAlias(identity);
  if (!occupied.has(base)) return base;
  let hash = 2166136261;
  for (const char of mcpIdentityKey(identity)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const suffix = (hash >>> 0).toString(36);
  let alias = `${base}__${suffix}`;
  let counter = 2;
  while (occupied.has(alias)) alias = `${base}__${suffix}_${counter++}`;
  return alias;
}