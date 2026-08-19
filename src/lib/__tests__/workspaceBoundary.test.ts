import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertChildName, assertPathWithinWorkspace } from '../workspaceBoundary';

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quantix-boundary-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('workspace boundary', () => {
  it('accepts existing and not-yet-created paths below the workspace', () => {
    const root = temporaryRoot();
    const existing = path.join(root, 'src');
    fs.mkdirSync(existing);

    expect(assertPathWithinWorkspace(root, existing)).toBe(fs.realpathSync.native(existing));
    expect(assertPathWithinWorkspace(root, path.join(existing, 'new', 'file.ts')))
      .toBe(path.join(fs.realpathSync.native(existing), 'new', 'file.ts'));
  });

  it('rejects traversal and symlink escapes', () => {
    const root = temporaryRoot();
    const outside = temporaryRoot();

    expect(() => assertPathWithinWorkspace(root, path.join(root, '..', path.basename(outside))))
      .toThrow(/outside the selected workspace/);

    const link = path.join(root, 'outside-link');
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => assertPathWithinWorkspace(root, path.join(link, 'secret.txt')))
      .toThrow(/outside the selected workspace/);
  });

  it('accepts only one path segment for child names', () => {
    expect(assertChildName('file.ts')).toBe('file.ts');
    expect(() => assertChildName('../file.ts')).toThrow(/single file or directory name/);
    expect(() => assertChildName('nested/file.ts')).toThrow(/single file or directory name/);
  });
});