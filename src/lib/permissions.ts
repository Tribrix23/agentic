// ============================================================================
// Permissions Engine — Security enforcement for agentic tool execution
// ============================================================================

export interface PermissionRule {
  type: 'file_read' | 'file_write' | 'terminal' | 'network' | 'git';
  pattern: string;
  action: 'allow' | 'deny' | 'ask';
}

export interface PermissionConfig {
  securityPreset: 'full' | 'user_guided' | 'semi' | 'default';
  rules: PermissionRule[];
  deniedPaths: string[];
  allowedCommands: string[];
  blockedCommands: string[];
}

export interface PermissionAuditEntry {
  timestamp: number;
  toolName: string;
  action: 'allow' | 'deny' | 'ask';
  reason: string;
  args: Record<string, any>;
  decision?: 'approved' | 'rejected';
}

// ── Default blocked paths ──────────────────────────────────────────────────
const DEFAULT_DENIED_PATHS = [
  '**/.env',
  '**/.env.*',
  '**/*.key',
  '**/*.pem',
  '**/*.secret',
  '**/*.p12',
  '**/*.pfx',
  '**/id_rsa',
  '**/id_ed25519',
  '**/.git/objects/**',
  '**/.git/refs/**',
];

// ── Default blocked commands ───────────────────────────────────────────────
const DEFAULT_BLOCKED_COMMANDS = [
  'rm -rf /',
  'rm -rf /*',
  'rm -rf ~',
  'del /s /q c:\\',
  'format',
  'shutdown',
  'reboot',
  'halt',
  'poweroff',
  'mkfs',
  ':(){:|:&};:',
  'dd if=/dev/zero',
  'dd if=/dev/random',
  '> /dev/sda',
  'wget http', // Prevent arbitrary downloads (user can override)
  'curl http', // Prevent arbitrary downloads (user can override)
];

// ── Default permission config ──────────────────────────────────────────────
export const DEFAULT_PERMISSION_CONFIG: PermissionConfig = {
  securityPreset: 'default',
  rules: [],
  deniedPaths: [...DEFAULT_DENIED_PATHS],
  allowedCommands: [],
  blockedCommands: [...DEFAULT_BLOCKED_COMMANDS],
};

// ── Persistence ────────────────────────────────────────────────────────────
const PERMISSION_KEY_PREFIX = 'quantix_permissions';
const AUDIT_KEY_PREFIX = 'quantix_permission_audit';

function getPermissionKey(projectId?: string): string {
  return projectId ? `${PERMISSION_KEY_PREFIX}_${projectId}` : PERMISSION_KEY_PREFIX;
}

function getAuditKey(projectId?: string): string {
  return projectId ? `${AUDIT_KEY_PREFIX}_${projectId}` : AUDIT_KEY_PREFIX;
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Load permission config for a project */
export function getPermissionConfig(projectId?: string): PermissionConfig {
  try {
    const raw = localStorage.getItem(getPermissionKey(projectId));
    if (raw) {
      const saved = JSON.parse(raw) as Partial<PermissionConfig>;
      return {
        ...DEFAULT_PERMISSION_CONFIG,
        ...saved,
        deniedPaths: [...DEFAULT_DENIED_PATHS, ...(saved.deniedPaths || [])],
        blockedCommands: [...DEFAULT_BLOCKED_COMMANDS, ...(saved.blockedCommands || [])],
      };
    }
  } catch (e) {
    console.warn('[Permissions] Failed to load config:', e);
  }
  return { ...DEFAULT_PERMISSION_CONFIG };
}

/** Save permission config */
export function setPermissionConfig(config: Partial<PermissionConfig>, projectId?: string): void {
  const current = getPermissionConfig(projectId);
  const updated = { ...current, ...config };
  try {
    localStorage.setItem(getPermissionKey(projectId), JSON.stringify(updated));
  } catch (e) {
    console.warn('[Permissions] Failed to save config:', e);
  }
}

/**
 * Check if a tool call is allowed, denied, or needs approval.
 *
 * Evaluation order:
 * 1. Explicit deny rules → always deny
 * 2. Explicit allow rules → always allow
 * 3. Security preset defaults
 */
export function checkPermission(
  toolName: string,
  args: Record<string, any>,
  config: PermissionConfig
): 'allow' | 'deny' | 'ask' {
  const filePath = args.path || args.filePath || '';
  const command = args.command || '';

  // ── 1. Check denied paths ────────────────────────────────────────────
  if (filePath && isPathDenied(filePath, config.deniedPaths)) {
    logAudit(toolName, 'deny', 'Path matches denied pattern', args);
    return 'deny';
  }

  // ── 2. Check blocked commands ────────────────────────────────────────
  if (command && isCommandBlocked(command, config.blockedCommands)) {
    logAudit(toolName, 'deny', 'Command matches blocked pattern', args);
    return 'deny';
  }

  // ── 3. Check explicit rules ──────────────────────────────────────────
  const toolType = getToolPermissionType(toolName);
  for (const rule of config.rules) {
    if (rule.type !== toolType) continue;

    if (filePath && matchesGlob(filePath, rule.pattern)) {
      logAudit(toolName, rule.action, `Matched rule: ${rule.pattern}`, args);
      return rule.action;
    }

    if (command && matchesGlob(command, rule.pattern)) {
      logAudit(toolName, rule.action, `Matched command rule: ${rule.pattern}`, args);
      return rule.action;
    }
  }

  // ── 4. Fall back to security preset ──────────────────────────────────
  return getPresetDefault(toolName, config.securityPreset);
}

/** Get the permission type category for a tool */
function getToolPermissionType(toolName: string): PermissionRule['type'] {
  const map: Record<string, PermissionRule['type']> = {
    readFile: 'file_read',
    listDirectory: 'file_read',
    searchFiles: 'file_read',
    codeAnalysis: 'file_read',
    writeFile: 'file_write',
    editFile: 'file_write',
    createFile: 'file_write',
    deleteFile: 'file_write',
    runCommand: 'terminal',
    gitStatus: 'git',
    gitAdd: 'git',
    gitCommit: 'git',
    gitDiff: 'git',
    webSearch: 'network',
    readUrl: 'network',
  };
  return map[toolName] || 'terminal';
}

/** Get the default permission action based on security preset */
function getPresetDefault(
  toolName: string,
  preset: PermissionConfig['securityPreset']
): 'allow' | 'deny' | 'ask' {
  const permType = getToolPermissionType(toolName);

  switch (preset) {
    case 'full':
      return 'allow';

    case 'user_guided':
      return 'ask';

    case 'semi':
    case 'default':
    default:
      if (permType === 'file_read' || permType === 'git') return 'allow';
      return 'ask';
  }
}

// ── Glob matching (simplified) ─────────────────────────────────────────────

function matchesGlob(input: string, pattern: string): boolean {
  // Normalize path separators
  const normalizedInput = input.replace(/\\/g, '/').toLowerCase();
  const normalizedPattern = pattern.replace(/\\/g, '/').toLowerCase();

  // Convert glob to regex
  const regexStr = normalizedPattern
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*');

  try {
    const regex = new RegExp(`^${regexStr}$`);
    return regex.test(normalizedInput);
  } catch {
    return normalizedInput.includes(normalizedPattern);
  }
}

function isPathDenied(filePath: string, deniedPaths: string[]): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  for (const pattern of deniedPaths) {
    if (matchesGlob(normalized, pattern)) return true;
    // Also check if the filename alone matches
    const fileName = normalized.split('/').pop() || '';
    if (matchesGlob(fileName, pattern)) return true;
  }
  return false;
}

function isCommandBlocked(command: string, blockedCommands: string[]): boolean {
  const lower = command.toLowerCase().trim();
  for (const blocked of blockedCommands) {
    if (lower.startsWith(blocked.toLowerCase())) return true;
    if (lower.includes(blocked.toLowerCase())) return true;
  }
  return false;
}

// ── Audit logging ──────────────────────────────────────────────────────────

const MAX_AUDIT_ENTRIES = 500;

function logAudit(
  toolName: string,
  action: 'allow' | 'deny' | 'ask',
  reason: string,
  args: Record<string, any>,
  projectId?: string
): void {
  try {
    const key = getAuditKey(projectId);
    const raw = localStorage.getItem(key);
    const entries: PermissionAuditEntry[] = raw ? JSON.parse(raw) : [];

    entries.push({
      timestamp: Date.now(),
      toolName,
      action,
      reason,
      args: sanitizeArgsForAudit(args),
    });

    // Keep only the latest entries
    if (entries.length > MAX_AUDIT_ENTRIES) {
      entries.splice(0, entries.length - MAX_AUDIT_ENTRIES);
    }

    localStorage.setItem(key, JSON.stringify(entries));
  } catch (e) {
    // Non-critical — don't break execution if audit fails
  }
}

/** Get audit log entries */
export function getAuditLog(projectId?: string): PermissionAuditEntry[] {
  try {
    const raw = localStorage.getItem(getAuditKey(projectId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Clear audit log */
export function clearAuditLog(projectId?: string): void {
  try {
    localStorage.removeItem(getAuditKey(projectId));
  } catch {
    // ignore
  }
}

/** Sanitize tool arguments for safe audit logging (truncate large values) */
function sanitizeArgsForAudit(args: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string' && value.length > 200) {
      sanitized[key] = value.slice(0, 200) + '...[truncated]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
