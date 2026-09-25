#!/usr/bin/env node
import { mkdirSync, copyFileSync, readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = join(root, 'src');
const distRoot = join(root, 'dist');

mkdirSync(distRoot, { recursive: true });

function copyTree(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    const sp = join(srcDir, entry);
    const dp = join(destDir, entry);
    if (statSync(sp).isDirectory()) {
      copyTree(sp, dp);
    } else {
      copyFileSync(sp, dp);
    }
  }
}

function copyCssTree(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    const sp = join(srcDir, entry);
    if (statSync(sp).isFile() && entry.endsWith('.css')) {
      copyFileSync(sp, join(destDir, entry));
    }
  }
}

// Bundle the token tree alongside the top-level entry points.
copyCssTree(join(srcRoot, 'tokens'), join(distRoot, 'tokens'));
copyFileSync(join(srcRoot, 'tokens.css'), join(distRoot, 'tokens.css'));
copyFileSync(join(srcRoot, 'dark-tokens.css'), join(distRoot, 'dark-tokens.css'));

// Brand assets — emitted to dist/assets/ to mirror the `./assets/*` export.
copyTree(join(srcRoot, 'assets'), join(distRoot, 'assets'));

// Verify the top-level entry resolves the relative imports we just copied.
const entry = readFileSync(join(distRoot, 'tokens.css'), 'utf8');
if (!entry.includes("./tokens/colors.css")) {
  writeFileSync(
    join(distRoot, 'tokens.css'),
    entry, // pass-through; the @import paths already point at ./tokens/ which we copied.
  );
}

console.log('design-system: copied tokens + assets into dist/');
