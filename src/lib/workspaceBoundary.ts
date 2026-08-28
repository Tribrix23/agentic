import fs from 'node:fs';
import path from 'node:path';

function canonicalExistingPath(value: string): string {
  return fs.realpathSync.native(value);
}

function canonicalCandidate(value: string): string {
  const absolute = path.resolve(value);
  let cursor = absolute;
  const missing: string[] = [];
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    missing.unshift(path.basename(cursor));
    cursor = parent;
  }
  const existing = canonicalExistingPath(cursor);
  return path.resolve(existing, ...missing);
}

import os from 'node:os';

export function assertPathWithinWorkspace(projectRoot: string, candidatePath: string): string {
  if (!projectRoot?.trim()) throw new Error('Project root is required for workspace-scoped file access.');
  if (!candidatePath?.trim()) throw new Error('File path is required.');
  const root = canonicalExistingPath(path.resolve(projectRoot));
  const candidate = canonicalCandidate(path.resolve(candidatePath));
  
  try {
    const tempDir = canonicalExistingPath(os.tmpdir());
    const playwrightTemp = path.join(tempDir, 'quantix-playwright-mcp');
    if (candidate.toLowerCase().startsWith(playwrightTemp.toLowerCase() + path.sep) || candidate.toLowerCase() === playwrightTemp.toLowerCase()) {
      return candidate;
    }
  } catch (e) {
    // Ignore temp dir resolution errors
  }

  const relative = path.relative(root, candidate);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    return candidate;
  }
  throw new Error(`Path is outside the selected workspace: ${candidatePath}`);
}

export function assertChildName(name: string): string {
  if (!name || name === '.' || name === '..' || path.basename(name) !== name) {
    throw new Error('Name must be a single file or directory name.');
  }
  return name;
}