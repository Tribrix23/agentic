import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { CheckpointChange, CheckpointChangeType, GitCheckpointManifestResult } from './gitCheckpointTypes';

function runGit(args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      env: { ...process.env, ...env },
      windowsHide: true,
      shell: false,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)));
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve(Buffer.concat(stdout).toString('utf8'));
      else reject(new Error(Buffer.concat(stderr).toString('utf8').trim() || `git exited with code ${code}`));
    });
  });
}

function parseNameStatus(output: string): Array<{ path: string; type: CheckpointChangeType }> {
  const fields = output.split('\0').filter(Boolean);
  const changes: Array<{ path: string; type: CheckpointChangeType }> = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++].charAt(0);
    const filePath = fields[index++];
    if (!filePath) continue;
    const type: CheckpointChangeType = status === 'A' ? 'created' : status === 'D' ? 'deleted' : 'modified';
    changes.push({ path: filePath, type });
  }
  return changes;
}

function parseNumstat(output: string): Map<string, Pick<CheckpointChange, 'added' | 'removed' | 'binary'>> {
  const stats = new Map<string, Pick<CheckpointChange, 'added' | 'removed' | 'binary'>>();
  for (const record of output.split('\0').filter(Boolean)) {
    const [added, removed, ...pathParts] = record.split('\t');
    const filePath = pathParts.join('\t');
    if (!filePath) continue;
    if (added === '-' || removed === '-') stats.set(filePath, { binary: true });
    else stats.set(filePath, { added: Number(added), removed: Number(removed) });
  }
  return stats;
}

export async function getGitCheckpointManifest(projectRoot: string, commit: string): Promise<GitCheckpointManifestResult> {
  let temporaryIndex = '';
  try {
    const root = (await runGit(['rev-parse', '--show-toplevel'], projectRoot)).trim();
    await runGit(['cat-file', '-e', `${commit}^{commit}`], root);
    const gitDir = (await runGit(['rev-parse', '--git-dir'], root)).trim();
    const absoluteGitDir = path.isAbsolute(gitDir) ? gitDir : path.join(root, gitDir);
    temporaryIndex = path.join(absoluteGitDir, `quantix-manifest-index-${process.pid}-${Date.now()}`);
    const env = { GIT_INDEX_FILE: temporaryIndex };

    await runGit(['read-tree', commit], root, env);
    await runGit(['add', '-A', '--', '.'], root, env);
    const currentTree = (await runGit(['write-tree'], root, env)).trim();
    const nameStatus = await runGit(
      ['diff-tree', '-r', '--no-commit-id', '--no-renames', '--name-status', '-z', commit, currentTree],
      root,
    );
    const numstat = await runGit(
      ['diff-tree', '-r', '--no-commit-id', '--no-renames', '--numstat', '-z', commit, currentTree],
      root,
    );
    const stats = parseNumstat(numstat);
    const changes = parseNameStatus(nameStatus).map(change => ({ ...change, ...stats.get(change.path) }));
    return { success: true, changes };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (temporaryIndex) fs.rmSync(temporaryIndex, { force: true });
  }
}
